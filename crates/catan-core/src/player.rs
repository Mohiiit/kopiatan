//! Player state and resource management.
//!
//! This module contains:
//! - Player struct with resources, development cards, and achievements
//! - ResourceHand for managing resource counts
//! - Development card types and deck management
//! - Building costs

use crate::board::{PlayerId, Resource};
use rand::seq::SliceRandom;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Player color for UI rendering
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PlayerColor {
    Red,
    Blue,
    Orange,
    White,
}

impl PlayerColor {
    /// Get color for a player index
    pub fn for_player(id: PlayerId) -> Self {
        match id % 4 {
            0 => PlayerColor::Red,
            1 => PlayerColor::Blue,
            2 => PlayerColor::Orange,
            _ => PlayerColor::White,
        }
    }

    /// Get hex color code for rendering
    pub fn hex_code(&self) -> u32 {
        match self {
            PlayerColor::Red => 0xE74C3C,
            PlayerColor::Blue => 0x3498DB,
            PlayerColor::Orange => 0xE67E22,
            PlayerColor::White => 0xECF0F1,
        }
    }
}

/// Development card types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DevelopmentCard {
    /// Move robber and steal, counts toward Largest Army
    Knight,
    /// Immediately worth 1 VP (hidden until game end or 10 VP)
    VictoryPoint,
    /// Build 2 roads for free
    RoadBuilding,
    /// Take any 2 resources from the bank
    YearOfPlenty,
    /// All players must give you all of one resource type
    Monopoly,
}

impl DevelopmentCard {
    /// Create the standard development card deck (25 cards)
    pub fn standard_deck() -> Vec<DevelopmentCard> {
        let mut deck = Vec::with_capacity(25);

        // 14 Knights
        deck.extend(std::iter::repeat(DevelopmentCard::Knight).take(14));

        // 5 Victory Points
        deck.extend(std::iter::repeat(DevelopmentCard::VictoryPoint).take(5));

        // 2 Road Building
        deck.extend(std::iter::repeat(DevelopmentCard::RoadBuilding).take(2));

        // 2 Year of Plenty
        deck.extend(std::iter::repeat(DevelopmentCard::YearOfPlenty).take(2));

        // 2 Monopoly
        deck.extend(std::iter::repeat(DevelopmentCard::Monopoly).take(2));

        deck
    }

    /// Shuffle a deck
    pub fn shuffle_deck<R: Rng>(deck: &mut [DevelopmentCard], rng: &mut R) {
        deck.shuffle(rng);
    }

    /// Whether this card can be played (VP cards are never "played")
    pub fn is_playable(&self) -> bool {
        !matches!(self, DevelopmentCard::VictoryPoint)
    }
}

/// A hand of resources
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResourceHand {
    pub brick: u32,
    pub lumber: u32,
    pub ore: u32,
    pub grain: u32,
    pub wool: u32,
}

impl ResourceHand {
    /// Create an empty hand
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a hand with specific amounts
    pub fn with_amounts(brick: u32, lumber: u32, ore: u32, grain: u32, wool: u32) -> Self {
        Self {
            brick,
            lumber,
            ore,
            grain,
            wool,
        }
    }

    /// Total number of resource cards
    pub fn total(&self) -> u32 {
        self.brick + self.lumber + self.ore + self.grain + self.wool
    }

    /// Check if hand is empty
    pub fn is_empty(&self) -> bool {
        self.total() == 0
    }

    /// Get count of a specific resource
    pub fn get(&self, resource: Resource) -> u32 {
        match resource {
            Resource::Brick => self.brick,
            Resource::Lumber => self.lumber,
            Resource::Ore => self.ore,
            Resource::Grain => self.grain,
            Resource::Wool => self.wool,
        }
    }

    /// Set count of a specific resource
    pub fn set(&mut self, resource: Resource, count: u32) {
        match resource {
            Resource::Brick => self.brick = count,
            Resource::Lumber => self.lumber = count,
            Resource::Ore => self.ore = count,
            Resource::Grain => self.grain = count,
            Resource::Wool => self.wool = count,
        }
    }

