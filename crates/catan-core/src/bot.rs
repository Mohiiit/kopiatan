//! AI Bot players for Kopiatan.
//!
//! This module provides different difficulty levels of AI players:
//! - Easy: Random valid moves
//! - Medium: Basic heuristics (prioritize settlements, balance resources)
//! - Hard: Strategic planning with lookahead

use crate::actions::GameAction;
use crate::board::{PlayerId, Resource};
use crate::game::GameState;
use crate::hex::{EdgeCoord, HexCoord, VertexCoord};
use crate::player::ResourceHand;
use rand::prelude::*;
use serde::{Deserialize, Serialize};

/// Bot difficulty level
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BotDifficulty {
    Easy,
    Medium,
    Hard,
}

/// A bot player that can decide on actions
pub struct Bot {
    pub player_id: PlayerId,
    pub difficulty: BotDifficulty,
    rng: StdRng,
}

impl Bot {
    pub fn new(player_id: PlayerId, difficulty: BotDifficulty) -> Self {
        Self {
            player_id,
            difficulty,
            rng: StdRng::from_entropy(),
        }
    }

    pub fn with_seed(player_id: PlayerId, difficulty: BotDifficulty, seed: u64) -> Self {
        Self {
            player_id,
            difficulty,
            rng: StdRng::seed_from_u64(seed),
        }
    }

    /// Choose an action from the valid actions
    pub fn choose_action(&mut self, game: &GameState) -> Option<GameAction> {
        let valid_actions = game.valid_actions(self.player_id);
        if valid_actions.is_empty() {
            return None;
        }

        match self.difficulty {
            BotDifficulty::Easy => self.choose_easy(&valid_actions),
            BotDifficulty::Medium => self.choose_medium(game, &valid_actions),
            BotDifficulty::Hard => self.choose_hard(game, &valid_actions),
        }
    }

    /// Easy: Just pick a random valid action
    fn choose_easy(&mut self, actions: &[GameAction]) -> Option<GameAction> {
        actions.choose(&mut self.rng).cloned()
    }

    /// Medium: Use basic heuristics
    fn choose_medium(&mut self, game: &GameState, actions: &[GameAction]) -> Option<GameAction> {
        // Priority order for medium bot:
        // 1. Always roll dice if we can
        // 2. Build settlements if possible (best locations)
        // 3. Build cities on good spots
        // 4. Build roads toward expansion
        // 5. Buy dev cards occasionally
        // 6. End turn

        // Roll dice
        if actions.contains(&GameAction::RollDice) {
            return Some(GameAction::RollDice);
        }

        // During setup, pick good spots
        let settlement_actions: Vec<_> = actions
            .iter()
            .filter(|a| matches!(a, GameAction::PlaceInitialSettlement(_)))
            .collect();
        if !settlement_actions.is_empty() {
            let best = self.rank_settlement_spots(game, &settlement_actions);
            return best.cloned();
        }

        let road_actions: Vec<_> = actions
            .iter()
            .filter(|a| matches!(a, GameAction::PlaceInitialRoad(_)))
            .collect();
        if !road_actions.is_empty() {
            return road_actions.choose(&mut self.rng).map(|a| (*a).clone());
        }

        // Move robber away from self, prefer opponents with most resources
        let robber_actions: Vec<_> = actions
            .iter()
            .filter(|a| matches!(a, GameAction::MoveRobber(_)))
            .collect();
        if !robber_actions.is_empty() {
            let best = self.rank_robber_spots(game, &robber_actions);
            return best.cloned();
        }

        // Steal from richest opponent
        let steal_actions: Vec<_> = actions
            .iter()
            .filter(|a| matches!(a, GameAction::StealFrom(_)))
            .collect();
        if !steal_actions.is_empty() {
            return self.choose_steal_target(game, &steal_actions);
        }

        // Build settlements
        let build_settlement_actions: Vec<_> = actions
            .iter()
            .filter(|a| matches!(a, GameAction::BuildSettlement(_)))
            .collect();
        if !build_settlement_actions.is_empty() {
            let best = self.rank_settlement_spots(game, &build_settlement_actions);
            return best.cloned();
        }

        // Build cities
        let city_actions: Vec<_> = actions
            .iter()
            .filter(|a| matches!(a, GameAction::BuildCity(_)))
            .collect();
        if !city_actions.is_empty() {
            return city_actions.choose(&mut self.rng).map(|a| (*a).clone());
        }

        // Build roads with 30% chance
        let road_build_actions: Vec<_> = actions
            .iter()
            .filter(|a| matches!(a, GameAction::BuildRoad(_)))
            .collect();
        if !road_build_actions.is_empty() && self.rng.gen_bool(0.3) {
            return road_build_actions.choose(&mut self.rng).map(|a| (*a).clone());
        }

        // Buy dev cards with 20% chance
        if actions.contains(&GameAction::BuyDevelopmentCard) && self.rng.gen_bool(0.2) {
            return Some(GameAction::BuyDevelopmentCard);
        }

        // End turn
        if actions.contains(&GameAction::EndTurn) {
            return Some(GameAction::EndTurn);
        }

        // Fallback to random
        actions.choose(&mut self.rng).cloned()
    }

