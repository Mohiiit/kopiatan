import { createSignal, Show } from "solid-js";
import { Board } from "./components/Board";
import { PlayerHUD } from "./components/PlayerHUD";
import { gameStore, initializeGame, isFinished, getWinner, getVictoryPoints } from "./stores/gameStore";
import "./App.css";

function App() {
  const [gameStarted, setGameStarted] = createSignal(false);
  const [playerCount, setPlayerCount] = createSignal(2);
  const [playerNames, setPlayerNames] = createSignal(["Player 1", "Player 2", "Player 3", "Player 4"]);

  async function startGame() {
    const count = playerCount();
    const names = playerNames().slice(0, count);
    await initializeGame(count, names);
    setGameStarted(true);
  }

  function updatePlayerName(index: number, name: string) {
    setPlayerNames((prev) => {
      const updated = [...prev];
      updated[index] = name;
      return updated;
    });
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

      <Show when={!gameStarted()}>
        <div class="setup-screen">
          <h2>New Game</h2>

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

          <button onClick={startGame} class="start-btn">
            Start Game
          </button>
        </div>
      </Show>

      <Show when={gameStarted() && !gameStore.isLoading}>
        <div class="game-container">
          <div class="board-wrapper">
            <Board width={800} height={700} />
          </div>

          <div class="sidebar">
            <PlayerHUD />

            <Show when={isFinished()}>
              <div class="game-over">
                <h2>🎉 Game Over!</h2>
                <p>
                  Winner: {gameStore.state?.players[getWinner()!]?.name}
                </p>
                <p>Victory Points: {getVictoryPoints(getWinner()!)}</p>
                <button onClick={() => setGameStarted(false)}>
                  New Game
                </button>
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

      <Show when={gameStore.isLoading}>
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