    /// Add resources to hand
    pub fn add(&mut self, resource: Resource, amount: u32) {
        match resource {
            Resource::Brick => self.brick += amount,
            Resource::Lumber => self.lumber += amount,
            Resource::Ore => self.ore += amount,
            Resource::Grain => self.grain += amount,
            Resource::Wool => self.wool += amount,
        }
    }

    /// Add another hand to this one
    pub fn add_hand(&mut self, other: &ResourceHand) {
        self.brick += other.brick;
        self.lumber += other.lumber;
        self.ore += other.ore;
        self.grain += other.grain;
        self.wool += other.wool;
    }

    /// Check if can afford a cost
    pub fn can_afford(&self, cost: &ResourceHand) -> bool {
        self.brick >= cost.brick
            && self.lumber >= cost.lumber
            && self.ore >= cost.ore
            && self.grain >= cost.grain
            && self.wool >= cost.wool
    }

    /// Subtract a cost (panics if insufficient)
    pub fn subtract(&mut self, cost: &ResourceHand) {
        assert!(self.can_afford(cost), "Cannot afford this cost");
        self.brick -= cost.brick;
        self.lumber -= cost.lumber;
        self.ore -= cost.ore;
        self.grain -= cost.grain;
        self.wool -= cost.wool;
    }

    /// Try to subtract, returning false if insufficient
    pub fn try_subtract(&mut self, cost: &ResourceHand) -> bool {
        if !self.can_afford(cost) {
            return false;
        }
        self.subtract(cost);
        true
    }

    /// Remove a random resource (for robber stealing)
    pub fn steal_random<R: Rng>(&mut self, rng: &mut R) -> Option<Resource> {
        if self.is_empty() {
            return None;
        }

        // Build a list of available resources
        let mut available: Vec<Resource> = Vec::new();
        for _ in 0..self.brick {
            available.push(Resource::Brick);
        }
        for _ in 0..self.lumber {
            available.push(Resource::Lumber);
        }
        for _ in 0..self.ore {
            available.push(Resource::Ore);
        }
        for _ in 0..self.grain {
            available.push(Resource::Grain);
        }
        for _ in 0..self.wool {
            available.push(Resource::Wool);
        }

        let resource = *available.choose(rng)?;
        self.subtract(&ResourceHand::single(resource, 1));
        Some(resource)
    }

    /// Create a hand with a single resource
    pub fn single(resource: Resource, amount: u32) -> Self {
        let mut hand = Self::new();
        hand.add(resource, amount);
        hand
    }

    /// Convert to HashMap for iteration
    pub fn to_map(&self) -> HashMap<Resource, u32> {
        let mut map = HashMap::new();
        if self.brick > 0 {
            map.insert(Resource::Brick, self.brick);
        }
        if self.lumber > 0 {
            map.insert(Resource::Lumber, self.lumber);
        }
        if self.ore > 0 {
            map.insert(Resource::Ore, self.ore);
        }
        if self.grain > 0 {
            map.insert(Resource::Grain, self.grain);
        }
        if self.wool > 0 {
            map.insert(Resource::Wool, self.wool);
        }
        map
    }
}

/// Building costs
pub mod costs {
    use super::ResourceHand;

    /// Cost to build a road: 1 brick, 1 lumber
    pub fn road() -> ResourceHand {
        ResourceHand::with_amounts(1, 1, 0, 0, 0)
    }

    /// Cost to build a settlement: 1 brick, 1 lumber, 1 grain, 1 wool
    pub fn settlement() -> ResourceHand {
        ResourceHand::with_amounts(1, 1, 0, 1, 1)
    }

    /// Cost to upgrade to city: 3 ore, 2 grain
    pub fn city() -> ResourceHand {
        ResourceHand::with_amounts(0, 0, 3, 2, 0)
    }

    /// Cost to buy a development card: 1 ore, 1 grain, 1 wool
    pub fn development_card() -> ResourceHand {
        ResourceHand::with_amounts(0, 0, 1, 1, 1)
    }
}

