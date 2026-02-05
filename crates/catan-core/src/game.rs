//! Core game state machine.
//!
//! This module contains the main `GameState` struct and all game logic.

use crate::actions::{GameAction, GameEvent, TradeOffer};
use crate::board::{Board, EdgeBuilding, Harbor, PlayerId, Resource, TileType};
use crate::hex::{EdgeCoord, HexCoord, VertexCoord};
use crate::player::{DevelopmentCard, Player, ResourceHand};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;

/// Minimum road length for Longest Road
const MIN_LONGEST_ROAD: u32 = 5;

/// Minimum knights for Largest Army
const MIN_LARGEST_ARMY: u32 = 3;

/// Victory points needed to win
const VICTORY_POINTS_TO_WIN: u32 = 10;

/// Game phase
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum GamePhase {
    /// Initial placement phase
    Setup {
        /// Which round of setup (1 or 2)
        round: u8,
        /// What we're currently placing
        placing: SetupPlacing,
    },

    /// Before rolling dice at start of turn
    PreRoll,

    /// After rolling 7, must move robber
    RobberMoveRequired,

    /// After moving robber, choose player to steal from
    RobberSteal {
        /// Where the robber was moved to
        target_hex: HexCoord,
        /// Players that can be stolen from
        victims: Vec<PlayerId>,
    },

    /// Players must discard half their cards (rolled 7, >7 cards)
    DiscardRequired {
        /// Players who still need to discard
        players_remaining: Vec<PlayerId>,
    },

    /// Main phase - can trade, build, buy dev cards, end turn
    MainPhase,

    /// Playing road building card - need to place 2 roads
    RoadBuildingInProgress {
        /// How many roads left to place (2 or 1)
        roads_remaining: u8,
    },

    /// Game is over
    Finished {
        winner: PlayerId,
    },
}

/// What we're placing during setup
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SetupPlacing {
    Settlement,
    Road,
}

/// Errors that can occur when applying actions
#[derive(Debug, Clone, Error, Serialize, Deserialize)]
pub enum GameError {
    #[error("Not your turn")]
    NotYourTurn,

    #[error("Invalid action for current phase")]
    InvalidPhase,

    #[error("Invalid placement location")]
    InvalidLocation,

    #[error("Cannot afford this")]
    CannotAfford,

    #[error("No pieces remaining")]
    NoPiecesRemaining,

    #[error("No development cards left in deck")]
    EmptyDeck,

    #[error("Don't have that card")]
    NoSuchCard,

    #[error("Invalid trade")]
    InvalidTrade,

    #[error("No active trade")]
    NoActiveTrade,

    #[error("Invalid discard")]
    InvalidDiscard,

    #[error("Game is over")]
    GameOver,
}

/// Trade state during a turn
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeState {
    /// Current active offer
    pub offer: TradeOffer,
    /// Responses from players
    pub responses: HashMap<PlayerId, TradeResponse>,
}

/// Response to a trade offer
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TradeResponse {
    Pending,
    Accepted,
    Rejected,
}

/// The complete game state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameState {
    /// The game board
    pub board: Board,
    /// All players
    pub players: Vec<Player>,
    /// Current player index
    pub current_player: PlayerId,
    /// Current game phase
    pub phase: GamePhase,
    /// Turn number (starts at 1)
    pub turn_number: u32,
    /// Last dice roll
    pub dice_roll: Option<(u8, u8)>,
    /// Development card deck
    pub dev_card_deck: Vec<DevelopmentCard>,
    /// Active trade offer
    pub pending_trade: Option<TradeState>,
    /// Whether a dev card has been played this turn
    pub dev_card_played_this_turn: bool,
    /// Setup phase tracking: which settlement was just placed
    setup_settlement: Option<VertexCoord>,
    /// Random number generator seed (for deterministic replays)
    rng_seed: u64,
}

impl GameState {
    /// Create a new game with the given number of players
    pub fn new(player_count: u8, player_names: Vec<String>) -> Self {
        assert!((2..=4).contains(&player_count), "Must have 2-4 players");
        assert_eq!(
            player_names.len(),
            player_count as usize,
            "Must provide names for all players"
        );

        let players: Vec<Player> = player_names
            .into_iter()
            .enumerate()
            .map(|(i, name)| Player::new(i as PlayerId, name))
            .collect();

        // Create and shuffle dev card deck
        let mut dev_card_deck = DevelopmentCard::standard_deck();
        let mut rng = rand::thread_rng();
        let rng_seed = rng.gen();
        DevelopmentCard::shuffle_deck(&mut dev_card_deck, &mut rng);

        // First player is random
        let current_player = rng.gen_range(0..player_count);

        Self {
            board: Board::standard(),
            players,
            current_player,
            phase: GamePhase::Setup {
                round: 1,
                placing: SetupPlacing::Settlement,
            },
            turn_number: 0,
            dice_roll: None,
            dev_card_deck,
            pending_trade: None,
            dev_card_played_this_turn: false,
            setup_settlement: None,
            rng_seed,
        }
    }

