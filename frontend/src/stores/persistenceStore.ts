import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

// Types
interface SavedGame {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  playerNames: string[];
  currentPlayer: number;
  phase: string;
  turnNumber: number;
  state: any;
}

interface PlayerStats {
  playerId: string;
  playerName: string;
  gamesPlayed: number;
  gamesWon: number;
  totalVictoryPoints: number;
  averageVP: number;
  longestRoadCount: number;
  largestArmyCount: number;
  settlementsBuilt: number;
  citiesBuilt: number;
  roadsBuilt: number;
  lastPlayed: string;
}

interface LeaderboardEntry {
  rank: number;
  playerName: string;
  wins: number;
  winRate: number;
  totalGames: number;
  avgVP: number;
}

interface PersistenceStore {
  savedGames: SavedGame[];
  playerStats: Record<string, PlayerStats>;
  leaderboard: LeaderboardEntry[];
}

const STORAGE_PREFIX = "kopiatan_";
const SAVED_GAMES_KEY = `${STORAGE_PREFIX}saved_games`;
const PLAYER_STATS_KEY = `${STORAGE_PREFIX}player_stats`;

const [store, setStore] = createStore<PersistenceStore>({
  savedGames: [],
  playerStats: {},
  leaderboard: [],
});

// Initialize from localStorage
export function initPersistence() {
  loadSavedGames();
  loadPlayerStats();
  updateLeaderboard();
}

// Saved Games
export function loadSavedGames() {
  try {
    const data = localStorage.getItem(SAVED_GAMES_KEY);
    if (data) {
      const games = JSON.parse(data);
      setStore("savedGames", games);
    }
  } catch (e) {
    console.error("Failed to load saved games:", e);
  }
}

export function saveGame(
  gameState: any,
  name: string = `Game ${new Date().toLocaleString()}`
): string {
  const id = generateId();
  const now = new Date().toISOString();

  const savedGame: SavedGame = {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    playerNames: gameState.players?.map((p: any) => p.name) || [],
    currentPlayer: gameState.current_player || 0,
    phase: gameState.phase || "Unknown",
    turnNumber: gameState.turn_number || 0,
    state: gameState,
  };

  const games = [...store.savedGames, savedGame];
  setStore("savedGames", games);
  persistSavedGames(games);

  return id;
}

export function updateSavedGame(id: string, gameState: any) {
  const games = store.savedGames.map((game) =>
    game.id === id
      ? {
          ...game,
          updatedAt: new Date().toISOString(),
          currentPlayer: gameState.current_player || 0,
          phase: gameState.phase || "Unknown",
          turnNumber: gameState.turn_number || 0,
          state: gameState,
        }
      : game
  );
  setStore("savedGames", games);
  persistSavedGames(games);
}

export function loadGame(id: string): any | null {
  const game = store.savedGames.find((g) => g.id === id);
  return game?.state || null;
}

export function deleteGame(id: string) {
  const games = store.savedGames.filter((g) => g.id !== id);
  setStore("savedGames", games);
  persistSavedGames(games);
}

export function renameGame(id: string, newName: string) {
  const games = store.savedGames.map((game) =>
    game.id === id ? { ...game, name: newName, updatedAt: new Date().toISOString() } : game
  );
  setStore("savedGames", games);
  persistSavedGames(games);
}

function persistSavedGames(games: SavedGame[]) {
  try {
    localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(games));
  } catch (e) {
    console.error("Failed to persist saved games:", e);
  }
}

// Player Stats
export function loadPlayerStats() {
  try {
    const data = localStorage.getItem(PLAYER_STATS_KEY);
    if (data) {
      const stats = JSON.parse(data);
      setStore("playerStats", stats);
    }
  } catch (e) {
    console.error("Failed to load player stats:", e);
  }
}

