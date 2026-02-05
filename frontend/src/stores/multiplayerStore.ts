import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

// Message types matching server protocol
interface ClientMessage {
  type: string;
  payload?: any;
}

interface ServerMessage {
  type: string;
  payload?: any;
}

interface RoomInfo {
  id: string;
  name: string;
  players: PlayerInfo[];
  max_players: number;
  host_id: string;
  status: "Waiting" | "InGame" | "Finished";
}

interface PlayerInfo {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
}

export interface MultiplayerStore {
  connected: boolean;
  playerId: string | null;
  room: RoomInfo | null;
  rooms: RoomInfo[];
  gameState: any | null;
  validActions: any[];
  currentPlayer: number;
  error: string | null;
  chatMessages: { playerName: string; message: string }[];
}

const [store, setStore] = createStore<MultiplayerStore>({
  connected: false,
  playerId: null,
  room: null,
  rooms: [],
  gameState: null,
  validActions: [],
  currentPlayer: 0,
  error: null,
  chatMessages: [],
});

const [socket, setSocket] = createSignal<WebSocket | null>(null);

// Event handlers that can be set by components
let onGameStarted: ((state: any) => void) | null = null;
let onGameStateUpdate: ((state: any) => void) | null = null;
let onGameOver: ((winner: number, winnerName: string) => void) | null = null;

export function setEventHandlers(handlers: {
  onGameStarted?: (state: any) => void;
  onGameStateUpdate?: (state: any) => void;
  onGameOver?: (winner: number, winnerName: string) => void;
}) {
  onGameStarted = handlers.onGameStarted || null;
  onGameStateUpdate = handlers.onGameStateUpdate || null;
  onGameOver = handlers.onGameOver || null;
}

export async function connect(serverUrl: string = "ws://localhost:8080"): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(serverUrl);

      ws.onopen = () => {
        console.log("Connected to game server");
        setStore("connected", true);
        setSocket(ws);
        resolve();
      };

      ws.onclose = () => {
        console.log("Disconnected from game server");
        setStore("connected", false);
        setStore("playerId", null);
        setStore("room", null);
        setSocket(null);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setStore("error", "Connection error");
        reject(error);
      };

      ws.onmessage = (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data);
          handleServerMessage(msg);
        } catch (e) {
          console.error("Failed to parse message:", e);
        }
      };
    } catch (e) {
      reject(e);
    }
  });
}

export function disconnect() {
  const ws = socket();
  if (ws) {
    ws.close();
    setSocket(null);
  }
}

function send(msg: ClientMessage) {
  const ws = socket();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else {
    console.error("WebSocket not connected");
    setStore("error", "Not connected to server");
  }
}

function handleServerMessage(msg: ServerMessage) {
  console.log("Received:", msg.type, msg.payload);

  switch (msg.type) {
    case "Welcome":
      setStore("playerId", msg.payload.player_id);
      break;

    case "RoomCreated":
      // Room ID is in payload
      break;

    case "JoinedRoom":
      setStore("room", msg.payload.room);
      setStore("error", null);
      break;

    case "LeftRoom":
      setStore("room", null);
      setStore("gameState", null);
      break;

    case "RoomUpdated":
      setStore("room", msg.payload.room);
      break;

    case "GameStarted":
      setStore("gameState", msg.payload.state);
      if (onGameStarted) {
        onGameStarted(msg.payload.state);
      }
      break;

    case "GameState":
      setStore("gameState", msg.payload.state);
      if (onGameStateUpdate) {
        onGameStateUpdate(msg.payload.state);
      }
      break;

    case "ActionResult":
      if (!msg.payload.success) {
        setStore("error", msg.payload.error || "Action failed");
      } else {
        setStore("error", null);
      }
      break;

    case "ValidActions":
      setStore("validActions", msg.payload.actions);
      break;

    case "TurnChanged":
      setStore("currentPlayer", msg.payload.player_id);
      break;

    case "ChatMessage":
      setStore("chatMessages", (prev) => [
        ...prev,
        {
          playerName: msg.payload.player_name,
          message: msg.payload.message,
        },
      ]);
      break;

    case "RoomList":
      setStore("rooms", msg.payload.rooms);
      break;

    case "Error":
      setStore("error", msg.payload.message);
      break;

    case "Pong":
      // Keepalive response
      break;

    case "GameOver":
      if (onGameOver) {
        onGameOver(msg.payload.winner, msg.payload.winner_name);
      }
      break;

    default:
      console.warn("Unknown message type:", msg.type);
  }
}

// Client actions
export function createRoom(playerName: string, maxPlayers: number = 4) {
  send({
    type: "CreateRoom",
    payload: { player_name: playerName, max_players: maxPlayers },
  });
}

export function joinRoom(roomId: string, playerName: string) {
  send({
    type: "JoinRoom",
    payload: { room_id: roomId, player_name: playerName },
  });
}

export function leaveRoom() {
  send({ type: "LeaveRoom" });
}

export function startGame() {
  send({ type: "StartGame" });
}

export function sendGameAction(action: any) {
  send({
    type: "GameAction",
    payload: { action },
  });
}

export function sendChat(message: string) {
  send({
    type: "Chat",
    payload: { message },
  });
}

export function listRooms() {
  send({ type: "ListRooms" });
}

export function ping() {
  send({ type: "Ping" });
}

// Helper functions
export function isHost(): boolean {
  return store.room?.host_id === store.playerId;
}

export function isInGame(): boolean {
  return store.room?.status === "InGame";
}

export function canStartGame(): boolean {
  return isHost() && (store.room?.players.length ?? 0) >= 2;
}

export function getMyPlayerIndex(): number | null {
  if (!store.room || !store.playerId) return null;
  const index = store.room.players.findIndex((p) => p.id === store.playerId);
  return index >= 0 ? index : null;
}

export function isMyTurn(): boolean {
  const myIndex = getMyPlayerIndex();
  return myIndex !== null && myIndex === store.currentPlayer;
}

export { store as multiplayerStore };

// Debug helper
if (typeof window !== 'undefined') {
  (window as any).__ms = store;
  (window as any).__sa = sendGameAction;
}