    /// Create a standard 4-player game
    pub fn new_standard_4player() -> Self {
        Self::new(
            4,
            vec![
                "Player 1".to_string(),
                "Player 2".to_string(),
                "Player 3".to_string(),
                "Player 4".to_string(),
            ],
        )
    }

    /// Get the number of players
    pub fn player_count(&self) -> usize {
        self.players.len()
    }

    /// Get a player by ID
    pub fn get_player(&self, id: PlayerId) -> Option<&Player> {
        self.players.get(id as usize)
    }

    /// Get a mutable player by ID
    fn get_player_mut(&mut self, id: PlayerId) -> Option<&mut Player> {
        self.players.get_mut(id as usize)
    }

    /// Calculate total victory points for a player (including buildings on board)
    pub fn total_victory_points(&self, player_id: PlayerId) -> u32 {
        let player = match self.get_player(player_id) {
            Some(p) => p,
            None => return 0,
        };

        let mut vp = player.victory_points(); // Achievements + VP cards

        // Count buildings on board
        let settlements = 5 - player.settlements_remaining + player.cities_remaining - 4;
        let cities = 4 - player.cities_remaining;

        vp += settlements; // 1 VP each
        vp += cities * 2; // 2 VP each

        vp
    }

    /// Check if the game is finished
    pub fn is_finished(&self) -> bool {
        matches!(self.phase, GamePhase::Finished { .. })
    }

    /// Get the winner if the game is finished
    pub fn get_winner(&self) -> Option<PlayerId> {
        if let GamePhase::Finished { winner } = self.phase {
            Some(winner)
        } else {
            None
        }
    }

    /// Check if any player has won
    fn check_winner(&self) -> Option<PlayerId> {
        for player in &self.players {
            if self.total_victory_points(player.id) >= VICTORY_POINTS_TO_WIN {
                return Some(player.id);
            }
        }
        None
    }

    /// Get all currently valid actions for a player
    pub fn valid_actions(&self, player: PlayerId) -> Vec<GameAction> {
        let mut actions = Vec::new();

        match &self.phase {
            GamePhase::Finished { .. } => {
                // No actions when game is over
            }

            GamePhase::Setup { placing, .. } => {
                if player != self.current_player {
                    return actions;
                }

                match placing {
                    SetupPlacing::Settlement => {
                        for vertex in self.board.valid_settlement_spots(player, true) {
                            actions.push(GameAction::PlaceInitialSettlement(vertex));
                        }
                    }
                    SetupPlacing::Road => {
                        if let Some(settlement) = self.setup_settlement {
                            for edge in settlement.touching_edges() {
                                if self.board.get_edge(&edge) == EdgeBuilding::Empty
                                    && self.board.is_land_edge(&edge)
                                {
                                    actions.push(GameAction::PlaceInitialRoad(edge));
                                }
                            }
                        }
                    }
                }
            }

            GamePhase::PreRoll => {
                if player != self.current_player {
                    return actions;
                }
                actions.push(GameAction::RollDice);

                // Can play knight before rolling
                if !self.dev_card_played_this_turn {
                    if let Some(p) = self.get_player(player) {
                        if p.has_playable_dev_card(DevelopmentCard::Knight) {
                            actions.push(GameAction::PlayKnight);
                        }
                    }
                }
            }

            GamePhase::DiscardRequired {
                players_remaining, ..
            } => {
                if players_remaining.contains(&player) {
                    if let Some(p) = self.get_player(player) {
                        if p.resources.total() > 7 {
                            // Player needs to discard - we can't enumerate all possibilities
                            // Just indicate that DiscardCards is valid
                            // The actual validation happens in apply_action
                            actions.push(GameAction::DiscardCards(ResourceHand::new()));
                        }
                    }
                }
            }

            GamePhase::RobberMoveRequired => {
                if player != self.current_player {
                    return actions;
                }

                // Can move robber to any land tile except current location
                for tile in self.board.land_tiles() {
                    if tile.coord != self.board.robber_location()
                        && !matches!(tile.tile_type, TileType::Ocean)
                    {
                        actions.push(GameAction::MoveRobber(tile.coord));
                    }
                }
            }

            GamePhase::RobberSteal { victims, .. } => {
                if player != self.current_player {
                    return actions;
                }

                for victim in victims {
                    actions.push(GameAction::StealFrom(*victim));
                }
            }

            GamePhase::MainPhase => {
                if player != self.current_player {
                    // Non-current players can only respond to trades
                    if let Some(trade) = &self.pending_trade {
                        if trade.offer.to.is_none() || trade.offer.to == Some(player) {
                            actions.push(GameAction::AcceptTrade);
                            actions.push(GameAction::RejectTrade);
                        }
                    }
                    return actions;
                }

                // Can always end turn
                actions.push(GameAction::EndTurn);

                if let Some(p) = self.get_player(player) {
                    // Building actions
                    if p.can_afford_road() {
                        for edge in self.board.valid_road_spots(player) {
                            actions.push(GameAction::BuildRoad(edge));
                        }
                    }

                    if p.can_afford_settlement() {
                        for vertex in self.board.valid_settlement_spots(player, false) {
                            actions.push(GameAction::BuildSettlement(vertex));
                        }
                    }

                    if p.can_afford_city() {
                        for vertex in self.board.valid_city_spots(player) {
                            actions.push(GameAction::BuildCity(vertex));
                        }
                    }

                    if p.can_afford_dev_card() && !self.dev_card_deck.is_empty() {
                        actions.push(GameAction::BuyDevelopmentCard);
                    }

                    // Development cards
                    if !self.dev_card_played_this_turn {
                        if p.has_playable_dev_card(DevelopmentCard::Knight) {
                            actions.push(GameAction::PlayKnight);
                        }
                        if p.has_playable_dev_card(DevelopmentCard::RoadBuilding)
                            && p.roads_remaining >= 2
                        {
                            // Road building requires specifying both roads
                            // We'd need to enumerate pairs - simplified for now
                        }
                        if p.has_playable_dev_card(DevelopmentCard::YearOfPlenty) {
                            for r1 in Resource::ALL {
                                for r2 in Resource::ALL {
                                    actions.push(GameAction::PlayYearOfPlenty(r1, r2));
                                }
                            }
                        }
                        if p.has_playable_dev_card(DevelopmentCard::Monopoly) {
                            for r in Resource::ALL {
                                actions.push(GameAction::PlayMonopoly(r));
                            }
                        }
                    }

                    // Maritime trading
                    let harbors = self.board.player_harbors(player);
                    for give_resource in Resource::ALL {
                        let give_count = self.get_maritime_rate(player, give_resource, &harbors);
                        if p.resources.get(give_resource) >= give_count {
                            for receive_resource in Resource::ALL {
                                if receive_resource != give_resource {
                                    actions.push(GameAction::MaritimeTrade {
                                        give: give_resource,
                                        give_count,
                                        receive: receive_resource,
                                    });
                                }
                            }
                        }
                    }
                }

                // Trade management
                if self.pending_trade.is_some() {
                    actions.push(GameAction::CancelTrade);
                }
            }

            GamePhase::RoadBuildingInProgress { .. } => {
                if player != self.current_player {
                    return actions;
                }

                // Must place roads
                let p = self.get_player(player).unwrap();
                if p.roads_remaining > 0 {
                    for edge in self.board.valid_road_spots(player) {
                        actions.push(GameAction::BuildRoad(edge));
                    }
                }
            }
        }

        actions
    }

