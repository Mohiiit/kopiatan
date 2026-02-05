import { createSignal, Show } from "solid-js";
import { Board } from "./components/Board";
import { PlayerHUD } from "./components/PlayerHUD";
import { Lobby } from "./components/Lobby";
import { MapEditor } from "./components/MapEditor";
import { StatsPanel } from "./components/StatsPanel";
import { gameStore, initializeGame, isFinished, getWinner, getVictoryPoints } from "./stores/gameStore";
import {
  multiplayerStore,
  setEventHandlers,
  sendGameAction,
  isMyTurn,
} from "./stores/multiplayerStore";
import "./App.css";

type GameMode = "menu" | "singleplayer-setup" | "singleplayer" | "multiplayer-lobby" | "multiplayer" | "map-editor" | "stats";

function App() {
  const [mode, setMode] = createSignal<GameMode>("menu");
  const [playerCount, setPlayerCount] = createSignal(2);
  const [playerNames, setPlayerNames] = createSignal([
    "Player 1",
    "Player 2",
    "Player 3",
    "Player 4",
  ]);

  // Set up multiplayer event handlers
  setEventHandlers({
    onGameStarted: () => {
      setMode("multiplayer");
    },
    onGameOver: (_winner, winnerName) => {
      console.log(`Game over! Winner: ${winnerName}`);
    },
  });

  async function startSinglePlayer() {
    const count = playerCount();
    const names = playerNames().slice(0, count);
    await initializeGame(count, names);
    setMode("singleplayer");
  }

  function updatePlayerName(index: number, name: string) {
    setPlayerNames((prev) => {
      const updated = [...prev];
      updated[index] = name;
      return updated;
    });
  }

  function handleMultiplayerAction(action: any) {
    sendGameAction(action);
  }

  return (
    <div class="app">
      <header>
        <h1>🥤 Kopiatan</h1>
        <p>A Singapore-themed Catan game</p>
      </header>

      <Show when={gameStore.error}>
        <div class="error">{gameStore.error}</div>
      </Show>

      {/* Main Menu */}
      <Show when={mode() === "menu"}>
        <div class="main-menu">
          <h2>Choose Game Mode</h2>
          <div class="menu-buttons">
            <button
              onClick={() => setMode("singleplayer-setup")}
              class="menu-btn"
            >
              🎮 Single Player / Local
            </button>
            <button
              onClick={() => setMode("multiplayer-lobby")}
              class="menu-btn"
            >
              🌐 Multiplayer Online
            </button>
            <button
              onClick={() => setMode("map-editor")}
              class="menu-btn secondary"
            >
              🗺️ Map Editor
            </button>
            <button
              onClick={() => setMode("stats")}
              class="menu-btn tertiary"
            >
              📊 Stats & Saved Games
            </button>
          </div>
        </div>
      </Show>

      {/* Map Editor */}
      <Show when={mode() === "map-editor"}>
        <MapEditor onClose={() => setMode("menu")} />
      </Show>

      {/* Stats Panel */}
      <Show when={mode() === "stats"}>
        <StatsPanel
          onLoadGame={(state) => {
            // TODO: Load saved game state
            console.log("Load game:", state);
            setMode("menu");
          }}
          onClose={() => setMode("menu")}
        />
      </Show>

      {/* Single Player Setup */}
      <Show when={mode() === "singleplayer-setup"}>
        <div class="setup-screen">
          <button onClick={() => setMode("menu")} class="back-btn">
            ← Back
          </button>
          <h2>New Local Game</h2>

          <div class="player-count">
            <label>Number of Players:</label>
            <select
              value={playerCount()}
              onChange={(e) => setPlayerCount(parseInt(e.target.value))}
            >
              <option value={2}>2 Players</option>
              <option value={3}>3 Players</option>
              <option value={4}>4 Players</option>
            </select>
          </div>

          <div class="player-names">
            {Array.from({ length: playerCount() }).map((_, i) => (
              <div class="player-name-input">
                <label>Player {i + 1}:</label>
                <input
                  type="text"
                  value={playerNames()[i]}
                  onInput={(e) => updatePlayerName(i, e.target.value)}
                />
              </div>
            ))}
          </div>

          <button onClick={startSinglePlayer} class="start-btn">
            Start Game
          </button>
        </div>
      </Show>

      {/* Multiplayer Lobby */}
      <Show when={mode() === "multiplayer-lobby"}>
        <div class="multiplayer-container">
          <button onClick={() => setMode("menu")} class="back-btn">
            ← Back
          </button>
          <Lobby onGameStart={() => setMode("multiplayer")} />
        </div>
      </Show>

      {/* Single Player Game */}
      <Show when={mode() === "singleplayer" && !gameStore.isLoading}>
        <div class="game-container">
          <div class="board-wrapper">
            <Board width={800} height={700} />
          </div>

          <div class="sidebar">
            <PlayerHUD />

            <Show when={isFinished()}>
              <div class="game-over">
                <h2>🎉 Game Over!</h2>
                <p>Winner: {gameStore.state?.players[getWinner()!]?.name}</p>
                <p>Victory Points: {getVictoryPoints(getWinner()!)}</p>
                <button onClick={() => setMode("menu")}>Back to Menu</button>
              </div>
            </Show>

            <div class="all-players">
              <h3>All Players</h3>
              {gameStore.state?.players.map((player: any, i: number) => (
                <div
                  class={`player-summary ${
                    i === gameStore.currentPlayer ? "current" : ""
                  }`}
                >
                  <span
                    class="color-dot"
                    style={{
                      "background-color": getPlayerColorCSS(player.color),
                    }}
                  />
                  <span class="name">{player.name}</span>
                  <span class="vp">{getVictoryPoints(i)} VP</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Show>

      {/* Multiplayer Game */}
      <Show when={mode() === "multiplayer" && multiplayerStore.gameState}>
        <div class="game-container">
          <div class="board-wrapper">
            <MultiplayerBoard
              gameState={multiplayerStore.gameState}
              validActions={multiplayerStore.validActions}
              currentPlayer={multiplayerStore.currentPlayer}
              isMyTurn={isMyTurn()}
              onAction={handleMultiplayerAction}
            />
          </div>

          <div class="sidebar">
            <MultiplayerHUD
              gameState={multiplayerStore.gameState}
              validActions={multiplayerStore.validActions}
              currentPlayer={multiplayerStore.currentPlayer}
              isMyTurn={isMyTurn()}
              onAction={handleMultiplayerAction}
            />

            <Show when={multiplayerStore.room?.status === "Finished"}>
              <div class="game-over">
                <h2>🎉 Game Over!</h2>
                <button onClick={() => setMode("menu")}>Back to Menu</button>
              </div>
            </Show>

            <div class="all-players">
              <h3>All Players</h3>
              {multiplayerStore.gameState?.players.map(
                (player: any, i: number) => (
                  <div
                    class={`player-summary ${
                      i === multiplayerStore.currentPlayer ? "current" : ""
                    }`}
                  >
                    <span
                      class="color-dot"
                      style={{
                        "background-color": getPlayerColorCSS(player.color),
                      }}
                    />
                    <span class="name">{player.name}</span>
                    <span class="vp">{player.victory_points || 0} VP</span>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </Show>

      <Show when={gameStore.isLoading}>
        <div class="loading">Loading game...</div>
      </Show>
    </div>
  );
}

// Simplified multiplayer board component (reuses single-player logic but with multiplayer store)
function MultiplayerBoard(props: {
  gameState: any;
  validActions: any[];
  currentPlayer: number;
  isMyTurn: boolean;
  onAction: (action: any) => void;
}) {
  // For now, we'll render a simplified version
  // Full implementation would mirror the Board component but use multiplayer state
  return (
    <div class="multiplayer-board">
      <canvas width={800} height={700} style={{ border: "2px solid #333", background: "#1e90ff" }} />
      <div class="board-overlay">
        <p>Multiplayer board view</p>
        <p>Current turn: Player {props.currentPlayer + 1}</p>
        <p>{props.isMyTurn ? "Your turn!" : "Waiting for other player..."}</p>
      </div>
    </div>
  );
}

// Simplified multiplayer HUD
function MultiplayerHUD(props: {
  gameState: any;
  validActions: any[];
  currentPlayer: number;
  isMyTurn: boolean;
  onAction: (action: any) => void;
}) {
  const canRoll = () => props.validActions.some((a: any) => a === "RollDice");
  const canEndTurn = () => props.validActions.some((a: any) => a === "EndTurn");

  return (
    <div class="player-hud">
      <Show when={props.gameState}>
        <div class="player-info">
          <h2>
            {props.gameState.players[props.currentPlayer]?.name}'s Turn
          </h2>
          <p class="turn-indicator">
            {props.isMyTurn ? "Your turn!" : "Waiting..."}
          </p>
        </div>

        <Show when={props.isMyTurn}>
          <div class="actions">
            <Show when={canRoll()}>
              <button
                onClick={() => props.onAction("RollDice")}
                class="action-btn primary"
              >
                🎲 Roll Dice
              </button>
            </Show>

            <Show when={canEndTurn()}>
              <button
                onClick={() => props.onAction("EndTurn")}
                class="action-btn secondary"
              >
                ⏭️ End Turn
              </button>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function getPlayerColorCSS(color: string): string {
  const colors: Record<string, string> = {
    Red: "#e74c3c",
    Blue: "#3498db",
    Orange: "#e67e22",
    White: "#ecf0f1",
  };
  return colors[color] || "#ffffff";
}

export default App;
