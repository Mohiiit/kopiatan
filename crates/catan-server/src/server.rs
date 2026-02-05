//! WebSocket server and connection handling.

use crate::protocol::{ClientMessage, RoomStatus, ServerMessage};
use crate::room::GameRoom;
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{error, info, warn};
use uuid::Uuid;

/// Server state shared across all connections.
pub struct ServerState {
    /// All active rooms
    pub rooms: DashMap<Uuid, GameRoom>,
    /// Mapping from player ID to their room ID
    pub player_rooms: DashMap<Uuid, Uuid>,
    /// Mapping from player ID to their message sender
    pub player_senders: DashMap<Uuid, mpsc::UnboundedSender<ServerMessage>>,
}

impl ServerState {
    pub fn new() -> Self {
        Self {
            rooms: DashMap::new(),
            player_rooms: DashMap::new(),
            player_senders: DashMap::new(),
        }
    }

    /// Send a message to a specific player.
    pub fn send_to_player(&self, player_id: Uuid, msg: ServerMessage) {
        if let Some(sender) = self.player_senders.get(&player_id) {
            let _ = sender.send(msg);
        }
    }

    /// Broadcast a message to all players in a room.
    pub fn broadcast_to_room(&self, room_id: Uuid, msg: ServerMessage) {
        if let Some(room) = self.rooms.get(&room_id) {
            for player_id in room.players.keys() {
                self.send_to_player(*player_id, msg.clone());
            }
        }
    }

    /// Broadcast a message to all players in a room except one.
    pub fn broadcast_to_room_except(&self, room_id: Uuid, except: Uuid, msg: ServerMessage) {
        if let Some(room) = self.rooms.get(&room_id) {
            for player_id in room.players.keys() {
                if *player_id != except {
                    self.send_to_player(*player_id, msg.clone());
                }
            }
        }
    }

    /// Get list of waiting rooms.
    pub fn get_waiting_rooms(&self) -> Vec<crate::protocol::RoomInfo> {
        self.rooms
            .iter()
            .filter(|r| r.status == RoomStatus::Waiting)
            .map(|r| r.to_info())
            .collect()
    }
}

impl Default for ServerState {
    fn default() -> Self {
        Self::new()
    }
}

/// Run the WebSocket server.
pub async fn run_server(addr: SocketAddr, state: Arc<ServerState>) -> anyhow::Result<()> {
    let listener = TcpListener::bind(addr).await?;
    info!("Kopiatan server listening on {}", addr);

    while let Ok((stream, peer_addr)) = listener.accept().await {
        let state = Arc::clone(&state);
        tokio::spawn(async move {
            if let Err(e) = handle_connection(stream, peer_addr, state).await {
                error!("Connection error from {}: {}", peer_addr, e);
            }
        });
    }

    Ok(())
}

/// Handle a single WebSocket connection.
async fn handle_connection(
    stream: TcpStream,
    addr: SocketAddr,
    state: Arc<ServerState>,
) -> anyhow::Result<()> {
    let ws_stream = accept_async(stream).await?;
    info!("New WebSocket connection from {}", addr);

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // Assign a player ID
    let player_id = Uuid::new_v4();

    // Create channel for outgoing messages
    let (tx, mut rx) = mpsc::unbounded_channel::<ServerMessage>();
    state.player_senders.insert(player_id, tx);

    // Send welcome message
    let welcome = ServerMessage::Welcome { player_id };
    let msg_text = serde_json::to_string(&welcome)?;
    ws_sender.send(Message::Text(msg_text.into())).await?;

    // Spawn task to forward messages from channel to WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if let Ok(text) = serde_json::to_string(&msg) {
                if ws_sender.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    // Handle incoming messages
    while let Some(msg) = ws_receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                    handle_message(player_id, client_msg, &state);
                } else {
                    warn!("Invalid message from {}: {}", player_id, text);
                }
            }
            Ok(Message::Close(_)) => {
                info!("Client {} closing connection", player_id);
                break;
            }
            Ok(Message::Ping(data)) => {
                state.send_to_player(player_id, ServerMessage::Pong);
                let _ = data; // Just consume it
            }
            Err(e) => {
                error!("WebSocket error from {}: {}", player_id, e);
                break;
            }
            _ => {}
        }
    }

    // Clean up on disconnect
    handle_disconnect(player_id, &state);
    state.player_senders.remove(&player_id);
    send_task.abort();

    info!("Connection closed for {}", player_id);
    Ok(())
}

