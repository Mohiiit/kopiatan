//! Game room management.

use catan_core::{GameAction, GameEvent, GameState};
use std::collections::HashMap;
use thiserror::Error;
use uuid::Uuid;

use crate::protocol::{PlayerInfo, RoomInfo, RoomStatus};

#[derive(Debug, Error)]
pub enum RoomError {
    #[error("Room is full")]
    RoomFull,

    #[error("Player not in room")]
    PlayerNotInRoom,

    #[error("Not the host")]
    NotHost,

    #[error("Game already started")]
    GameAlreadyStarted,

    #[error("Not enough players")]
    NotEnoughPlayers,

    #[error("Game not started")]
    GameNotStarted,

    #[error("Not your turn")]
    NotYourTurn,

    #[error("Invalid action: {0}")]
    InvalidAction(String),
}

/// A player in a game room.
#[derive(Debug, Clone)]
pub struct RoomPlayer {
    pub id: Uuid,
    pub name: String,
    pub ready: bool,
    pub connected: bool,
    /// Index in the game (0-3), assigned when game starts
    pub game_index: Option<u8>,
}

impl RoomPlayer {
    pub fn new(id: Uuid, name: String) -> Self {
        Self {
            id,
            name,
            ready: false,
            connected: true,
            game_index: None,
        }
    }

    pub fn to_info(&self) -> PlayerInfo {
        PlayerInfo {
            id: self.id,
            name: self.name.clone(),
            ready: self.ready,
            connected: self.connected,
        }
    }
}

/// A game room that can hold multiple players.
pub struct GameRoom {
    pub id: Uuid,
    pub name: String,
    pub max_players: u8,
    pub host_id: Uuid,
    pub status: RoomStatus,
    pub players: HashMap<Uuid, RoomPlayer>,
    /// Order of players for turn taking
    pub player_order: Vec<Uuid>,
    /// The game state (once started)
    pub game: Option<GameState>,
}

impl GameRoom {
    pub fn new(id: Uuid, host_id: Uuid, host_name: String, max_players: u8) -> Self {
        let mut players = HashMap::new();
        players.insert(host_id, RoomPlayer::new(host_id, host_name.clone()));

        Self {
            id,
            name: format!("{}'s Game", host_name),
            max_players: max_players.clamp(2, 4),
            host_id,
            status: RoomStatus::Waiting,
            players,
            player_order: vec![host_id],
            game: None,
        }
    }

    pub fn player_count(&self) -> usize {
        self.players.len()
    }

    pub fn is_full(&self) -> bool {
        self.players.len() >= self.max_players as usize
    }

    pub fn add_player(&mut self, player_id: Uuid, name: String) -> Result<(), RoomError> {
        if self.status != RoomStatus::Waiting {
            return Err(RoomError::GameAlreadyStarted);
        }
        if self.is_full() {
            return Err(RoomError::RoomFull);
        }

        self.players.insert(player_id, RoomPlayer::new(player_id, name));
        self.player_order.push(player_id);
        Ok(())
    }

    pub fn remove_player(&mut self, player_id: Uuid) -> Result<bool, RoomError> {
        if !self.players.contains_key(&player_id) {
            return Err(RoomError::PlayerNotInRoom);
        }

        self.players.remove(&player_id);
        self.player_order.retain(|&id| id != player_id);

        // If host left, assign new host
        if player_id == self.host_id && !self.player_order.is_empty() {
            self.host_id = self.player_order[0];
        }

        // Return true if room is now empty
        Ok(self.players.is_empty())
    }

    pub fn set_player_connected(&mut self, player_id: Uuid, connected: bool) {
        if let Some(player) = self.players.get_mut(&player_id) {
            player.connected = connected;
        }
    }

    pub fn start_game(&mut self, requester_id: Uuid) -> Result<(), RoomError> {
        if requester_id != self.host_id {
            return Err(RoomError::NotHost);
        }
        if self.status != RoomStatus::Waiting {
            return Err(RoomError::GameAlreadyStarted);
        }
        if self.players.len() < 2 {
            return Err(RoomError::NotEnoughPlayers);
        }

        // Assign game indices to players
        for (idx, &player_id) in self.player_order.iter().enumerate() {
            if let Some(player) = self.players.get_mut(&player_id) {
                player.game_index = Some(idx as u8);
            }
        }

        // Create player names in order
        let player_names: Vec<String> = self
            .player_order
            .iter()
            .filter_map(|id| self.players.get(id).map(|p| p.name.clone()))
            .collect();

        // Create game state
        self.game = Some(GameState::new(player_names.len() as u8, player_names));
        self.status = RoomStatus::InGame;

        Ok(())
    }

