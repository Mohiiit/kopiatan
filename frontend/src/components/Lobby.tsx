import { Show, For, createSignal, onMount, onCleanup } from "solid-js";
import type { Component } from "solid-js";
import {
  multiplayerStore,
  connect,
  disconnect,
  createRoom,
  joinRoom,
  leaveRoom,
  startGame,
  listRooms,
  sendChat,
  isHost,
  canStartGame,
} from "../stores/multiplayerStore";

interface LobbyProps {
  onGameStart: () => void;
}

export const Lobby: Component<LobbyProps> = (_props) => {
  const [playerName, setPlayerName] = createSignal("Player");
  const [maxPlayers, setMaxPlayers] = createSignal(4);
  const [serverUrl, setServerUrl] = createSignal("ws://localhost:8080");
  const [chatInput, setChatInput] = createSignal("");
  const [view, setView] = createSignal<"connect" | "browse" | "room">("connect");

  let refreshInterval: number | undefined;

  onMount(() => {
    // Refresh room list periodically when browsing
    refreshInterval = setInterval(() => {
      if (view() === "browse" && multiplayerStore.connected) {
        listRooms();
      }
    }, 3000);
  });

  onCleanup(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });

  async function handleConnect() {
    try {
      await connect(serverUrl());
      setView("browse");
      listRooms();
    } catch (e) {
      console.error("Failed to connect:", e);
    }
  }

  function handleDisconnect() {
    disconnect();
    setView("connect");
  }

  function handleCreateRoom() {
    createRoom(playerName(), maxPlayers());
    setView("room");
  }

  function handleJoinRoom(roomId: string) {
    joinRoom(roomId, playerName());
    setView("room");
  }

  function handleLeaveRoom() {
    leaveRoom();
    setView("browse");
    listRooms();
  }

  function handleStartGame() {
    startGame();
    // Note: The onGameStart callback is triggered by the multiplayerStore
    // when it receives the GameStarted message from the server
  }

  function handleSendChat(e: Event) {
    e.preventDefault();
    if (chatInput().trim()) {
      sendChat(chatInput());
      setChatInput("");
    }
  }

  return (
    <div class="lobby">
      <Show when={multiplayerStore.error}>
        <div class="error-banner">{multiplayerStore.error}</div>
      </Show>

      {/* Connect Screen */}
      <Show when={view() === "connect"}>
        <div class="connect-screen">
          <h2>Multiplayer</h2>
          <div class="form-group">
            <label>Your Name:</label>
            <input
              type="text"
              value={playerName()}
              onInput={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
            />
          </div>
          <div class="form-group">
            <label>Server:</label>
            <input
              type="text"
              value={serverUrl()}
              onInput={(e) => setServerUrl(e.target.value)}
              placeholder="ws://localhost:8080"
            />
          </div>
          <button onClick={handleConnect} class="btn-primary">
            Connect
          </button>
        </div>
      </Show>

      {/* Browse Rooms Screen */}
      <Show when={view() === "browse"}>
        <div class="browse-screen">
          <div class="header-row">
            <h2>Game Lobby</h2>
            <button onClick={handleDisconnect} class="btn-secondary">
              Disconnect
            </button>
          </div>

          <div class="create-room-section">
            <h3>Create New Game</h3>
            <div class="form-row">
              <select
                value={maxPlayers()}
                onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
              >
                <option value={2}>2 Players</option>
                <option value={3}>3 Players</option>
                <option value={4}>4 Players</option>
              </select>
              <button onClick={handleCreateRoom} class="btn-primary">
                Create Room
              </button>
            </div>
          </div>

          <div class="rooms-section">
            <h3>Available Games</h3>
            <Show
              when={multiplayerStore.rooms.length > 0}
              fallback={<p class="no-rooms">No games available. Create one!</p>}
            >
              <div class="room-list">
                <For each={multiplayerStore.rooms}>
                  {(room) => (
                    <div class="room-card">
                      <div class="room-info">
                        <span class="room-name">{room.name}</span>
                        <span class="room-players">
                          {room.players.length}/{room.max_players} players
                        </span>
                      </div>
                      <button
                        onClick={() => handleJoinRoom(room.id)}
                        disabled={room.players.length >= room.max_players}
                        class="btn-join"
                      >
                        Join
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <button onClick={() => listRooms()} class="btn-refresh">
              Refresh
            </button>
          </div>
        </div>
      </Show>

      {/* Room Screen */}
      <Show when={view() === "room" && multiplayerStore.room}>
        <div class="room-screen">
          <div class="header-row">
            <h2>{multiplayerStore.room!.name}</h2>
            <button onClick={handleLeaveRoom} class="btn-secondary">
              Leave Room
            </button>
          </div>

          <div class="players-section">
            <h3>Players</h3>
            <div class="player-list">
              <For each={multiplayerStore.room!.players}>
                {(player) => (
                  <div
                    class={`player-card ${
                      player.id === multiplayerStore.room!.host_id ? "host" : ""
                    } ${!player.connected ? "disconnected" : ""}`}
                  >
                    <span class="player-name">
                      {player.name}
                      {player.id === multiplayerStore.room!.host_id && (
                        <span class="host-badge">Host</span>
                      )}
                      {player.id === multiplayerStore.playerId && (
                        <span class="you-badge">You</span>
                      )}
                    </span>
                    <span class="connection-status">
                      {player.connected ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                )}
              </For>
            </div>

            <div class="waiting-message">
              Waiting for players... ({multiplayerStore.room!.players.length}/
              {multiplayerStore.room!.max_players})
            </div>
          </div>

          <Show when={isHost()}>
            <div class="host-controls">
              <button
                onClick={handleStartGame}
                disabled={!canStartGame()}
                class="btn-primary btn-large"
              >
                Start Game
              </button>
              <Show when={!canStartGame()}>
                <p class="hint">Need at least 2 players to start</p>
              </Show>
            </div>
          </Show>

          <Show when={!isHost()}>
            <div class="waiting-host">
              <p>Waiting for host to start the game...</p>
            </div>
          </Show>

          {/* Chat */}
          <div class="chat-section">
            <h3>Chat</h3>
            <div class="chat-messages">
              <For each={multiplayerStore.chatMessages}>
                {(msg) => (
                  <div class="chat-message">
                    <span class="chat-author">{msg.playerName}:</span>
                    <span class="chat-text">{msg.message}</span>
                  </div>
                )}
              </For>
            </div>
            <form onSubmit={handleSendChat} class="chat-input">
              <input
                type="text"
                value={chatInput()}
                onInput={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
              />
              <button type="submit">Send</button>
            </form>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default Lobby;