/// A single player's state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Player {
    /// Player ID (0-3)
    pub id: PlayerId,
    /// Display name
    pub name: String,
    /// Player color
    pub color: PlayerColor,
    /// Current resources
    pub resources: ResourceHand,
    /// Development cards in hand (unplayed)
    pub dev_cards: Vec<DevelopmentCard>,
    /// Development cards bought this turn (can't be played same turn)
    pub dev_cards_bought_this_turn: Vec<DevelopmentCard>,
    /// Number of knights played (for Largest Army)
    pub played_knights: u32,
    /// Whether this player has the Longest Road card
    pub has_longest_road: bool,
    /// Whether this player has the Largest Army card
    pub has_largest_army: bool,
    /// Number of settlements remaining to build
    pub settlements_remaining: u32,
    /// Number of cities remaining to build
    pub cities_remaining: u32,
    /// Number of roads remaining to build
    pub roads_remaining: u32,
}

impl Player {
    /// Create a new player
    pub fn new(id: PlayerId, name: String) -> Self {
        Self {
            id,
            name,
            color: PlayerColor::for_player(id),
            resources: ResourceHand::new(),
            dev_cards: Vec::new(),
            dev_cards_bought_this_turn: Vec::new(),
            played_knights: 0,
            has_longest_road: false,
            has_largest_army: false,
            settlements_remaining: 5,
            cities_remaining: 4,
            roads_remaining: 15,
        }
    }

    /// Calculate total victory points
    pub fn victory_points(&self) -> u32 {
        let mut vp = 0;

        // VP from settlements (counted on board, not here)
        // VP from cities (counted on board, not here)

        // This is just the bonus VP from cards and achievements
        // The actual building VP is tracked in the game state

        // Longest road
        if self.has_longest_road {
            vp += 2;
        }

        // Largest army
        if self.has_largest_army {
            vp += 2;
        }

        // Victory point cards
        vp += self
            .dev_cards
            .iter()
            .filter(|c| matches!(c, DevelopmentCard::VictoryPoint))
            .count() as u32;

        vp
    }

    /// Hidden VP (VP cards that opponents can't see)
    pub fn hidden_vp(&self) -> u32 {
        self.dev_cards
            .iter()
            .filter(|c| matches!(c, DevelopmentCard::VictoryPoint))
            .count() as u32
    }

    /// Can this player afford a road?
    pub fn can_afford_road(&self) -> bool {
        self.resources.can_afford(&costs::road()) && self.roads_remaining > 0
    }

    /// Can this player afford a settlement?
    pub fn can_afford_settlement(&self) -> bool {
        self.resources.can_afford(&costs::settlement()) && self.settlements_remaining > 0
    }

    /// Can this player afford a city upgrade?
    pub fn can_afford_city(&self) -> bool {
        self.resources.can_afford(&costs::city()) && self.cities_remaining > 0
    }

    /// Can this player afford a development card?
    pub fn can_afford_dev_card(&self) -> bool {
        self.resources.can_afford(&costs::development_card())
    }

    /// Buy a road (deduct resources and piece)
    pub fn buy_road(&mut self) {
        self.resources.subtract(&costs::road());
        self.roads_remaining -= 1;
    }

    /// Buy a settlement
    pub fn buy_settlement(&mut self) {
        self.resources.subtract(&costs::settlement());
        self.settlements_remaining -= 1;
    }

    /// Buy a city (returns the settlement piece)
    pub fn buy_city(&mut self) {
        self.resources.subtract(&costs::city());
        self.cities_remaining -= 1;
        self.settlements_remaining += 1; // Settlement piece returned
    }

    /// Buy a development card
    pub fn buy_dev_card(&mut self, card: DevelopmentCard) {
        self.resources.subtract(&costs::development_card());
        self.dev_cards_bought_this_turn.push(card);
    }

    /// Called at end of turn - move bought cards to playable pile
    pub fn end_turn(&mut self) {
        self.dev_cards.append(&mut self.dev_cards_bought_this_turn);
    }

    /// Check if player has a playable development card of given type
    pub fn has_playable_dev_card(&self, card_type: DevelopmentCard) -> bool {
        self.dev_cards.iter().any(|c| *c == card_type)
    }