    /// Hard: Strategic planning
    fn choose_hard(&mut self, game: &GameState, actions: &[GameAction]) -> Option<GameAction> {
        // Hard bot uses more sophisticated evaluation
        // - Considers resource scarcity
        // - Plans road placement for longest road
        // - Times dev card plays strategically

        // Roll dice
        if actions.contains(&GameAction::RollDice) {
            return Some(GameAction::RollDice);
        }

        // During setup, pick best spots based on resource diversity and probability
        let settlement_actions: Vec<_> = actions
            .iter()
            .filter(|a| matches!(a, GameAction::PlaceInitialSettlement(_)))
            .collect();
        if !settlement_actions.is_empty() {
            let best = self.rank_settlement_spots_advanced(game, &settlement_actions);
            return best.cloned();
        }

        let road_actions: Vec<_> = actions
            .iter()
            .filter(|a| matches!(a, GameAction::PlaceInitialRoad(_)))
            .collect();
        if !road_actions.is_empty() {
            let best = self.rank_road_spots(game, &road_actions);
            return best.cloned();
        }

        // Strategic robber placement
        let robber_actions: Vec<_> = actions
            .iter()
            .filter(|a| matches!(a, GameAction::MoveRobber(_)))
            .collect();
        if !robber_actions.is_empty() {
            let best = self.rank_robber_spots(game, &robber_actions);
            return best.cloned();
        }

        // Steal from leader
        let steal_actions: Vec<_> = actions
            .iter()
            .filter(|a| matches!(a, GameAction::StealFrom(_)))
            .collect();
        if !steal_actions.is_empty() {
            return self.choose_steal_target_strategic(game, &steal_actions);
        }

        // Build priority: City > Settlement > Road
        // But consider resource balance

        let player = game.get_player(self.player_id)?;

        // City if we have 3+ settlements
        let city_actions: Vec<_> = actions
            .iter()
            .filter(|a| matches!(a, GameAction::BuildCity(_)))
            .collect();
        if !city_actions.is_empty() && (5 - player.settlements_remaining) >= 3 {
            return city_actions.choose(&mut self.rng).map(|a| (*a).clone());
        }

        // Settlement if good spot available
        let build_settlement_actions: Vec<_> = actions
            .iter()
            .filter(|a| matches!(a, GameAction::BuildSettlement(_)))
            .collect();
        if !build_settlement_actions.is_empty() {
            let best = self.rank_settlement_spots_advanced(game, &build_settlement_actions);
            return best.cloned();
        }

        // Roads toward expansion
        let road_build_actions: Vec<_> = actions
            .iter()
            .filter(|a| matches!(a, GameAction::BuildRoad(_)))
            .collect();
        if !road_build_actions.is_empty() && player.roads_remaining >= 8 {
            // Only build roads early game
            let best = self.rank_road_spots(game, &road_build_actions);
            return best.cloned();
        }

        // Play knight if we're close to largest army
        if actions.contains(&GameAction::PlayKnight) && player.played_knights >= 2 {
            return Some(GameAction::PlayKnight);
        }

        // Buy dev cards with controlled probability
        if actions.contains(&GameAction::BuyDevelopmentCard) && self.rng.gen_bool(0.35) {
            return Some(GameAction::BuyDevelopmentCard);
        }

        // City as fallback
        if !city_actions.is_empty() {
            return city_actions.choose(&mut self.rng).map(|a| (*a).clone());
        }

        // End turn
        if actions.contains(&GameAction::EndTurn) {
            return Some(GameAction::EndTurn);
        }

        actions.choose(&mut self.rng).cloned()
    }

    /// Rank settlement spots by tile value
    fn rank_settlement_spots<'a>(
        &mut self,
        game: &GameState,
        actions: &[&'a GameAction],
    ) -> Option<&'a GameAction> {
        let mut scored: Vec<_> = actions
            .iter()
            .map(|action| {
                let score = match action {
                    GameAction::PlaceInitialSettlement(v) | GameAction::BuildSettlement(v) => {
                        self.score_vertex(game, v)
                    }
                    _ => 0,
                };
                (*action, score)
            })
            .collect();

        scored.sort_by(|a, b| b.1.cmp(&a.1));