    /// Get the maritime trade rate for a resource
    fn get_maritime_rate(
        &self,
        _player: PlayerId,
        resource: Resource,
        harbors: &[Harbor],
    ) -> u32 {
        // Check for 2:1 specific harbor
        if harbors.contains(&Harbor::Specific(resource)) {
            return 2;
        }
        // Check for 3:1 generic harbor
        if harbors.contains(&Harbor::Generic) {
            return 3;
        }
        // Default 4:1
        4
    }

    /// Apply an action to the game state
    pub fn apply_action(
        &mut self,
        player: PlayerId,
        action: GameAction,
    ) -> Result<Vec<GameEvent>, GameError> {
        // Check game not over
        if matches!(self.phase, GamePhase::Finished { .. }) {
            return Err(GameError::GameOver);
        }

        let mut events = Vec::new();

        match action {
            // ==================== Setup Phase ====================
            GameAction::PlaceInitialSettlement(vertex) => {
                self.validate_setup_settlement(player, vertex)?;

                self.board.place_settlement(vertex, player);
                self.get_player_mut(player).unwrap().settlements_remaining -= 1;
                self.setup_settlement = Some(vertex);

                events.push(GameEvent::SettlementBuilt {
                    player,
                    location: vertex,
                });

                // In round 2, give resources for second settlement
                if let GamePhase::Setup { round: 2, .. } = self.phase {
                    // Collect resources first to avoid borrow issues
                    let resources_to_give: Vec<Resource> = self
                        .board
                        .tiles_at_vertex(&vertex)
                        .iter()
                        .filter_map(|tile| tile.resource())
                        .collect();

                    let mut resources_given = Vec::new();
                    for resource in resources_to_give {
                        self.get_player_mut(player).unwrap().resources.add(resource, 1);
                        resources_given.push((player, resource, 1));
                    }
                    if !resources_given.is_empty() {
                        events.push(GameEvent::ResourcesDistributed {
                            distributions: resources_given,
                        });
                    }
                }

                self.phase = GamePhase::Setup {
                    round: match self.phase {
                        GamePhase::Setup { round, .. } => round,
                        _ => 1,
                    },
                    placing: SetupPlacing::Road,
                };
            }

            GameAction::PlaceInitialRoad(edge) => {
                self.validate_setup_road(player, edge)?;

                self.board.place_road(edge, player);
                self.get_player_mut(player).unwrap().roads_remaining -= 1;
                self.setup_settlement = None;

                events.push(GameEvent::RoadBuilt {
                    player,
                    location: edge,
                });

                // Advance setup phase
                events.extend(self.advance_setup_phase());
            }

            // ==================== Dice Rolling ====================
            GameAction::RollDice => {
                if player != self.current_player {
                    return Err(GameError::NotYourTurn);
                }
                if self.phase != GamePhase::PreRoll {
                    return Err(GameError::InvalidPhase);
                }

                let mut rng = rand::thread_rng();
                let die1 = rng.gen_range(1..=6);
                let die2 = rng.gen_range(1..=6);
                let total = die1 + die2;

                self.dice_roll = Some((die1, die2));

                events.push(GameEvent::DiceRolled {
                    player,
                    roll: (die1, die2),
                    total,
                });

                if total == 7 {
                    // Check for players who need to discard
                    let must_discard: Vec<PlayerId> = self
                        .players
                        .iter()
                        .filter(|p| p.resources.total() > 7)
                        .map(|p| p.id)
                        .collect();

                    if !must_discard.is_empty() {
                        self.phase = GamePhase::DiscardRequired {
                            players_remaining: must_discard,
                        };
                    } else {
                        self.phase = GamePhase::RobberMoveRequired;
                    }
                } else {
                    // Distribute resources
                    let distribution = self.board.resources_for_roll(total);
                    let mut dist_events = Vec::new();

                    for (pid, resources) in distribution {
                        for (resource, amount) in resources {
                            self.get_player_mut(pid).unwrap().resources.add(resource, amount);
                            dist_events.push((pid, resource, amount));
                        }
                    }

                    if !dist_events.is_empty() {
                        events.push(GameEvent::ResourcesDistributed {
                            distributions: dist_events,
                        });
                    }

                    self.phase = GamePhase::MainPhase;
                }
            }

            // ==================== Discard ====================
            GameAction::DiscardCards(cards) => {
                // First, check phase and get info without holding mutable borrow
                let required = {
                    if let GamePhase::DiscardRequired {
                        ref players_remaining,
                    } = self.phase
                    {
                        if !players_remaining.contains(&player) {
                            return Err(GameError::NotYourTurn);
                        }

                        let p = self.get_player(player).unwrap();
                        let required = p.resources.total() / 2;

                        if cards.total() != required {
                            return Err(GameError::InvalidDiscard);
                        }

                        if !p.resources.can_afford(&cards) {
                            return Err(GameError::InvalidDiscard);
                        }

                        required
                    } else {
                        return Err(GameError::InvalidPhase);
                    }
                };

                // Now do the mutations
                self.get_player_mut(player)
                    .unwrap()
                    .resources
                    .subtract(&cards);

                events.push(GameEvent::CardsDiscarded {
                    player,
                    count: required,
                });

                // Update phase
                if let GamePhase::DiscardRequired {
                    ref mut players_remaining,
                } = self.phase
                {
                    players_remaining.retain(|&p| p != player);

                    if players_remaining.is_empty() {
                        self.phase = GamePhase::RobberMoveRequired;
                    }
                }
            }

            // ==================== Robber ====================
            GameAction::MoveRobber(hex) => {
                if player != self.current_player {
                    return Err(GameError::NotYourTurn);
                }
                if self.phase != GamePhase::RobberMoveRequired {
                    return Err(GameError::InvalidPhase);
                }

                // Validate: must be land tile, not current location
                let tile = self.board.get_tile(&hex);
                if tile.is_none() || matches!(tile.unwrap().tile_type, TileType::Ocean) {
                    return Err(GameError::InvalidLocation);
                }
                if hex == self.board.robber_location() {
                    return Err(GameError::InvalidLocation);
                }

                let old_location = self.board.robber_location();
                self.board.move_robber(hex);

                events.push(GameEvent::RobberMoved {
                    player,
                    from: old_location,
                    to: hex,
                });

                // Find potential victims
                let victims: Vec<PlayerId> = self
                    .board
                    .players_adjacent_to_hex(&hex)
                    .into_iter()
                    .filter(|&p| p != player && self.get_player(p).unwrap().resources.total() > 0)
                    .collect();

                if victims.is_empty() {
                    self.phase = GamePhase::MainPhase;
                } else if victims.len() == 1 {
                    // Auto-steal if only one victim
                    let victim = victims[0];
                    events.extend(self.steal_from_player(player, victim)?);
                    self.phase = GamePhase::MainPhase;
                } else {
                    self.phase = GamePhase::RobberSteal {
                        target_hex: hex,
                        victims,
                    };
                }
            }

            GameAction::StealFrom(victim) => {
                if player != self.current_player {
                    return Err(GameError::NotYourTurn);
                }
                if let GamePhase::RobberSteal { victims, .. } = &self.phase {
                    if !victims.contains(&victim) {
                        return Err(GameError::InvalidLocation);
                    }
                } else {
                    return Err(GameError::InvalidPhase);
                }

                events.extend(self.steal_from_player(player, victim)?);
                self.phase = GamePhase::MainPhase;
            }

            // ==================== Building ====================
            GameAction::BuildRoad(edge) => {
                if player != self.current_player {
                    return Err(GameError::NotYourTurn);
                }

                let is_road_building =
                    matches!(self.phase, GamePhase::RoadBuildingInProgress { .. });
                if !is_road_building && self.phase != GamePhase::MainPhase {
                    return Err(GameError::InvalidPhase);
                }

                // Validate location
                if !self.board.valid_road_spots(player).contains(&edge) {
                    return Err(GameError::InvalidLocation);
                }

                let p = self.get_player_mut(player).unwrap();
                if p.roads_remaining == 0 {
                    return Err(GameError::NoPiecesRemaining);
                }

                if !is_road_building {
                    if !p.can_afford_road() {
                        return Err(GameError::CannotAfford);
                    }
                    p.buy_road();
                } else {
                    p.roads_remaining -= 1;
                }

                self.board.place_road(edge, player);

                events.push(GameEvent::RoadBuilt {
                    player,
                    location: edge,
                });

                // Check longest road
                events.extend(self.check_longest_road());

                // Handle road building phase
                if let GamePhase::RoadBuildingInProgress { roads_remaining } = &mut self.phase {
                    *roads_remaining -= 1;
                    if *roads_remaining == 0 {
                        self.phase = GamePhase::MainPhase;
                    }
                }
            }

            GameAction::BuildSettlement(vertex) => {
                if player != self.current_player {
                    return Err(GameError::NotYourTurn);
                }
                if self.phase != GamePhase::MainPhase {
                    return Err(GameError::InvalidPhase);
                }

                if !self.board.valid_settlement_spots(player, false).contains(&vertex) {
                    return Err(GameError::InvalidLocation);
                }

                let p = self.get_player_mut(player).unwrap();
                if !p.can_afford_settlement() {
                    return Err(GameError::CannotAfford);
                }

                p.buy_settlement();
                self.board.place_settlement(vertex, player);

                events.push(GameEvent::SettlementBuilt {
                    player,
                    location: vertex,
                });

                // Building can break opponent's longest road
                events.extend(self.check_longest_road());
                events.extend(self.check_win_condition());
            }

            GameAction::BuildCity(vertex) => {
                if player != self.current_player {
                    return Err(GameError::NotYourTurn);
                }
                if self.phase != GamePhase::MainPhase {
                    return Err(GameError::InvalidPhase);
                }

                if !self.board.valid_city_spots(player).contains(&vertex) {
                    return Err(GameError::InvalidLocation);
                }

                let p = self.get_player_mut(player).unwrap();
                if !p.can_afford_city() {
                    return Err(GameError::CannotAfford);
                }

                p.buy_city();
                self.board.upgrade_to_city(vertex, player);

                events.push(GameEvent::CityBuilt {
                    player,
                    location: vertex,
                });

                events.extend(self.check_win_condition());
            }

            GameAction::BuyDevelopmentCard => {
                if player != self.current_player {
                    return Err(GameError::NotYourTurn);
                }
                if self.phase != GamePhase::MainPhase {
                    return Err(GameError::InvalidPhase);
                }

                if self.dev_card_deck.is_empty() {
                    return Err(GameError::EmptyDeck);
                }

                // Check affordability first
                {
                    let p = self.get_player(player).unwrap();
                    if !p.can_afford_dev_card() {
                        return Err(GameError::CannotAfford);
                    }
                }

                let card = self.dev_card_deck.pop().unwrap();
                self.get_player_mut(player).unwrap().buy_dev_card(card);

                events.push(GameEvent::DevelopmentCardPurchased { player });

                events.extend(self.check_win_condition());
            }

            // ==================== Development Cards ====================
            GameAction::PlayKnight => {
                if player != self.current_player {
                    return Err(GameError::NotYourTurn);
                }
                if self.dev_card_played_this_turn {
                    return Err(GameError::InvalidPhase);
                }
                if !matches!(self.phase, GamePhase::PreRoll | GamePhase::MainPhase) {
                    return Err(GameError::InvalidPhase);
                }

                let p = self.get_player_mut(player).unwrap();
                if !p.play_dev_card(DevelopmentCard::Knight) {
                    return Err(GameError::NoSuchCard);
                }

                self.dev_card_played_this_turn = true;

                events.push(GameEvent::KnightPlayed { player });

                // Check largest army
                events.extend(self.check_largest_army());

                // Move robber
                self.phase = GamePhase::RobberMoveRequired;
            }

            GameAction::PlayRoadBuilding(_edge1, _edge2) => {
                if player != self.current_player {
                    return Err(GameError::NotYourTurn);
                }
                if self.phase != GamePhase::MainPhase {
                    return Err(GameError::InvalidPhase);
                }
                if self.dev_card_played_this_turn {
                    return Err(GameError::InvalidPhase);
                }

                let p = self.get_player_mut(player).unwrap();
                if !p.play_dev_card(DevelopmentCard::RoadBuilding) {
                    return Err(GameError::NoSuchCard);
                }

                self.dev_card_played_this_turn = true;

                events.push(GameEvent::RoadBuildingPlayed { player });

                // Place the roads
                self.phase = GamePhase::RoadBuildingInProgress { roads_remaining: 2 };
            }

            GameAction::PlayYearOfPlenty(r1, r2) => {
                if player != self.current_player {
                    return Err(GameError::NotYourTurn);
                }
                if self.phase != GamePhase::MainPhase {
                    return Err(GameError::InvalidPhase);
                }
                if self.dev_card_played_this_turn {
                    return Err(GameError::InvalidPhase);
                }

                {
                    let p = self.get_player_mut(player).unwrap();
                    if !p.play_dev_card(DevelopmentCard::YearOfPlenty) {
                        return Err(GameError::NoSuchCard);
                    }
                }

                self.dev_card_played_this_turn = true;

                let p = self.get_player_mut(player).unwrap();
                p.resources.add(r1, 1);
                p.resources.add(r2, 1);

                events.push(GameEvent::YearOfPlentyPlayed {
                    player,
                    resources: (r1, r2),
                });
            }

            GameAction::PlayMonopoly(resource) => {
                if player != self.current_player {
                    return Err(GameError::NotYourTurn);
                }
                if self.phase != GamePhase::MainPhase {
                    return Err(GameError::InvalidPhase);
                }
                if self.dev_card_played_this_turn {
                    return Err(GameError::InvalidPhase);
                }

                {
                    let p = self.get_player_mut(player).unwrap();
                    if !p.play_dev_card(DevelopmentCard::Monopoly) {
                        return Err(GameError::NoSuchCard);
                    }
                }

                self.dev_card_played_this_turn = true;

                // Take all of that resource from other players
                let mut total_stolen = 0;
                for other in &mut self.players {
                    if other.id != player {
                        let amount = other.resources.get(resource);
                        other.resources.set(resource, 0);
                        total_stolen += amount;
                    }
                }

                self.get_player_mut(player)
                    .unwrap()
                    .resources
                    .add(resource, total_stolen);

                events.push(GameEvent::MonopolyPlayed {
                    player,
                    resource,
                    total_stolen,
                });
            }

            // ==================== Trading ====================
            GameAction::ProposeTrade(offer) => {
                if player != self.current_player {
                    return Err(GameError::NotYourTurn);
                }
                if self.phase != GamePhase::MainPhase {
                    return Err(GameError::InvalidPhase);
                }

                if !offer.is_valid() || offer.from != player {
                    return Err(GameError::InvalidTrade);
                }

                // Check player has the resources
                if !self.get_player(player).unwrap().resources.can_afford(&offer.offering) {
                    return Err(GameError::CannotAfford);
                }

                self.pending_trade = Some(TradeState {
                    offer: offer.clone(),
                    responses: HashMap::new(),
                });

                events.push(GameEvent::TradeProposed { offer });
            }

            GameAction::AcceptTrade => {
                let trade = self.pending_trade.as_ref().ok_or(GameError::NoActiveTrade)?;

                if trade.offer.to.is_some() && trade.offer.to != Some(player) {
                    return Err(GameError::NotYourTurn);
                }
                if player == trade.offer.from {
                    return Err(GameError::InvalidTrade);
                }

                // Check responder has the resources
                if !self
                    .get_player(player)
                    .unwrap()
                    .resources
                    .can_afford(&trade.offer.requesting)
                {
                    return Err(GameError::CannotAfford);
                }

                let offer = trade.offer.clone();

                // Execute trade
                self.get_player_mut(offer.from)
                    .unwrap()
                    .resources
                    .subtract(&offer.offering);
                self.get_player_mut(offer.from)
                    .unwrap()
                    .resources
                    .add_hand(&offer.requesting);

                self.get_player_mut(player)
                    .unwrap()
                    .resources
                    .subtract(&offer.requesting);
                self.get_player_mut(player)
                    .unwrap()
                    .resources
                    .add_hand(&offer.offering);

                self.pending_trade = None;

                events.push(GameEvent::TradeCompleted {
                    player1: offer.from,
                    player2: player,
                });
            }

            GameAction::RejectTrade => {
                let trade = self.pending_trade.as_mut().ok_or(GameError::NoActiveTrade)?;

                if trade.offer.to.is_some() && trade.offer.to != Some(player) {
                    return Err(GameError::NotYourTurn);
                }

                trade.responses.insert(player, TradeResponse::Rejected);

                // If targeted trade was rejected, cancel it
                if trade.offer.to == Some(player) {
                    self.pending_trade = None;
                    events.push(GameEvent::TradeCancelled);
                }
            }

            GameAction::CounterTrade(counter_offer) => {
                // For simplicity, just replace the current offer
                if !counter_offer.is_valid() {
                    return Err(GameError::InvalidTrade);
                }

                self.pending_trade = None;

                // Create new offer from the counter
                return self.apply_action(player, GameAction::ProposeTrade(counter_offer));
            }

            GameAction::CancelTrade => {
                if player != self.current_player {
                    return Err(GameError::NotYourTurn);
                }

                if self.pending_trade.is_none() {
                    return Err(GameError::NoActiveTrade);
                }

                self.pending_trade = None;
                events.push(GameEvent::TradeCancelled);
            }

            GameAction::MaritimeTrade {
                give,
                give_count,
                receive,
            } => {
                if player != self.current_player {
                    return Err(GameError::NotYourTurn);
                }
                if self.phase != GamePhase::MainPhase {
                    return Err(GameError::InvalidPhase);
                }

                let harbors = self.board.player_harbors(player);
                let required = self.get_maritime_rate(player, give, &harbors);

                if give_count != required {
                    return Err(GameError::InvalidTrade);
                }

                let p = self.get_player_mut(player).unwrap();
                if p.resources.get(give) < give_count {
                    return Err(GameError::CannotAfford);
                }

                p.resources.set(give, p.resources.get(give) - give_count);
                p.resources.add(receive, 1);

                events.push(GameEvent::MaritimeTradeCompleted {
                    player,
                    gave: give,
                    gave_count: give_count,
                    received: receive,
                });
            }

            // ==================== Turn Management ====================
            GameAction::EndTurn => {
                if player != self.current_player {
                    return Err(GameError::NotYourTurn);
                }
                if self.phase != GamePhase::MainPhase {
                    return Err(GameError::InvalidPhase);
                }

                // Cancel any pending trade
                self.pending_trade = None;

                // Move bought dev cards to hand
                self.get_player_mut(player).unwrap().end_turn();

                // Advance to next player
                let next_player = (self.current_player + 1) % self.player_count() as PlayerId;
                self.current_player = next_player;
                self.turn_number += 1;
                self.dice_roll = None;
                self.dev_card_played_this_turn = false;
                self.phase = GamePhase::PreRoll;

                events.push(GameEvent::TurnEnded {
                    player,
                    next_player,
                });
            }
        }

        Ok(events)
    }

