import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import init, { WasmGame } from "catan-core";

export interface GameStore {
  game: WasmGame | null;
  isLoading: boolean;
  error: string | null;
  state: any | null;
  validActions: any[];
  currentPlayer: number;
  phase: string;
  diceRoll: [number, number] | null;
}

const [store, setStore] = createStore<GameStore>({
  game: null,
  isLoading: true,
  error: null,
  state: null,
  validActions: [],
  currentPlayer: 0,
  phase: "Loading",
  diceRoll: null,
});

const [initialized, setInitialized] = createSignal(false);

export async function initializeGame(playerCount: number, playerNames: string[]) {
  try {
    setStore("isLoading", true);
    setStore("error", null);

    // Initialize WASM module if not already done
    if (!initialized()) {
      await init();
      setInitialized(true);
    }

    // Create new game
    const game = new WasmGame(playerCount, JSON.stringify(playerNames));
    setStore("game", game);

    // Load initial state
    refreshState();
    setStore("isLoading", false);
  } catch (e) {
    setStore("error", String(e));
    setStore("isLoading", false);
  }
}

export function refreshState() {
  const game = store.game;
  if (!game) return;

  try {
    // Build state from individual getters since getState() has serialization issues with HashMap keys
    const currentPlayer = game.getCurrentPlayer();
    const phase = game.getPhase();

    // Get players array by fetching each player
    const players: any[] = [];
    for (let i = 0; i < 4; i++) {
      try {
        const playerJson = game.getPlayer(i);
        if (playerJson && playerJson !== "null") {
          players.push(JSON.parse(playerJson));
        }
      } catch {
        break; // No more players
      }
    }

    // Get board (individual components work even if full state doesn't serialize)
    let board = null;
    try {
      const boardJson = game.getBoard();
      if (boardJson && boardJson !== "{}") {
        board = JSON.parse(boardJson);
      }
    } catch {
      // Board serialization might fail due to HashMap keys
    }

    const state = {
      players,
      board,
      currentPlayer,
      phase
    };

    setStore("state", state);
    setStore("currentPlayer", currentPlayer);
    setStore("phase", phase);

    const actionsJson = game.getValidActions();
    setStore("validActions", JSON.parse(actionsJson));

    const diceRoll = game.getDiceRoll();
    setStore("diceRoll", diceRoll ? [diceRoll[0], diceRoll[1]] : null);
  } catch (e) {
    setStore("error", String(e));
  }
}

export function applyAction(action: any): { success: boolean; events: any[]; error?: string } {
  const game = store.game;
  if (!game) return { success: false, events: [], error: "Game not initialized" };

  try {
    const eventsJson = game.applyAction(store.currentPlayer, JSON.stringify(action));
    const events = JSON.parse(eventsJson);
    refreshState();
    return { success: true, events };
  } catch (e) {
    return { success: false, events: [], error: String(e) };
  }
}

export function getPlayer(playerId: number): any | null {
  const game = store.game;
  if (!game) return null;

  try {
    const playerJson = game.getPlayer(playerId);
    return JSON.parse(playerJson);
  } catch {
    return null;
  }
}

export function getBoard(): any | null {
  const game = store.game;
  if (!game) return null;

  try {
    const boardJson = game.getBoard();
    return JSON.parse(boardJson);
  } catch {
    return null;
  }
}

export function isFinished(): boolean {
  return store.game?.isFinished() ?? false;
}

export function getWinner(): number | null {
  return store.game?.getWinner() ?? null;
}

export function getVictoryPoints(playerId: number): number {
  return store.game?.getVictoryPoints(playerId) ?? 0;
}

export { store as gameStore };
