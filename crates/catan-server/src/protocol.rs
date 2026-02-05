//! WebSocket protocol messages for Kopiatan multiplayer.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Messages sent from client to server.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ClientMessage {
    /// Create a new game room
    CreateRoom { player_name: String, max_players: u8 },

    /// Join an existing room
    JoinRoom { room_id: Uuid, player_name: String },

    /// Leave current room
    LeaveRoom,

    /// Start the game (host only)
    StartGame,

    /// Submit a game action
    GameAction { action: serde_json::Value },

    /// Send chat message
    Chat { message: String },

    /// Request room list
    ListRooms,

    /// Ping for keepalive
    Ping,
}

/// Messages sent from server to client.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ServerMessage {
    /// Welcome message with assigned player ID
    Welcome { player_id: Uuid },

    /// Room created successfully
    RoomCreated { room_id: Uuid },

    /// Joined room successfully
    JoinedRoom { room: RoomInfo },

    /// Left room successfully
    LeftRoom,

    /// Room state updated (player joined/left)
    RoomUpdated { room: RoomInfo },

    /// Game started
    GameStarted { state: serde_json::Value },

    /// Game state updated
    GameState { state: serde_json::Value },

    /// Action applied successfully
    ActionResult {
        success: bool,
        events: Vec<serde_json::Value>,
        error: Option<String>,
    },

    /// Valid actions for current player
    ValidActions { actions: Vec<serde_json::Value> },

    /// Current player changed
    TurnChanged { player_id: usize },

    /// Chat message received
    ChatMessage { player_name: String, message: String },

    /// List of available rooms
    RoomList { rooms: Vec<RoomInfo> },

    /// Error occurred
    Error { message: String },

    /// Pong response
    Pong,

    /// Game finished
    GameOver { winner: usize, winner_name: String },
}

/// Room information for clients.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomInfo {
    pub id: Uuid,
    pub name: String,
    pub players: Vec<PlayerInfo>,
    pub max_players: u8,
    pub host_id: Uuid,
    pub status: RoomStatus,
}

/// Player information in a room.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerInfo {
    pub id: Uuid,
    pub name: String,
    pub ready: bool,
    pub connected: bool,
}

/// Room status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RoomStatus {
    Waiting,
    InGame,
    Finished,
}