    // ==================== Helper Methods ====================

    fn validate_setup_settlement(
        &self,
        player: PlayerId,
        vertex: VertexCoord,
    ) -> Result<(), GameError> {
        if player != self.current_player {
            return Err(GameError::NotYourTurn);
        }

        if !matches!(
            self.phase,
            GamePhase::Setup {
                placing: SetupPlacing::Settlement,
                ..
            }
        ) {
            return Err(GameError::InvalidPhase);
        }

        if !self.board.valid_settlement_spots(player, true).contains(&vertex) {
            return Err(GameError::InvalidLocation);
        }

        Ok(())
    }

    fn validate_setup_road(&self, player: PlayerId, edge: EdgeCoord) -> Result<(), GameError> {
        if player != self.current_player {
            return Err(GameError::NotYourTurn);
        }

        if !matches!(
            self.phase,
            GamePhase::Setup {
                placing: SetupPlacing::Road,
                ..
            }
        ) {
            return Err(GameError::InvalidPhase);
        }

        // Road must connect to just-placed settlement
        let settlement = self.setup_settlement.ok_or(GameError::InvalidPhase)?;
        if !settlement.touching_edges().contains(&edge) {
            return Err(GameError::InvalidLocation);
        }

        if !self.board.is_land_edge(&edge) {
            return Err(GameError::InvalidLocation);
        }

        Ok(())
    }

