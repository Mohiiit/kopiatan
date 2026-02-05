import { Show, For, createSignal, onMount } from "solid-js";
import type { Component } from "solid-js";
import {
  persistenceStore,
  initPersistence,
  getLeaderboard,
  getAllPlayerStats,
  loadGame,
  deleteGame,
  renameGame,
  exportAllData,
  importAllData,
  clearAllData,
} from "../stores/persistenceStore";

interface StatsPanelProps {
  onLoadGame: (gameState: any) => void;
  onClose: () => void;
}

export const StatsPanel: Component<StatsPanelProps> = (props) => {
  const [activeTab, setActiveTab] = createSignal<"saved" | "stats" | "leaderboard">("saved");
  const [editingGameId, setEditingGameId] = createSignal<string | null>(null);
  const [editingName, setEditingName] = createSignal("");

  onMount(() => {
    initPersistence();
  });

  function handleLoadGame(id: string) {
    const state = loadGame(id);
    if (state) {
      props.onLoadGame(state);
      props.onClose();
    }
  }

  function handleDeleteGame(id: string, e: Event) {
    e.stopPropagation();
    if (confirm("Delete this saved game?")) {
      deleteGame(id);
    }
  }

  function handleStartRename(id: string, currentName: string, e: Event) {
    e.stopPropagation();
    setEditingGameId(id);
    setEditingName(currentName);
  }

  function handleFinishRename(id: string) {
    if (editingName().trim()) {
      renameGame(id, editingName().trim());
    }
    setEditingGameId(null);
    setEditingName("");
  }

  function handleExport() {
    const data = exportAllData();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kopiatan_data_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      const success = importAllData(ev.target?.result as string);
      if (success) {
        alert("Data imported successfully!");
      } else {
        alert("Failed to import data");
      }
    };
    reader.readAsText(file);
  }

  function handleClearData() {
    if (confirm("This will delete ALL saved games and stats. Are you sure?")) {
      clearAllData();
    }
  }

  function formatDate(isoString: string): string {
    return new Date(isoString).toLocaleString();
  }

  function formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  return (
    <div class="stats-panel">
      <div class="stats-header">
        <h2>Game Data</h2>
        <button onClick={props.onClose} class="close-btn">
          Close
        </button>
      </div>

      <div class="stats-tabs">
        <button
          class={activeTab() === "saved" ? "active" : ""}
          onClick={() => setActiveTab("saved")}
        >
          Saved Games
        </button>
        <button
          class={activeTab() === "stats" ? "active" : ""}
          onClick={() => setActiveTab("stats")}
        >
          Player Stats
        </button>
        <button
          class={activeTab() === "leaderboard" ? "active" : ""}
          onClick={() => setActiveTab("leaderboard")}
        >
          Leaderboard
        </button>
      </div>

      <div class="stats-content">
        {/* Saved Games */}
        <Show when={activeTab() === "saved"}>
          <div class="saved-games">
            <Show
              when={persistenceStore.savedGames.length > 0}
              fallback={<p class="empty-message">No saved games yet</p>}
            >
              <div class="game-list">
                <For each={persistenceStore.savedGames}>
                  {(game) => (
                    <div class="game-card" onClick={() => handleLoadGame(game.id)}>
                      <Show
                        when={editingGameId() !== game.id}
                        fallback={
                          <input
                            type="text"
                            value={editingName()}
                            onInput={(e) => setEditingName(e.target.value)}
                            onBlur={() => handleFinishRename(game.id)}
                            onKeyDown={(e) =>
                              e.key === "Enter" && handleFinishRename(game.id)
                            }
                            onClick={(e) => e.stopPropagation()}
                            autofocus
                          />
                        }
                      >
                        <div class="game-info">
                          <h3>{game.name}</h3>
                          <p class="game-meta">
                            {game.playerNames.join(" vs ")}
                          </p>
                          <p class="game-meta">
                            Turn {game.turnNumber} • {formatDate(game.updatedAt)}
                          </p>
                        </div>
                      </Show>
                      <div class="game-actions">
                        <button
                          onClick={(e) => handleStartRename(game.id, game.name, e)}
                          title="Rename"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => handleDeleteGame(game.id, e)}
                          class="delete"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>

        {/* Player Stats */}
        <Show when={activeTab() === "stats"}>
          <div class="player-stats">
            <Show
              when={Object.keys(persistenceStore.playerStats).length > 0}
              fallback={<p class="empty-message">No player stats yet. Complete some games!</p>}
            >
              <div class="stats-grid">
                <For each={getAllPlayerStats()}>
                  {(stats) => (
                    <div class="player-stat-card">
                      <h3>{stats.playerName}</h3>
                      <div class="stat-row">
                        <span>Games Played</span>
                        <span>{stats.gamesPlayed}</span>
                      </div>
                      <div class="stat-row">
                        <span>Wins</span>
                        <span>{stats.gamesWon}</span>
                      </div>
                      <div class="stat-row">
                        <span>Win Rate</span>
                        <span>
                          {stats.gamesPlayed > 0
                            ? formatPercent((stats.gamesWon / stats.gamesPlayed) * 100)
                            : "0%"}
                        </span>
                      </div>
                      <div class="stat-row">
                        <span>Avg VP</span>
                        <span>{stats.averageVP.toFixed(1)}</span>
                      </div>
                      <div class="stat-row">
                        <span>Longest Roads</span>
                        <span>{stats.longestRoadCount}</span>
                      </div>
                      <div class="stat-row">
                        <span>Largest Armies</span>
                        <span>{stats.largestArmyCount}</span>
                      </div>
                      <p class="last-played">
                        Last played: {formatDate(stats.lastPlayed)}
                      </p>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>

        {/* Leaderboard */}
        <Show when={activeTab() === "leaderboard"}>
          <div class="leaderboard">
            <Show
              when={getLeaderboard().length > 0}
              fallback={<p class="empty-message">Play some games to see the leaderboard!</p>}
            >
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Wins</th>
                    <th>Games</th>
                    <th>Win Rate</th>
                    <th>Avg VP</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={getLeaderboard()}>
                    {(entry) => (
                      <tr class={entry.rank <= 3 ? `rank-${entry.rank}` : ""}>
                        <td>{entry.rank}</td>
                        <td>{entry.playerName}</td>
                        <td>{entry.wins}</td>
                        <td>{entry.totalGames}</td>
                        <td>{formatPercent(entry.winRate)}</td>
                        <td>{entry.avgVP.toFixed(1)}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </div>
        </Show>
      </div>

      {/* Data Management */}
      <div class="data-management">
        <h4>Data Management</h4>
        <div class="data-actions">
          <button onClick={handleExport}>Export Data</button>
          <label class="file-btn">
            Import Data
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              style={{ display: "none" }}
            />
          </label>
          <button onClick={handleClearData} class="danger">
            Clear All Data
          </button>
        </div>
      </div>
    </div>
  );
};

export default StatsPanel;