    /// Play a development card (removes it from hand)
    pub fn play_dev_card(&mut self, card_type: DevelopmentCard) -> bool {
        if let Some(pos) = self.dev_cards.iter().position(|c| *c == card_type) {
            self.dev_cards.remove(pos);
            if matches!(card_type, DevelopmentCard::Knight) {
                self.played_knights += 1;
            }
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resource_hand_total() {
        let hand = ResourceHand::with_amounts(1, 2, 3, 4, 5);
        assert_eq!(hand.total(), 15);
    }

    #[test]
    fn test_resource_hand_can_afford() {
        let hand = ResourceHand::with_amounts(2, 2, 2, 2, 2);
        let cost = ResourceHand::with_amounts(1, 1, 1, 1, 1);
        assert!(hand.can_afford(&cost));

        let expensive = ResourceHand::with_amounts(3, 0, 0, 0, 0);
        assert!(!hand.can_afford(&expensive));
    }

    #[test]
    fn test_resource_hand_subtract() {
        let mut hand = ResourceHand::with_amounts(3, 3, 3, 3, 3);
        let cost = ResourceHand::with_amounts(1, 1, 1, 1, 1);
        hand.subtract(&cost);
        assert_eq!(hand, ResourceHand::with_amounts(2, 2, 2, 2, 2));
    }

    #[test]
    fn test_building_costs() {
        assert_eq!(costs::road().total(), 2);
        assert_eq!(costs::settlement().total(), 4);
        assert_eq!(costs::city().total(), 5);
        assert_eq!(costs::development_card().total(), 3);
    }

    #[test]
    fn test_dev_card_deck_size() {
        let deck = DevelopmentCard::standard_deck();
        assert_eq!(deck.len(), 25);

        let knights = deck
            .iter()
            .filter(|c| matches!(c, DevelopmentCard::Knight))
            .count();
        assert_eq!(knights, 14);
    }

    #[test]
    fn test_player_victory_points() {
        let mut player = Player::new(0, "Test".to_string());

        // No VP initially (building VP tracked separately)
        assert_eq!(player.victory_points(), 0);

        // Longest road
        player.has_longest_road = true;
        assert_eq!(player.victory_points(), 2);

        // Largest army
        player.has_largest_army = true;
        assert_eq!(player.victory_points(), 4);

        // VP card
        player.dev_cards.push(DevelopmentCard::VictoryPoint);
        assert_eq!(player.victory_points(), 5);
    }

    #[test]
    fn test_player_buy_road() {
        let mut player = Player::new(0, "Test".to_string());
        player.resources = ResourceHand::with_amounts(5, 5, 5, 5, 5);

        assert!(player.can_afford_road());
        player.buy_road();
        assert_eq!(player.roads_remaining, 14);
        assert_eq!(player.resources.brick, 4);
        assert_eq!(player.resources.lumber, 4);
    }

    #[test]
    fn test_player_buy_city() {
        let mut player = Player::new(0, "Test".to_string());
        player.resources = ResourceHand::with_amounts(5, 5, 5, 5, 5);
        player.settlements_remaining = 3; // Placed 2 settlements

        player.buy_city();
        assert_eq!(player.cities_remaining, 3);
        assert_eq!(player.settlements_remaining, 4); // Got one back
    }

    #[test]
    fn test_dev_card_bought_this_turn() {
        let mut player = Player::new(0, "Test".to_string());
        player.resources = ResourceHand::with_amounts(5, 5, 5, 5, 5);

        player.buy_dev_card(DevelopmentCard::Knight);

        // Card is in bought_this_turn, not playable yet
        assert!(!player.has_playable_dev_card(DevelopmentCard::Knight));
        assert_eq!(player.dev_cards_bought_this_turn.len(), 1);

        // End turn
        player.end_turn();

        // Now it's playable
        assert!(player.has_playable_dev_card(DevelopmentCard::Knight));
        assert!(player.dev_cards_bought_this_turn.is_empty());
    }

    #[test]
    fn test_steal_random() {
        let mut hand = ResourceHand::with_amounts(0, 0, 0, 1, 0);
        let mut rng = rand::thread_rng();

        let stolen = hand.steal_random(&mut rng);
        assert_eq!(stolen, Some(Resource::Grain));
        assert!(hand.is_empty());
    }
}
