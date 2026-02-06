import { createSignal, Show, onMount, createEffect } from "solid-js";
import { Board } from "./components/Board";
import { PlayerHUD } from "./components/PlayerHUD";
import { Lobby } from "./components/Lobby";
import { MapEditor } from "./components/MapEditor";
import { StatsPanel } from "./components/StatsPanel";
import { MultiplayerBoard } from "./components/MultiplayerBoard";
import { MultiplayerHUD } from "./components/MultiplayerHUD";
import { SoundControl } from "./components/SoundControl";
import { gameStore, initializeGame, isFinished, getWinner, getVictoryPoints } from "./stores/gameStore";
import {
  multiplayerStore,
  setEventHandlers,
  sendGameAction,
  isMyTurn,
  getMyPlayerIndex,
} from "./stores/multiplayerStore";
import { SoundManager } from "./utils/SoundManager";
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


  // Initialize sound manager on first user interaction
  onMount(() => {
    const initSound = () => {
      SoundManager.init();
      document.removeEventListener('click', initSound);
      document.removeEventListener('keydown', initSound);
    };
    document.addEventListener('click', initSound);
    document.addEventListener('keydown', initSound);
  });

  // Set up multiplayer event handlers
  setEventHandlers({
    onGameStarted: () => {
      SoundManager.play('gameStart');
      setMode("multiplayer");
    },
    onGameOver: (_winner, winnerName) => {
      SoundManager.play('victory');
      console.log(`Game over! Winner: ${winnerName}`);
    },
  });

  // Track resources for resource collection sound
  let lastResourceState: string | null = null;
  createEffect(() => {
    if (multiplayerStore.gameState?.players) {
      const myIndex = getMyPlayerIndex();
      if (myIndex !== null) {
        const myResources = multiplayerStore.gameState.players[myIndex]?.resources;
        if (myResources) {
          const resourceStr = JSON.stringify(myResources);
          if (lastResourceState !== null && resourceStr !== lastResourceState) {
            // Check if resources increased (not decreased)
            const prev = JSON.parse(lastResourceState);
            const current = myResources;
            const gained = ['brick', 'lumber', 'ore', 'grain', 'wool'].some(
              (r) => (current[r] || 0) > (prev[r] || 0)
            );
            if (gained) {
              SoundManager.play('collectResources');
            }
          }
          lastResourceState = resourceStr;
        }
      }
    }
  });

  async function startSinglePlayer() {
    const count = playerCount();
    const names = playerNames().slice(0, count);
    try {
      await initializeGame(count, names);
      setMode("singleplayer");
    } catch (e) {
      console.error("Error starting game:", e);
    }
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
    <div class={`app ${mode() === "singleplayer" || mode() === "multiplayer" ? "in-game" : ""}`}>
      <header>
        <div class="header-content">
          <div class="header-title">
            <h1>🥤 Kopiatan</h1>
            <p>A Singapore-themed Catan game</p>
          </div>
          <SoundControl />
        </div>
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
            <Board width={880} height={760} />
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

            <div class="hud-players">
              <h4>Players</h4>
              <Show when={gameStore.state?.players}>
                {(players) => (
                  <div class="players-list">
                    {players().map((player: any, i: number) => (
                      <div
                        class="player-card-item"
                        classList={{
                          "is-current-turn": i === gameStore.currentPlayer,
                        }}
                        style={{ "--player-color": getPlayerColorCSS(player.color) }}
                      >
                        <div class="player-card-left">
                          <div class="player-color-indicator" />
                          <div class="player-card-info">
                            <span class="player-card-name">{player.name}</span>
                            <Show when={i === gameStore.currentPlayer}>
                              <span class="turn-tag">Playing</span>
                            </Show>
                          </div>
                        </div>
                        <div class="player-card-right">
                          <div class="vp-display">
                            <span class="vp-icon">🏆</span>
                            <span class="vp-value">{getVictoryPoints(i)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Show>
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
              myPlayerIndex={getMyPlayerIndex()}
              onAction={handleMultiplayerAction}
            />

            <Show when={multiplayerStore.room?.status === "Finished"}>
              <div class="game-over">
                <h2>🎉 Game Over!</h2>
                <button onClick={() => setMode("menu")}>Back to Menu</button>
              </div>
            </Show>
          </div>
        </div>
      </Show>

      <Show when={gameStore.isLoading && mode() === "singleplayer"}>
        <div class="loading">Loading game...</div>
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
