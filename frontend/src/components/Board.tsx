import { onMount, onCleanup, createEffect } from "solid-js";
import type { Component } from "solid-js";
import { BoardRenderer } from "../game/renderer";
import { gameStore, applyAction } from "../stores/gameStore";
import type { VertexCoord, EdgeCoord, HexCoord, GameAction } from "../types/game";

interface BoardProps {
  width: number;
  height: number;
}

export const Board: Component<BoardProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let renderer: BoardRenderer | undefined;

  onMount(async () => {
    if (!canvasRef) return;

    renderer = new BoardRenderer(canvasRef, props.width, props.height);
    await renderer.init(canvasRef, props.width, props.height);

    // Set up click handlers
    renderer.setClickHandlers(
      handleVertexClick,
      handleEdgeClick,
      handleHexClick
    );

    // Initial render
    renderBoard();
  });

  onCleanup(() => {
    renderer?.destroy();
  });

  // Re-render when state changes
  createEffect(() => {
    if (gameStore.state && renderer) {
      renderBoard();
      updateHighlights();
    }
  });

  function renderBoard() {
    if (!renderer || !gameStore.state) return;

    const board = gameStore.state.board;
    const players = gameStore.state.players;

    if (!board || !board.tiles) return;

    // Convert array format from WASM to record format for renderer
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
        const key = `${v.hex_q},${v.hex_r},${v.direction}`;
        verticesRecord[key] = v.building;
      });
    }

    // Edges: array of {hex_q, hex_r, direction, building}
    const edgesRecord: Record<string, any> = {};
    if (board.edges) {
      board.edges.forEach((e: any) => {
        const key = `${e.hex_q},${e.hex_r},${e.direction}`;
        edgesRecord[key] = e.building;
      });
    }

    // Harbors: array of {edge: {hex, direction}, harbor_type}
    const harbors = board.harbors || [];

    renderer.renderBoard(
      tilesRecord,
      verticesRecord,
      edgesRecord,
      players,
      harbors
    );
  }

  function updateHighlights() {
    if (!renderer) return;

    renderer.clearHighlights();

    const phase = gameStore.phase;
    const actions = gameStore.validActions;

    // Parse phase
    let parsedPhase: any;
    try {
      parsedPhase = JSON.parse(phase);
    } catch {
      parsedPhase = phase;
    }

    // Highlight valid placements based on phase
    if (typeof parsedPhase === "object" && "Setup" in parsedPhase) {
      if (parsedPhase.Setup.placing === "Settlement") {
        const vertices = actions
          .filter((a: any) => a.PlaceInitialSettlement)
          .map((a: any) => a.PlaceInitialSettlement);
        renderer.highlightVertices(vertices, 0x00ff00);
      } else if (parsedPhase.Setup.placing === "Road") {
        const edges = actions
          .filter((a: any) => a.PlaceInitialRoad)
          .map((a: any) => a.PlaceInitialRoad);
        renderer.highlightEdges(edges, 0x00ff00);
      }
    } else if (parsedPhase === "RobberMoveRequired") {
      const hexes = actions
        .filter((a: any) => a.MoveRobber)
        .map((a: any) => a.MoveRobber);
      renderer.highlightHexes(hexes, 0xff0000);
    }
  }

  function handleVertexClick(vertex: VertexCoord) {
    const phase = gameStore.phase;
    let parsedPhase: any;
    try {
      parsedPhase = JSON.parse(phase);
    } catch {
      parsedPhase = phase;
    }

    if (typeof parsedPhase === "object" && "Setup" in parsedPhase) {
      if (parsedPhase.Setup.placing === "Settlement") {
        const action: GameAction = { PlaceInitialSettlement: vertex };
        const result = applyAction(action);
        if (!result.success) {
          console.error("Failed to place settlement:", result.error);
        }
      }
    } else if (parsedPhase === "MainPhase") {
      // Check if we can build a settlement here
      const canBuild = gameStore.validActions.some(
        (a: any) =>
          a.BuildSettlement &&
          JSON.stringify(a.BuildSettlement) === JSON.stringify(vertex)
      );
      if (canBuild) {
        const action: GameAction = { BuildSettlement: vertex };
        applyAction(action);
      }

      // Or upgrade to city
      const canUpgrade = gameStore.validActions.some(
        (a: any) =>
          a.BuildCity &&
          JSON.stringify(a.BuildCity) === JSON.stringify(vertex)
      );
      if (canUpgrade) {
        const action: GameAction = { BuildCity: vertex };
        applyAction(action);
      }
    }
  }

  function handleEdgeClick(edge: EdgeCoord) {
    const phase = gameStore.phase;
    let parsedPhase: any;
    try {
      parsedPhase = JSON.parse(phase);
    } catch {
      parsedPhase = phase;
    }

    if (typeof parsedPhase === "object" && "Setup" in parsedPhase) {
      if (parsedPhase.Setup.placing === "Road") {
        const action: GameAction = { PlaceInitialRoad: edge };
        const result = applyAction(action);
        if (!result.success) {
          console.error("Failed to place road:", result.error);
        }
      }
    } else if (parsedPhase === "MainPhase") {
      const canBuild = gameStore.validActions.some(
        (a: any) =>
          a.BuildRoad &&
          JSON.stringify(a.BuildRoad) === JSON.stringify(edge)
      );
      if (canBuild) {
        const action: GameAction = { BuildRoad: edge };
        applyAction(action);
      }
    }
  }

  function handleHexClick(hex: HexCoord) {
    const phase = gameStore.phase;
    let parsedPhase: any;
    try {
      parsedPhase = JSON.parse(phase);
    } catch {
      parsedPhase = phase;
    }

    if (parsedPhase === "RobberMoveRequired") {
      const canMove = gameStore.validActions.some(
        (a: any) =>
          a.MoveRobber &&
          JSON.stringify(a.MoveRobber) === JSON.stringify(hex)
      );
      if (canMove) {
        const action: GameAction = { MoveRobber: hex };
        applyAction(action);
      }
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={props.width}
      height={props.height}
      style={{ border: "2px solid #333" }}
    />
  );
};