        // Pick from top 3 with some randomness
        let top = scored.iter().take(3).collect::<Vec<_>>();
        top.choose(&mut self.rng).map(|(a, _)| *a)
    }

    /// Advanced settlement ranking with resource diversity
    fn rank_settlement_spots_advanced<'a>(
        &mut self,
        game: &GameState,
        actions: &[&'a GameAction],
    ) -> Option<&'a GameAction> {
        let player = game.get_player(self.player_id)?;

        let mut scored: Vec<_> = actions
            .iter()
            .map(|action| {
                let score = match action {
                    GameAction::PlaceInitialSettlement(v) | GameAction::BuildSettlement(v) => {
                        let mut base_score = self.score_vertex(game, v);

                        // Bonus for resource diversity
                        let resources = self.vertex_resources(game, v);
                        let unique_resources: std::collections::HashSet<_> =
                            resources.iter().collect();
                        base_score += (unique_resources.len() as i32) * 3;

                        // Bonus for resources we're lacking
                        for res in &resources {
                            let current = match res {
                                Resource::Brick => player.resources.brick,
                                Resource::Lumber => player.resources.lumber,
                                Resource::Ore => player.resources.ore,
                                Resource::Grain => player.resources.grain,
                                Resource::Wool => player.resources.wool,
                            };
                            if current == 0 {
                                base_score += 5;
                            }
                        }

                        base_score
                    }
                    _ => 0,
                };
                (*action, score)
            })
            .collect();

        scored.sort_by(|a, b| b.1.cmp(&a.1));

        // Pick best with small chance for second best
        if scored.len() >= 2 && self.rng.gen_bool(0.1) {
            Some(scored[1].0)
        } else {
            scored.first().map(|(a, _)| *a)
        }
    }

    /// Score a vertex based on adjacent tiles
    fn score_vertex(&self, game: &GameState, vertex: &VertexCoord) -> i32 {
        let tiles = game.board.tiles_at_vertex(vertex);
        let mut score = 0;

        for tile in tiles {
            if let Some(dice) = tile.dice_number {
                // 6 and 8 are most valuable, then 5/9, 4/10, 3/11, 2/12
                score += match dice {
                    6 | 8 => 5,
                    5 | 9 => 4,
                    4 | 10 => 3,
                    3 | 11 => 2,
                    2 | 12 => 1,
                    _ => 0,
                };
            }
        }

        score
    }

    /// Get resources at a vertex
    fn vertex_resources(&self, game: &GameState, vertex: &VertexCoord) -> Vec<Resource> {
        game.board
            .tiles_at_vertex(vertex)
            .iter()
            .filter_map(|t| t.resource())
            .collect()
    }

    /// Rank road spots for expansion potential
    fn rank_road_spots<'a>(
        &mut self,
        game: &GameState,
        actions: &[&'a GameAction],
    ) -> Option<&'a GameAction> {
        // Prefer roads that lead toward good settlement spots
        let mut scored: Vec<_> = actions
            .iter()
            .map(|action| {
                let score = match action {
                    GameAction::PlaceInitialRoad(e) | GameAction::BuildRoad(e) => {
                        self.score_edge_expansion(game, e)
                    }
                    _ => 0,
                };
                (*action, score)
            })
            .collect();

        scored.sort_by(|a, b| b.1.cmp(&a.1));
        scored.first().map(|(a, _)| *a)
    }

    /// Score edge for expansion potential
    fn score_edge_expansion(&self, _game: &GameState, _edge: &EdgeCoord) -> i32 {
        // Simplified: random for now
        // Full implementation would check if endpoints lead to valid settlement spots
        rand::thread_rng().gen_range(0..10)
    }

    /// Rank robber spots to hurt opponents
    fn rank_robber_spots<'a>(
        &mut self,
        game: &GameState,
        actions: &[&'a GameAction],
    ) -> Option<&'a GameAction> {
        let mut scored: Vec<_> = actions
            .iter()
            .map(|action| {
                let score = match action {
                    GameAction::MoveRobber(hex) => self.score_robber_spot(game, hex),
                    _ => 0,
                };
                (*action, score)
            })
            .collect();

        scored.sort_by(|a, b| b.1.cmp(&a.1));
        scored.first().map(|(a, _)| *a)
    }

    /// Score robber placement
    fn score_robber_spot(&self, game: &GameState, hex: &HexCoord) -> i32 {
        let tile = match game.board.get_tile(hex) {
            Some(t) => t,
            None => return -100,
        };

        let mut score = 0;

        // Prefer high-value tiles
        if let Some(dice) = tile.dice_number {
            score += match dice {
                6 | 8 => 10,
                5 | 9 => 8,
                4 | 10 => 6,
                3 | 11 => 4,
                2 | 12 => 2,
                _ => 0,
            };
        }

        // Prefer tiles with opponent buildings, avoid our own
        for player_id in game.board.players_adjacent_to_hex(hex) {
            if player_id == self.player_id {
                score -= 20; // Don't hurt ourselves
            } else {
                score += 5;
            }
        }

        score
    }

    /// Choose steal target (richest opponent)
    fn choose_steal_target(&mut self, game: &GameState, actions: &[&GameAction]) -> Option<GameAction> {
        let mut best_target = None;
        let mut best_resources = 0;

        for action in actions {
            if let GameAction::StealFrom(victim) = action {
                if let Some(player) = game.get_player(*victim) {
                    let total = player.resources.total();
                    if total > best_resources {
                        best_resources = total;
                        best_target = Some(*victim);
                    }
                }
            }
        }

        best_target.map(GameAction::StealFrom)
    }

    /// Strategic steal target (consider VP leader)
    fn choose_steal_target_strategic(
        &mut self,
        game: &GameState,
        actions: &[&GameAction],
    ) -> Option<GameAction> {
        let mut scored: Vec<_> = actions
            .iter()
            .filter_map(|action| {
                if let GameAction::StealFrom(victim) = action {
                    let player = game.get_player(*victim)?;
                    let vp = game.total_victory_points(*victim);
                    let resources = player.resources.total();
                    let score = (vp as i32) * 3 + resources as i32;
                    Some((*victim, score))
                } else {
                    None
                }
            })
            .collect();

        scored.sort_by(|a, b| b.1.cmp(&a.1));
        scored.first().map(|(victim, _)| GameAction::StealFrom(*victim))
    }
}