export function recordGameResult(
  players: Array<{ name: string; id: number }>,
  winnerId: number,
  victoryPoints: Record<number, number>,
  gameStats: {
    longestRoadHolder?: number;
    largestArmyHolder?: number;
    settlements?: Record<number, number>;
    cities?: Record<number, number>;
    roads?: Record<number, number>;
  } = {}
) {
  const stats = { ...store.playerStats };

  players.forEach((player) => {
    const key = player.name.toLowerCase();
    const existing = stats[key] || createEmptyStats(player.name);

    existing.gamesPlayed++;
    existing.totalVictoryPoints += victoryPoints[player.id] || 0;
    existing.averageVP = existing.totalVictoryPoints / existing.gamesPlayed;
    existing.lastPlayed = new Date().toISOString();

    if (player.id === winnerId) {
      existing.gamesWon++;
    }

    if (gameStats.longestRoadHolder === player.id) {
      existing.longestRoadCount++;
    }

    if (gameStats.largestArmyHolder === player.id) {
      existing.largestArmyCount++;
    }

    if (gameStats.settlements?.[player.id]) {
      existing.settlementsBuilt += gameStats.settlements[player.id];
    }

    if (gameStats.cities?.[player.id]) {
      existing.citiesBuilt += gameStats.cities[player.id];
    }

    if (gameStats.roads?.[player.id]) {
      existing.roadsBuilt += gameStats.roads[player.id];
    }

    stats[key] = existing;
  });

  setStore("playerStats", stats);
  persistPlayerStats(stats);
  updateLeaderboard();
}

function createEmptyStats(playerName: string): PlayerStats {
  return {
    playerId: playerName.toLowerCase(),
    playerName,
    gamesPlayed: 0,
    gamesWon: 0,
    totalVictoryPoints: 0,
    averageVP: 0,
    longestRoadCount: 0,
    largestArmyCount: 0,
    settlementsBuilt: 0,
    citiesBuilt: 0,
    roadsBuilt: 0,
    lastPlayed: new Date().toISOString(),
  };
}

function persistPlayerStats(stats: Record<string, PlayerStats>) {
  try {
    localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error("Failed to persist player stats:", e);
  }
}

export function getPlayerStats(playerName: string): PlayerStats | null {
  const key = playerName.toLowerCase();
  return store.playerStats[key] || null;
}

export function getAllPlayerStats(): PlayerStats[] {
  return Object.values(store.playerStats);
}

// Leaderboard
export function updateLeaderboard() {
  const stats = Object.values(store.playerStats);

  const entries: LeaderboardEntry[] = stats
    .filter((s) => s.gamesPlayed > 0)
    .map((s) => ({
      rank: 0,
      playerName: s.playerName,
      wins: s.gamesWon,
      winRate: s.gamesPlayed > 0 ? (s.gamesWon / s.gamesPlayed) * 100 : 0,
      totalGames: s.gamesPlayed,
      avgVP: s.averageVP,
    }))
    .sort((a, b) => {
      // Sort by wins, then win rate, then avg VP
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.avgVP - a.avgVP;
    });

  // Assign ranks
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  setStore("leaderboard", entries);
}

export function getLeaderboard(): LeaderboardEntry[] {
  return store.leaderboard;
}

// Export/Import
export function exportAllData(): string {
  const data = {
    savedGames: store.savedGames,
    playerStats: store.playerStats,
    exportedAt: new Date().toISOString(),
    version: "1.0",
  };
  return JSON.stringify(data, null, 2);
}

export function importAllData(jsonString: string): boolean {
  try {
    const data = JSON.parse(jsonString);

    if (data.savedGames) {
      setStore("savedGames", data.savedGames);
      persistSavedGames(data.savedGames);
    }

    if (data.playerStats) {
      setStore("playerStats", data.playerStats);
      persistPlayerStats(data.playerStats);
    }

    updateLeaderboard();
    return true;
  } catch (e) {
    console.error("Failed to import data:", e);
    return false;
  }
}

export function clearAllData() {
  localStorage.removeItem(SAVED_GAMES_KEY);
  localStorage.removeItem(PLAYER_STATS_KEY);
  setStore({
    savedGames: [],
    playerStats: {},
    leaderboard: [],
  });
}

// Helpers
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Auto-save functionality
const [autoSaveEnabled, setAutoSaveEnabled] = createSignal(true);
const [currentGameId, setCurrentGameId] = createSignal<string | null>(null);

export function enableAutoSave(gameState: any, name?: string) {
  if (!currentGameId()) {
    const id = saveGame(gameState, name);
    setCurrentGameId(id);
  }
  setAutoSaveEnabled(true);
}

export function autoSave(gameState: any) {
  if (!autoSaveEnabled() || !currentGameId()) return;
  updateSavedGame(currentGameId()!, gameState);
}

export function disableAutoSave() {
  setAutoSaveEnabled(false);
  setCurrentGameId(null);
}

export { store as persistenceStore, autoSaveEnabled, currentGameId };