    fn advance_setup_phase(&mut self) -> Vec<GameEvent> {
        let events = Vec::new();

        if let GamePhase::Setup { round, .. } = self.phase {
            let player_count = self.player_count() as PlayerId;

            // Setup uses snake draft order: 0,1,2,3,3,2,1,0
            let placements_done = self.count_setup_placements();

            if placements_done >= player_count * 2 {
                // Setup complete, start normal play
                self.phase = GamePhase::PreRoll;
                self.turn_number = 1;
            } else if round == 1 && placements_done >= player_count {
                // End of round 1, start round 2 (reverse order)
                self.phase = GamePhase::Setup {
                    round: 2,
                    placing: SetupPlacing::Settlement,
                };
                // Stay on same player (snake draft)
            } else if round == 1 {
                // Continue round 1 forward
                self.current_player = (self.current_player + 1) % player_count;
                self.phase = GamePhase::Setup {
                    round: 1,
                    placing: SetupPlacing::Settlement,
                };
            } else {
                // Round 2 goes backward
                self.current_player = if self.current_player == 0 {
                    player_count - 1
                } else {
                    self.current_player - 1
                };
                self.phase = GamePhase::Setup {
                    round: 2,
                    placing: SetupPlacing::Settlement,
                };
            }
        }

        events
    }