/// Handle discard phase for bot
pub fn bot_discard(game: &GameState, player_id: PlayerId) -> ResourceHand {
    let player = match game.get_player(player_id) {
        Some(p) => p,
        None => return ResourceHand::new(),
    };

    let total = player.resources.total();
    if total <= 7 {
        return ResourceHand::new();
    }

    let to_discard = total / 2;

    // Discard resources we have the most of
    let mut discard = ResourceHand::new();
    let mut remaining = player.resources.clone();
    let mut discarded = 0;

    while discarded < to_discard {
        // Find resource with most
        let resources = [
            (Resource::Brick, remaining.brick),
            (Resource::Lumber, remaining.lumber),
            (Resource::Ore, remaining.ore),
            (Resource::Grain, remaining.grain),
            (Resource::Wool, remaining.wool),
        ];

        let max = resources.iter().max_by_key(|(_, count)| *count);
        if let Some((resource, count)) = max {
            if *count > 0 {
                match resource {
                    Resource::Brick => {
                        discard.brick += 1;
                        remaining.brick -= 1;
                    }
                    Resource::Lumber => {
                        discard.lumber += 1;
                        remaining.lumber -= 1;
                    }
                    Resource::Ore => {
                        discard.ore += 1;
                        remaining.ore -= 1;
                    }
                    Resource::Grain => {
                        discard.grain += 1;
                        remaining.grain -= 1;
                    }
                    Resource::Wool => {
                        discard.wool += 1;
                        remaining.wool -= 1;
                    }
                }
                discarded += 1;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    discard
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bot_creation() {
        let bot = Bot::new(0, BotDifficulty::Easy);
        assert_eq!(bot.player_id, 0);
        assert_eq!(bot.difficulty, BotDifficulty::Easy);
    }

    #[test]
    fn test_easy_bot_chooses_action() {
        let game = GameState::new(2, vec!["Bot".into(), "Human".into()]);
        let mut bot = Bot::new(game.current_player, BotDifficulty::Easy);

        let action = bot.choose_action(&game);
        assert!(action.is_some());
    }

    #[test]
    fn test_medium_bot_prioritizes_roll() {
        let mut game = GameState::new(2, vec!["Bot".into(), "Human".into()]);

        // Complete setup phase first
        complete_setup(&mut game);

        let mut bot = Bot::new(game.current_player, BotDifficulty::Medium);
        let action = bot.choose_action(&game);

        assert!(matches!(action, Some(GameAction::RollDice)));
    }

    fn complete_setup(game: &mut GameState) {
        // Quick setup completion by placing settlements and roads for all players
        while matches!(game.phase, crate::game::GamePhase::Setup { .. }) {
            let actions = game.valid_actions(game.current_player);
            if let Some(action) = actions.first() {
                let _ = game.apply_action(game.current_player, action.clone());
            } else {
                break;
            }
        }
    }

    #[test]
    fn test_discard_logic() {
        let game = GameState::new(2, vec!["A".into(), "B".into()]);
        let discard = bot_discard(&game, 0);
        // Player starts with no resources, so should discard nothing
        assert_eq!(discard.total(), 0);
    }
}
