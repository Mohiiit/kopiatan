//! Game actions that players can take.
//!
//! This module defines all possible actions in the game and the events
//! that result from those actions.

use crate::board::{PlayerId, Resource};
use crate::hex::{EdgeCoord, HexCoord, VertexCoord};
use crate::player::ResourceHand;
use serde::{Deserialize, Serialize};

/// All possible actions a player can take
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum GameAction {
    // ==================== Setup Phase ====================
    /// Place initial settlement during setup
    PlaceInitialSettlement(VertexCoord),
    /// Place initial road during setup (must connect to just-placed settlement)
    PlaceInitialRoad(EdgeCoord),

    // ==================== Turn Actions ====================
    /// Roll the dice (must be done at start of turn)
    RollDice,

    // ==================== Robber Actions ====================
    /// Move the robber to a new hex (after rolling 7 or playing knight)
    MoveRobber(HexCoord),
    /// Choose a player to steal from (after moving robber)
    StealFrom(PlayerId),
    /// Discard cards when you have more than 7 after a 7 is rolled
    DiscardCards(ResourceHand),

    // ==================== Building Actions (Main Phase) ====================
    /// Build a road at an edge
    BuildRoad(EdgeCoord),
    /// Build a settlement at a vertex
    BuildSettlement(VertexCoord),
    /// Upgrade a settlement to a city
    BuildCity(VertexCoord),
    /// Buy a development card from the deck
    BuyDevelopmentCard,

    // ==================== Development Card Actions ====================
    /// Play a knight card (move robber, steal, counts toward largest army)
    PlayKnight,
    /// Play road building card (build 2 free roads)
    PlayRoadBuilding(EdgeCoord, EdgeCoord),
    /// Play year of plenty (take 2 resources from bank)
    PlayYearOfPlenty(Resource, Resource),
    /// Play monopoly (take all of one resource from all players)
    PlayMonopoly(Resource),

    // ==================== Trading Actions ====================
    /// Propose a trade to other players
    ProposeTrade(TradeOffer),
    /// Accept the current trade offer
    AcceptTrade,
    /// Reject the current trade offer
    RejectTrade,
    /// Counter with a different offer
    CounterTrade(TradeOffer),
    /// Cancel your own trade offer
    CancelTrade,
    /// Trade with the bank (4:1) or harbor (3:1 or 2:1)
    MaritimeTrade {
        give: Resource,
        give_count: u32,
        receive: Resource,
    },

    // ==================== Turn Management ====================
    /// End your turn
    EndTurn,
}

/// A trade offer between players
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TradeOffer {
    /// Player making the offer
    pub from: PlayerId,
    /// Specific player to trade with, or None for open offer
    pub to: Option<PlayerId>,
    /// Resources being offered
    pub offering: ResourceHand,
    /// Resources being requested
    pub requesting: ResourceHand,
}

impl TradeOffer {
    /// Create a new trade offer
    pub fn new(
        from: PlayerId,
        to: Option<PlayerId>,
        offering: ResourceHand,
        requesting: ResourceHand,
    ) -> Self {
        Self {
            from,
            to,
            offering,
            requesting,
        }
    }

    /// Check if offer is valid (non-empty on both sides)
    pub fn is_valid(&self) -> bool {
        !self.offering.is_empty() && !self.requesting.is_empty()
    }
}

/// Events that occur as a result of actions
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum GameEvent {
    /// Dice were rolled
    DiceRolled {
        player: PlayerId,
        roll: (u8, u8),
        total: u8,
    },

    /// Resources were distributed after a dice roll
    ResourcesDistributed {
        distributions: Vec<(PlayerId, Resource, u32)>,
    },

    /// A settlement was built
    SettlementBuilt {
        player: PlayerId,
        location: VertexCoord,
    },

    /// A settlement was upgraded to a city
    CityBuilt {
        player: PlayerId,
        location: VertexCoord,
    },

    /// A road was built
    RoadBuilt {
        player: PlayerId,
        location: EdgeCoord,
    },

    /// A development card was purchased
    DevelopmentCardPurchased { player: PlayerId },

    /// A knight was played
    KnightPlayed { player: PlayerId },

    /// Road building card was played
    RoadBuildingPlayed { player: PlayerId },

    /// Year of plenty card was played
    YearOfPlentyPlayed {
        player: PlayerId,
        resources: (Resource, Resource),
    },

    /// Monopoly card was played
    MonopolyPlayed {
        player: PlayerId,
        resource: Resource,
        total_stolen: u32,
    },

    /// The robber was moved
    RobberMoved {
        player: PlayerId,
        from: HexCoord,
        to: HexCoord,
    },

    /// A resource was stolen
    ResourceStolen {
        thief: PlayerId,
        victim: PlayerId,
        resource: Option<Resource>, // Hidden from other players
    },

    /// Player had to discard cards
    CardsDiscarded {
        player: PlayerId,
        count: u32,
    },

    /// A trade was proposed
    TradeProposed {
        offer: TradeOffer,
    },

    /// A trade was completed
    TradeCompleted {
        player1: PlayerId,
        player2: PlayerId,
    },

    /// A trade was rejected or cancelled
    TradeCancelled,

    /// Maritime trade completed
    MaritimeTradeCompleted {
        player: PlayerId,
        gave: Resource,
        gave_count: u32,
        received: Resource,
    },

    /// Longest road changed hands
    LongestRoadChanged {
        previous: Option<PlayerId>,
        current: Option<PlayerId>,
        length: u32,
    },

    /// Largest army changed hands
    LargestArmyChanged {
        previous: Option<PlayerId>,
        current: Option<PlayerId>,
        knights: u32,
    },

    /// Turn ended
    TurnEnded {
        player: PlayerId,
        next_player: PlayerId,
    },

    /// A player won the game
    GameWon {
        player: PlayerId,
        victory_points: u32,
    },
}