    fn count_setup_placements(&self) -> PlayerId {
        // Count total settlements placed
        self.players
            .iter()
            .map(|p| (5 - p.settlements_remaining) as PlayerId)
            .sum()
    }

    fn steal_from_player(
        &mut self,
        thief: PlayerId,
        victim: PlayerId,
    ) -> Result<Vec<GameEvent>, GameError> {
        let mut rng = rand::thread_rng();
        let stolen = self
            .get_player_mut(victim)
            .unwrap()
            .resources
            .steal_random(&mut rng);

        if let Some(resource) = stolen {
            self.get_player_mut(thief).unwrap().resources.add(resource, 1);
        }

        Ok(vec![GameEvent::ResourceStolen {
            thief,
            victim,
            resource: stolen,
        }])
    }

    fn check_longest_road(&mut self) -> Vec<GameEvent> {
        let mut events = Vec::new();

        let mut longest_length = 0;
        let mut longest_players: Vec<PlayerId> = Vec::new();

        for player in &self.players {
            let length = self.board.longest_road(player.id);
            if length >= MIN_LONGEST_ROAD {
                if length > longest_length {
                    longest_length = length;
                    longest_players = vec![player.id];
                } else if length == longest_length {
                    longest_players.push(player.id);
                }
            }
        }

        // Find current holder
        let current_holder = self.players.iter().find(|p| p.has_longest_road).map(|p| p.id);

        // Determine new holder
        let new_holder = if longest_players.len() == 1 {
            Some(longest_players[0])
        } else if longest_players.contains(&current_holder.unwrap_or(255)) {
            // Ties keep current holder
            current_holder
        } else if longest_players.is_empty() {
            None
        } else {
            // Multiple tied, no current holder - no one gets it
            None
        };

        if new_holder != current_holder {
            // Update player flags
            for player in &mut self.players {
                player.has_longest_road = Some(player.id) == new_holder;
            }

            events.push(GameEvent::LongestRoadChanged {
                previous: current_holder,
                current: new_holder,
                length: longest_length,
            });
        }

        events
    }