/// Handle a client message.
fn handle_message(player_id: Uuid, msg: ClientMessage, state: &Arc<ServerState>) {
    match msg {
        ClientMessage::CreateRoom {
            player_name,
            max_players,
        } => {
            let room_id = Uuid::new_v4();
            let room = GameRoom::new(room_id, player_id, player_name, max_players);
            let room_info = room.to_info();

            state.rooms.insert(room_id, room);
            state.player_rooms.insert(player_id, room_id);

            state.send_to_player(player_id, ServerMessage::RoomCreated { room_id });
            state.send_to_player(player_id, ServerMessage::JoinedRoom { room: room_info });
        }

        ClientMessage::JoinRoom {
            room_id,
            player_name,
        } => {
            if let Some(mut room) = state.rooms.get_mut(&room_id) {
                match room.add_player(player_id, player_name) {
                    Ok(()) => {
                        let room_info = room.to_info();
                        state.player_rooms.insert(player_id, room_id);

                        state
                            .send_to_player(player_id, ServerMessage::JoinedRoom { room: room_info.clone() });

                        // Notify other players
                        drop(room); // Release lock before broadcasting
                        state.broadcast_to_room_except(
                            room_id,
                            player_id,
                            ServerMessage::RoomUpdated { room: room_info },
                        );
                    }
                    Err(e) => {
                        state.send_to_player(
                            player_id,
                            ServerMessage::Error {
                                message: e.to_string(),
                            },
                        );
                    }
                }
            } else {
                state.send_to_player(
                    player_id,
                    ServerMessage::Error {
                        message: "Room not found".to_string(),
                    },
                );
            }
        }

        ClientMessage::LeaveRoom => {
            if let Some((_, room_id)) = state.player_rooms.remove(&player_id) {
                let should_remove = {
                    if let Some(mut room) = state.rooms.get_mut(&room_id) {
                        let is_empty = room.remove_player(player_id).unwrap_or(false);

                        if !is_empty {
                            let room_info = room.to_info();
                            drop(room);
                            state.broadcast_to_room(room_id, ServerMessage::RoomUpdated { room: room_info });
                        }

                        is_empty
                    } else {
                        false
                    }
                };

                if should_remove {
                    state.rooms.remove(&room_id);
                }

                state.send_to_player(player_id, ServerMessage::LeftRoom);
            }
        }

        ClientMessage::StartGame => {
            if let Some(&room_id) = state.player_rooms.get(&player_id).as_deref() {
                if let Some(mut room) = state.rooms.get_mut(&room_id) {
                    match room.start_game(player_id) {
                        Ok(()) => {
                            let game_state = room.get_game_state().unwrap();
                            let valid_actions = room.get_valid_actions().unwrap();
                            let current_player = room.get_current_player().unwrap();

                            drop(room);

                            state.broadcast_to_room(
                                room_id,
                                ServerMessage::GameStarted { state: game_state },
                            );
                            state.broadcast_to_room(
                                room_id,
                                ServerMessage::ValidActions {
                                    actions: valid_actions,
                                },
                            );
                            state.broadcast_to_room(
                                room_id,
                                ServerMessage::TurnChanged {
                                    player_id: current_player,
                                },
                            );
                        }
                        Err(e) => {
                            state.send_to_player(
                                player_id,
                                ServerMessage::Error {
                                    message: e.to_string(),
                                },
                            );
                        }
                    }
                }
            }
        }

        ClientMessage::GameAction { action } => {
            if let Some(&room_id) = state.player_rooms.get(&player_id).as_deref() {
                if let Some(mut room) = state.rooms.get_mut(&room_id) {
                    match room.apply_action(player_id, action) {
                        Ok(events) => {
                            let game_state = room.get_game_state().unwrap();
                            let valid_actions = room.get_valid_actions().unwrap();
                            let current_player = room.get_current_player().unwrap();
                            let winner = room.get_winner();

                            drop(room);

                            // Send action result to the acting player
                            state.send_to_player(
                                player_id,
                                ServerMessage::ActionResult {
                                    success: true,
                                    events: events
                                        .iter()
                                        .map(|e| serde_json::to_value(e).unwrap())
                                        .collect(),
                                    error: None,
                                },
                            );

                            // Broadcast updated game state
                            state.broadcast_to_room(
                                room_id,
                                ServerMessage::GameState { state: game_state },
                            );
                            state.broadcast_to_room(
                                room_id,
                                ServerMessage::ValidActions {
                                    actions: valid_actions,
                                },
                            );
                            state.broadcast_to_room(
                                room_id,
                                ServerMessage::TurnChanged {
                                    player_id: current_player,
                                },
                            );

                            // Check for game over
                            if let Some((winner_idx, winner_name)) = winner {
                                state.broadcast_to_room(
                                    room_id,
                                    ServerMessage::GameOver {
                                        winner: winner_idx,
                                        winner_name,
                                    },
                                );
                            }
                        }
                        Err(e) => {
                            state.send_to_player(
                                player_id,
                                ServerMessage::ActionResult {
                                    success: false,
                                    events: vec![],
                                    error: Some(e.to_string()),
                                },
                            );
                        }
                    }
                }
            }
        }

        ClientMessage::Chat { message } => {
            if let Some(&room_id) = state.player_rooms.get(&player_id).as_deref() {
                let player_name = state
                    .rooms
                    .get(&room_id)
                    .and_then(|r| r.players.get(&player_id).map(|p| p.name.clone()))
                    .unwrap_or_else(|| "Unknown".to_string());

                state.broadcast_to_room(
                    room_id,
                    ServerMessage::ChatMessage {
                        player_name,
                        message,
                    },
                );
            }
        }

        ClientMessage::ListRooms => {
            let rooms = state.get_waiting_rooms();
            state.send_to_player(player_id, ServerMessage::RoomList { rooms });
        }

        ClientMessage::Ping => {
            state.send_to_player(player_id, ServerMessage::Pong);
        }
    }
}

/// Handle player disconnect.
fn handle_disconnect(player_id: Uuid, state: &Arc<ServerState>) {
    if let Some((_, room_id)) = state.player_rooms.remove(&player_id) {
        if let Some(mut room) = state.rooms.get_mut(&room_id) {
            // Mark player as disconnected instead of removing during game
            if room.status == RoomStatus::InGame {
                room.set_player_connected(player_id, false);
                let room_info = room.to_info();
                drop(room);
                state.broadcast_to_room(room_id, ServerMessage::RoomUpdated { room: room_info });
            } else {
                // Remove player if game hasn't started
                let is_empty = room.remove_player(player_id).unwrap_or(false);
                if is_empty {
                    drop(room);
                    state.rooms.remove(&room_id);
                } else {
                    let room_info = room.to_info();
                    drop(room);
                    state.broadcast_to_room(room_id, ServerMessage::RoomUpdated { room: room_info });
                }
            }
        }
    }
}