    pub fn apply_action(
        &mut self,
        player_id: Uuid,
        action: serde_json::Value,
    ) -> Result<Vec<GameEvent>, RoomError> {
        let game = self.game.as_mut().ok_or(RoomError::GameNotStarted)?;

        let player = self
            .players
            .get(&player_id)
            .ok_or(RoomError::PlayerNotInRoom)?;

        let game_index = player.game_index.ok_or(RoomError::PlayerNotInRoom)?;

        // Check if it's this player's turn
        if game.current_player != game_index {
            return Err(RoomError::NotYourTurn);
        }

        // Parse and apply action
        let action: GameAction = serde_json::from_value(action)
            .map_err(|e| RoomError::InvalidAction(e.to_string()))?;

        let events = game
            .apply_action(game_index, action)
            .map_err(|e| RoomError::InvalidAction(e.to_string()))?;

        // Check if game is finished
        if game.is_finished() {
            self.status = RoomStatus::Finished;
        }

        Ok(events)
    }

    pub fn get_game_state(&self) -> Option<serde_json::Value> {
        self.game.as_ref().map(|g| serde_json::to_value(g).unwrap())
    }

    pub fn get_valid_actions(&self) -> Option<Vec<serde_json::Value>> {
        self.game.as_ref().map(|g| {
            g.valid_actions(g.current_player)
                .into_iter()
                .map(|a| serde_json::to_value(a).unwrap())
                .collect()
        })
    }

    pub fn get_current_player(&self) -> Option<usize> {
        self.game.as_ref().map(|g| g.current_player as usize)
    }

    pub fn get_winner(&self) -> Option<(usize, String)> {
        let game = self.game.as_ref()?;
        let winner_idx = game.get_winner()? as usize;
        let winner_id = self.player_order.get(winner_idx)?;
        let winner_name = self.players.get(winner_id)?.name.clone();
        Some((winner_idx, winner_name))
    }

    pub fn to_info(&self) -> RoomInfo {
        RoomInfo {
            id: self.id,
            name: self.name.clone(),
            players: self
                .player_order
                .iter()
                .filter_map(|id| self.players.get(id).map(|p| p.to_info()))
                .collect(),
            max_players: self.max_players,
            host_id: self.host_id,
            status: self.status,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_room() {
        let host_id = Uuid::new_v4();
        let room = GameRoom::new(Uuid::new_v4(), host_id, "Host".to_string(), 4);

        assert_eq!(room.player_count(), 1);
        assert!(!room.is_full());
        assert_eq!(room.host_id, host_id);
        assert_eq!(room.status, RoomStatus::Waiting);
    }

    #[test]
    fn test_add_remove_players() {
        let host_id = Uuid::new_v4();
        let mut room = GameRoom::new(Uuid::new_v4(), host_id, "Host".to_string(), 2);

        let player2 = Uuid::new_v4();
        room.add_player(player2, "Player 2".to_string()).unwrap();

        assert_eq!(room.player_count(), 2);
        assert!(room.is_full());

        // Can't add more players
        let player3 = Uuid::new_v4();
        assert!(room.add_player(player3, "Player 3".to_string()).is_err());

        // Remove a player
        let empty = room.remove_player(player2).unwrap();
        assert!(!empty);
        assert_eq!(room.player_count(), 1);
    }

    #[test]
    fn test_start_game() {
        let host_id = Uuid::new_v4();
        let mut room = GameRoom::new(Uuid::new_v4(), host_id, "Host".to_string(), 4);

        // Can't start with only 1 player
        assert!(room.start_game(host_id).is_err());

        // Add another player
        let player2 = Uuid::new_v4();
        room.add_player(player2, "Player 2".to_string()).unwrap();

        // Non-host can't start
        assert!(room.start_game(player2).is_err());

        // Host can start
        room.start_game(host_id).unwrap();
        assert_eq!(room.status, RoomStatus::InGame);
        assert!(room.game.is_some());
    }
}