    fn check_largest_army(&mut self) -> Vec<GameEvent> {
        let mut events = Vec::new();

        let mut most_knights = 0;
        let mut leader: Option<PlayerId> = None;

        for player in &self.players {
            if player.played_knights >= MIN_LARGEST_ARMY && player.played_knights > most_knights {
                most_knights = player.played_knights;
                leader = Some(player.id);
            }
        }

        let current_holder = self.players.iter().find(|p| p.has_largest_army).map(|p| p.id);

        // Only change if new leader has strictly more
        if leader != current_holder && leader.is_some() {
            for player in &mut self.players {
                player.has_largest_army = Some(player.id) == leader;
            }

            events.push(GameEvent::LargestArmyChanged {
                previous: current_holder,
                current: leader,
                knights: most_knights,
            });
        }

        events
    }

    fn check_win_condition(&mut self) -> Vec<GameEvent> {
        let mut events = Vec::new();

        if let Some(winner) = self.check_winner() {
            let vp = self.total_victory_points(winner);
            self.phase = GamePhase::Finished { winner };
            events.push(GameEvent::GameWon {
                player: winner,
                victory_points: vp,
            });
        }

        events
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_game_starts_in_setup() {
        let game = GameState::new(4, vec!["A".into(), "B".into(), "C".into(), "D".into()]);
        assert!(matches!(
            game.phase,
            GamePhase::Setup {
                round: 1,
                placing: SetupPlacing::Settlement
            }
        ));
    }

    #[test]
    fn test_setup_valid_actions() {
        let game = GameState::new(4, vec!["A".into(), "B".into(), "C".into(), "D".into()]);
        let actions = game.valid_actions(game.current_player);

        // Should only be able to place settlements
        assert!(actions
            .iter()
            .all(|a| matches!(a, GameAction::PlaceInitialSettlement(_))));
        assert!(!actions.is_empty());
    }

    #[test]
    fn test_dev_card_deck_size() {
        let game = GameState::new(2, vec!["A".into(), "B".into()]);
        assert_eq!(game.dev_card_deck.len(), 25);
    }

    #[test]
    fn test_victory_points_calculation() {
        let mut game = GameState::new(2, vec!["A".into(), "B".into()]);

        // Initial VP should be 0
        assert_eq!(game.total_victory_points(0), 0);

        // Simulate placing settlements (normally done via actions)
        game.players[0].settlements_remaining = 3; // Placed 2
        assert_eq!(game.total_victory_points(0), 2);

        // Add longest road
        game.players[0].has_longest_road = true;
        assert_eq!(game.total_victory_points(0), 4);
    }

    #[test]
    fn test_maritime_trade_rate() {
        let game = GameState::new(2, vec!["A".into(), "B".into()]);

        // No harbors = 4:1
        assert_eq!(
            game.get_maritime_rate(0, Resource::Brick, &[]),
            4
        );

        // Generic harbor = 3:1
        assert_eq!(
            game.get_maritime_rate(0, Resource::Brick, &[Harbor::Generic]),
            3
        );

        // Specific harbor = 2:1
        assert_eq!(
            game.get_maritime_rate(0, Resource::Brick, &[Harbor::Specific(Resource::Brick)]),
            2
        );
    }
}
