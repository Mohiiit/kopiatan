import { onMount, onCleanup, createEffect, createMemo, Show, createSignal } from "solid-js";
import type { Component } from "solid-js";
import { BoardRenderer } from "../game/renderer";
import type { VertexCoord, EdgeCoord, HexCoord } from "../types/game";
import { SoundManager } from "../utils/SoundManager";

interface MultiplayerBoardProps {
  gameState: any;
  validActions: any[];
  currentPlayer: number;
  isMyTurn: boolean;
  onAction: (action: any) => void;
}

export const MultiplayerBoard: Component<MultiplayerBoardProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let renderer: BoardRenderer | undefined;
  let lastDiceRoll: number[] | null = null;
  const [showDiceAnimation, setShowDiceAnimation] = createSignal(false);

  // Convert board state from array format to record format for renderer
  const convertBoardState = () => {
    const board = props.gameState?.board;
    if (!board || !board.tiles) return { tiles: {}, vertices: {}, edges: {} };

    // Tiles: array of {q, r, tile_type, dice_number, has_robber}
    const tilesRecord: Record<string, any> = {};
    board.tiles.forEach((tile: any) => {
      const key = `${tile.q},${tile.r}`;
      tilesRecord[key] = {
        coord: { q: tile.q, r: tile.r },
        tile_type: tile.tile_type,
        dice_number: tile.dice_number,
        has_robber: tile.has_robber,
      };
    });

    // Vertices: array of {hex_q, hex_r, direction, building}
    const verticesRecord: Record<string, any> = {};
    if (board.vertices) {
      board.vertices.forEach((v: any) => {
        const key = JSON.stringify({
          hex: { q: v.hex_q, r: v.hex_r },
          direction: v.direction,
        });
        verticesRecord[key] = v.building;
      });
    }

    // Edges: array of {hex_q, hex_r, direction, building}
    const edgesRecord: Record<string, any> = {};
    if (board.edges) {
      board.edges.forEach((e: any) => {
        const key = JSON.stringify({
          hex: { q: e.hex_q, r: e.hex_r },
          direction: e.direction,
        });
        edgesRecord[key] = e.building;
      });
    }

    // Harbors: array of {edge: {hex, direction}, harbor_type}
    const harbors = board.harbors || [];

    return { tiles: tilesRecord, vertices: verticesRecord, edges: edgesRecord, harbors };
  };

  // Extract valid placements from actions
  const validSettlements = createMemo(() => {
    return props.validActions
      .filter((a: any) => typeof a === "object" && ("PlaceInitialSettlement" in a || "BuildSettlement" in a))
      .map((a: any) => a.PlaceInitialSettlement || a.BuildSettlement);
  });

  const validRoads = createMemo(() => {
    return props.validActions
      .filter((a: any) => typeof a === "object" && ("PlaceInitialRoad" in a || "BuildRoad" in a))
      .map((a: any) => a.PlaceInitialRoad || a.BuildRoad);
  });

  const validRobberHexes = createMemo(() => {
    return props.validActions
      .filter((a: any) => typeof a === "object" && "MoveRobber" in a)
      .map((a: any) => a.MoveRobber);
  });

  // Get current phase info
  const phaseInfo = createMemo(() => {
    const phase = props.gameState?.phase;
    if (!phase) return { text: "Loading...", type: "unknown" };
    if (typeof phase === "object" && "Setup" in phase) {
      return { text: `Setup: Place ${phase.Setup.placing}`, type: "setup", placing: phase.Setup.placing };
    }
    if (phase === "PreRoll") return { text: "Roll the dice", type: "preroll" };
    if (phase === "MainPhase") return { text: "Build, trade, or end turn", type: "main" };
    if (phase === "RobberMoveRequired") return { text: "Move the Robber", type: "robber" };
    if (typeof phase === "object" && "RobberSteal" in phase) {
      return { text: "Choose who to steal from", type: "steal", victims: phase.RobberSteal.victims };
    }
    if (typeof phase === "object" && "DiscardRequired" in phase) {
      return { text: "Discard half your cards", type: "discard" };
    }
    return { text: JSON.stringify(phase), type: "unknown" };
  });

  // Handle vertex click (settlement/city placement)
  function handleVertexClick(vertex: VertexCoord) {
    if (!props.isMyTurn) return;

    // Find matching action
    const action = props.validActions.find((a: any) => {
      if (typeof a === "object" && "PlaceInitialSettlement" in a) {
        const v = a.PlaceInitialSettlement;
        return v.hex.q === vertex.hex.q && v.hex.r === vertex.hex.r && v.direction === vertex.direction;
      }
      if (typeof a === "object" && "BuildSettlement" in a) {
        const v = a.BuildSettlement;
        return v.hex.q === vertex.hex.q && v.hex.r === vertex.hex.r && v.direction === vertex.direction;
      }
      if (typeof a === "object" && "BuildCity" in a) {
        const v = a.BuildCity;
        return v.hex.q === vertex.hex.q && v.hex.r === vertex.hex.r && v.direction === vertex.direction;
      }
      return false;
    });

    if (action) {
      // Play appropriate sound for the action
      if ("PlaceInitialSettlement" in action || "BuildSettlement" in action) {
        SoundManager.play('placeSettlement');
      } else if ("BuildCity" in action) {
        SoundManager.play('placeCity');
      }
      props.onAction(action);
    }
  }

  // Handle edge click (road placement)
  function handleEdgeClick(edge: EdgeCoord) {
    if (!props.isMyTurn) return;

    const action = props.validActions.find((a: any) => {
      if (typeof a === "object" && "PlaceInitialRoad" in a) {
        const e = a.PlaceInitialRoad;
        return e.hex.q === edge.hex.q && e.hex.r === edge.hex.r && e.direction === edge.direction;
      }
      if (typeof a === "object" && "BuildRoad" in a) {
        const e = a.BuildRoad;
        return e.hex.q === edge.hex.q && e.hex.r === edge.hex.r && e.direction === edge.direction;
      }
      return false;
    });

    if (action) {
      SoundManager.play('placeRoad');
      props.onAction(action);
    }
  }

  // Handle hex click (robber movement)
  function handleHexClick(hex: HexCoord) {
    if (!props.isMyTurn) return;

    const action = props.validActions.find((a: any) => {
      if (typeof a === "object" && "MoveRobber" in a) {
        const h = a.MoveRobber;
        return h.q === hex.q && h.r === hex.r;
      }
      return false;
    });

    if (action) {
      SoundManager.play('robberMove');
      props.onAction(action);
    }
  }

  onMount(async () => {
    if (!canvasRef) return;

    renderer = new BoardRenderer(canvasRef, 800, 700);
    await renderer.init(canvasRef, 800, 700);

    renderer.setClickHandlers(handleVertexClick, handleEdgeClick, handleHexClick);

    // Initial render
    renderBoard();
  });

  onCleanup(() => {
    renderer?.destroy();
  });

  // Re-render when state changes
  createEffect(() => {
    if (props.gameState && renderer) {
      // Check for dice roll
      const currentDice = props.gameState.last_dice_roll;
      if (currentDice && currentDice.length === 2) {
        const diceStr = JSON.stringify(currentDice);
        const lastStr = lastDiceRoll ? JSON.stringify(lastDiceRoll) : null;
        if (diceStr !== lastStr) {
          // New dice roll - trigger animation
          renderer.createDiceRollFeedback();
          setShowDiceAnimation(true);
          setTimeout(() => setShowDiceAnimation(false), 800);
          lastDiceRoll = [...currentDice];
        }
      }

      renderBoard();
      updateHighlights();
    }
  });

  function renderBoard() {
    if (!renderer || !props.gameState) return;

    const { tiles, vertices, edges, harbors } = convertBoardState();
    const players = props.gameState.players || [];

    renderer.renderBoard(tiles, vertices, edges, players, harbors);
  }

  function updateHighlights() {
    if (!renderer || !props.isMyTurn) {
      renderer?.clearHighlights();
      return;
    }

    const phase = phaseInfo();

    // Highlight based on current phase and valid actions
    if (phase.type === "setup" || phase.type === "main") {
      if (validSettlements().length > 0) {
        renderer.highlightVertices(validSettlements(), 0x00ff00);
      } else if (validRoads().length > 0) {
        renderer.highlightEdges(validRoads(), 0x00ff00);
      }
    } else if (phase.type === "robber") {
      if (validRobberHexes().length > 0) {
        renderer.highlightHexes(validRobberHexes(), 0xff0000);
      }
    } else {
      renderer.clearHighlights();
    }
  }

  // Current player color for border glow
  const currentPlayerColor = createMemo(() => {
    const player = props.gameState?.players?.[props.currentPlayer];
    const colorMap: Record<string, string> = {
      Red: "#e74c3c",
      Blue: "#3498db",
      Orange: "#e67e22",
      White: "#ecf0f1",
    };
    return colorMap[player?.color] || "#f5a623";
  });

  return (
    <div
      class="multiplayer-board-container"
      classList={{ "my-turn-active": props.isMyTurn }}
      style={{ "--current-player-color": currentPlayerColor() }}
    >
      {/* Decorative corner elements */}
      <div class="board-corner board-corner-tl" />
      <div class="board-corner board-corner-tr" />
      <div class="board-corner board-corner-bl" />
      <div class="board-corner board-corner-br" />

      {/* Ambient glow effect */}
      <div class="board-ambient-glow" />

      <canvas
        ref={canvasRef}
        width={800}
        height={700}
        class="game-canvas"
      />

      {/* Dice roll animation overlay */}
      <Show when={showDiceAnimation()}>
        <div class="dice-roll-flash" />
      </Show>

      {/* Turn indicator strip */}
      <div class="board-turn-strip">
        <Show when={props.isMyTurn}>
          <span class="turn-strip-text">Your Turn</span>
        </Show>
        <Show when={!props.isMyTurn}>
          <span class="turn-strip-text waiting">
            {props.gameState?.players[props.currentPlayer]?.name}'s Turn
          </span>
        </Show>
      </div>

      {/* Overlay for status messages */}
      <div class="board-status-overlay">
        <Show when={!props.isMyTurn}>
          <div class="waiting-overlay">
            <div class="waiting-dots">
              <span class="waiting-dot" />
              <span class="waiting-dot" />
              <span class="waiting-dot" />
            </div>
            <p>Waiting for {props.gameState?.players[props.currentPlayer]?.name}...</p>
          </div>
        </Show>

        <Show when={props.isMyTurn && phaseInfo().type === "steal"}>
          <div class="steal-selection">
            <div class="steal-icon">🦹</div>
            <h4>Choose who to steal from:</h4>
            <div class="victim-buttons">
              {(phaseInfo() as any).victims?.map((victimId: number) => (
                <button
                  onClick={() => {
                    SoundManager.play('steal');
                    props.onAction({ StealFrom: victimId });
                  }}
                  class="victim-btn"
                >
                  <span class="victim-icon">👤</span>
                  {props.gameState?.players[victimId]?.name || `Player ${victimId + 1}`}
                </button>
              ))}
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default MultiplayerBoard;
