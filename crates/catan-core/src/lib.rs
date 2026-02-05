//! Kopiatan - A Singapore-themed Catan game engine
//!
//! This crate provides the core game logic for Kopiatan, including:
//! - Hex coordinate system for the game board
//! - Board representation with tiles, vertices, and edges
//! - Player state and resource management
//! - Game state machine with full rule enforcement
//!
//! # Architecture
//!
//! The game engine is designed to be platform-agnostic. It can be compiled to:
//! - Native Rust for server-side game hosting
//! - WebAssembly for client-side single-player or local multiplayer
//!
//! # Modules
//!
//! - [`hex`]: Coordinate system for hex tiles, vertices, and edges
//! - [`board`]: Game board representation (coming soon)
//! - [`player`]: Player state and resources (coming soon)
//! - [`game`]: Game state machine (coming soon)

pub mod actions;
pub mod board;
pub mod game;
pub mod hex;
pub mod player;

// Re-export commonly used types
pub use actions::{GameAction, GameEvent, TradeOffer};
pub use board::{Board, EdgeBuilding, Harbor, PlayerId, Resource, Tile, TileType, VertexBuilding};
pub use game::{GameError, GamePhase, GameState, SetupPlacing};
pub use hex::{EdgeCoord, EdgeDirection, HexCoord, VertexCoord, VertexDirection};
pub use player::{DevelopmentCard, Player, PlayerColor, ResourceHand};
