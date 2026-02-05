//! Kopiatan multiplayer game server.

use std::net::SocketAddr;
use std::sync::Arc;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod protocol;
mod room;
mod server;

use server::ServerState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Parse address from env or use default
    let addr: SocketAddr = std::env::var("SERVER_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:8080".into())
        .parse()?;

    info!("Starting Kopiatan server...");

    let state = Arc::new(ServerState::new());

    server::run_server(addr, state).await
}
