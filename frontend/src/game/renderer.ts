import * as PIXI from "pixi.js";
import type { HexCoord, VertexCoord, EdgeCoord, Tile, VertexBuilding, EdgeBuilding, Player } from "../types/game";
import { getTileColor, getPlayerColor } from "../types/game";

// Hex geometry constants
const HEX_SIZE = 50; // Radius in pixels

// Convert axial coordinates to pixel position
export function hexToPixel(coord: HexCoord, size: number = HEX_SIZE): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r);
  const y = size * ((3 / 2) * coord.r);
  return { x, y };
}

// Get pixel position for a vertex
export function vertexToPixel(vertex: VertexCoord, size: number = HEX_SIZE): { x: number; y: number } {
  const { x: hx, y: hy } = hexToPixel(vertex.hex, size);
  const yOffset = vertex.direction === "North" ? -size : size;
  return { x: hx, y: hy + yOffset };
}

// Get pixel position for an edge (midpoint)
export function edgeToPixel(edge: EdgeCoord, size: number = HEX_SIZE): { x: number; y: number } {
  const { x: hx, y: hy } = hexToPixel(edge.hex, size);

  // Calculate offset based on edge direction
  const offsets: Record<string, { x: number; y: number }> = {
    NorthEast: { x: size * Math.sqrt(3) / 4, y: -size * 3/4 },
    East: { x: size * Math.sqrt(3) / 2, y: 0 },
    SouthEast: { x: size * Math.sqrt(3) / 4, y: size * 3/4 },
    SouthWest: { x: -size * Math.sqrt(3) / 4, y: size * 3/4 },
    West: { x: -size * Math.sqrt(3) / 2, y: 0 },
    NorthWest: { x: -size * Math.sqrt(3) / 4, y: -size * 3/4 },
  };

  const offset = offsets[edge.direction] || { x: 0, y: 0 };
  return { x: hx + offset.x, y: hy + offset.y };
}

// Generate hex polygon points
function hexPoints(size: number = HEX_SIZE): number[] {
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6; // Start from top-right, pointy-top
    points.push(size * Math.cos(angle));
    points.push(size * Math.sin(angle));
  }
  return points;
}

export class BoardRenderer {
  private app: PIXI.Application;
  private boardContainer: PIXI.Container;
  private highlightContainer: PIXI.Container;
  private buildingsContainer: PIXI.Container;
  private hexSize: number;
  private centerOffset: { x: number; y: number };

  private onVertexClick?: (vertex: VertexCoord) => void;
  private onEdgeClick?: (edge: EdgeCoord) => void;
  private onHexClick?: (hex: HexCoord) => void;

  constructor(_canvas: HTMLCanvasElement, width: number, height: number) {
    this.hexSize = HEX_SIZE;
    this.centerOffset = { x: width / 2, y: height / 2 };

    this.app = new PIXI.Application();
    this.boardContainer = new PIXI.Container();
    this.highlightContainer = new PIXI.Container();
    this.buildingsContainer = new PIXI.Container();
  }

  async init(canvas: HTMLCanvasElement, width: number, height: number) {
    await this.app.init({
      canvas,
      width,
      height,
      backgroundColor: 0x1e90ff, // Ocean blue
      antialias: true,
    });

    this.boardContainer.position.set(this.centerOffset.x, this.centerOffset.y);
    this.highlightContainer.position.set(this.centerOffset.x, this.centerOffset.y);
    this.buildingsContainer.position.set(this.centerOffset.x, this.centerOffset.y);

    this.app.stage.addChild(this.boardContainer);
    this.app.stage.addChild(this.highlightContainer);
    this.app.stage.addChild(this.buildingsContainer);
  }

  setClickHandlers(
    onVertex?: (vertex: VertexCoord) => void,
    onEdge?: (edge: EdgeCoord) => void,
    onHex?: (hex: HexCoord) => void
  ) {
    this.onVertexClick = onVertex;
    this.onEdgeClick = onEdge;
    this.onHexClick = onHex;
  }

  renderBoard(
    tiles: Record<string, Tile>,
    vertices: Record<string, VertexBuilding>,
    edges: Record<string, EdgeBuilding>,
    players: Player[]
  ) {
    this.boardContainer.removeChildren();
    this.buildingsContainer.removeChildren();

    // Draw tiles
    Object.values(tiles).forEach((tile) => {
      this.drawTile(tile);
    });

    // Draw edges (roads)
    Object.entries(edges).forEach(([coordStr, building]) => {
      if (building !== "Empty") {
        const coord = this.parseEdgeCoord(coordStr);
        if (coord) {
          this.drawRoad(coord, building, players);
        }
      }
    });

    // Draw vertices (settlements/cities)
    Object.entries(vertices).forEach(([coordStr, building]) => {
      if (building !== "Empty") {
        const coord = this.parseVertexCoord(coordStr);
        if (coord) {
          this.drawBuilding(coord, building, players);
        }
      }
    });
  }

  private parseVertexCoord(str: string): VertexCoord | null {
    try {
      // Format: "VertexCoord { hex: HexCoord { q: 0, r: 0 }, direction: North }"
      // Or it might be JSON
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  private parseEdgeCoord(str: string): EdgeCoord | null {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  private drawTile(tile: Tile) {
    const pos = hexToPixel(tile.coord, this.hexSize);
    const graphics = new PIXI.Graphics();

    // Draw hex
    const color = getTileColor(tile.tile_type);
    graphics.poly(hexPoints(this.hexSize));
    graphics.fill({ color });
    graphics.stroke({ color: 0x333333, width: 2 });

    graphics.position.set(pos.x, pos.y);

    // Make clickable
    graphics.eventMode = 'static';
    graphics.cursor = 'pointer';
    graphics.on('pointerdown', () => {
      if (this.onHexClick) {
        this.onHexClick(tile.coord);
      }
    });

    this.boardContainer.addChild(graphics);

    // Draw dice number
    if (tile.dice_number && tile.tile_type !== "Ocean") {
      const isHot = tile.dice_number === 6 || tile.dice_number === 8;

      // Number circle background
      const circle = new PIXI.Graphics();
      circle.circle(0, 0, 15);
      circle.fill({ color: 0xffffff });
      circle.position.set(pos.x, pos.y);
      this.boardContainer.addChild(circle);

      // Number text
      const text = new PIXI.Text({
        text: tile.dice_number.toString(),
        style: {
          fontSize: 16,
          fontWeight: 'bold',
          fill: isHot ? 0xff0000 : 0x000000,
        }
      });
      text.anchor.set(0.5);
      text.position.set(pos.x, pos.y);
      this.boardContainer.addChild(text);
    }

    // Draw robber
    if (tile.has_robber) {
      const robber = new PIXI.Graphics();
      robber.circle(0, 0, 12);
      robber.fill({ color: 0x000000 });
      robber.position.set(pos.x, pos.y + 20);
      this.boardContainer.addChild(robber);
    }
  }

  private drawBuilding(coord: VertexCoord, building: VertexBuilding, players: Player[]) {
    const pos = vertexToPixel(coord, this.hexSize);
    const graphics = new PIXI.Graphics();

    let playerId: number;
    let isCity = false;

    if (typeof building === "object" && "Settlement" in building) {
      playerId = building.Settlement;
    } else if (typeof building === "object" && "City" in building) {
      playerId = building.City;
      isCity = true;
    } else {
      return;
    }

    const player = players[playerId];
    const color = player ? getPlayerColor(player.color) : 0xffffff;

    if (isCity) {
      // Draw city (larger square with triangle roof)
      graphics.rect(-10, -5, 20, 15);
      graphics.fill({ color });
      graphics.stroke({ color: 0x000000, width: 2 });
      graphics.poly([-10, -5, 0, -15, 10, -5]);
      graphics.fill({ color });
      graphics.stroke({ color: 0x000000, width: 2 });
    } else {
      // Draw settlement (small house)
      graphics.rect(-6, 0, 12, 10);
      graphics.fill({ color });
      graphics.stroke({ color: 0x000000, width: 1 });
      graphics.poly([-6, 0, 0, -8, 6, 0]);
      graphics.fill({ color });
      graphics.stroke({ color: 0x000000, width: 1 });
    }

    graphics.position.set(pos.x, pos.y);
    this.buildingsContainer.addChild(graphics);
  }

  private drawRoad(coord: EdgeCoord, building: EdgeBuilding, players: Player[]) {
    if (typeof building !== "object" || !("Road" in building)) return;

    const playerId = building.Road;
    const player = players[playerId];
    const color = player ? getPlayerColor(player.color) : 0xffffff;

    // Get edge endpoints for drawing the road
    const pos = edgeToPixel(coord, this.hexSize);

    // Determine road rotation based on direction
    let rotation = 0;
    switch (coord.direction) {
      case "NorthEast":
      case "SouthWest":
        rotation = -Math.PI / 3;
        break;
      case "East":
      case "West":
        rotation = 0;
        break;
      case "SouthEast":
      case "NorthWest":
        rotation = Math.PI / 3;
        break;
    }

    const graphics = new PIXI.Graphics();
    graphics.roundRect(-15, -3, 30, 6, 2);
    graphics.fill({ color });
    graphics.stroke({ color: 0x000000, width: 1 });
    graphics.position.set(pos.x, pos.y);
    graphics.rotation = rotation;

    this.buildingsContainer.addChild(graphics);
  }

  highlightVertices(vertices: VertexCoord[], color: number = 0x00ff00) {
    this.clearHighlights();

    vertices.forEach((vertex) => {
      const pos = vertexToPixel(vertex, this.hexSize);
      const graphics = new PIXI.Graphics();

      graphics.circle(0, 0, 8);
      graphics.fill({ color, alpha: 0.6 });
      graphics.stroke({ color: 0xffffff, width: 2 });

      graphics.position.set(pos.x, pos.y);
      graphics.eventMode = 'static';
      graphics.cursor = 'pointer';
      graphics.on('pointerdown', () => {
        if (this.onVertexClick) {
          this.onVertexClick(vertex);
        }
      });

      this.highlightContainer.addChild(graphics);
    });
  }

  highlightEdges(edges: EdgeCoord[], color: number = 0x00ff00) {
    this.clearHighlights();

    edges.forEach((edge) => {
      const pos = edgeToPixel(edge, this.hexSize);

      let rotation = 0;
      switch (edge.direction) {
        case "NorthEast":
        case "SouthWest":
          rotation = -Math.PI / 3;
          break;
        case "East":
        case "West":
          rotation = 0;
          break;
        case "SouthEast":
        case "NorthWest":
          rotation = Math.PI / 3;
          break;
      }

      const graphics = new PIXI.Graphics();
      graphics.roundRect(-15, -4, 30, 8, 2);
      graphics.fill({ color, alpha: 0.6 });
      graphics.stroke({ color: 0xffffff, width: 2 });

      graphics.position.set(pos.x, pos.y);
      graphics.rotation = rotation;
      graphics.eventMode = 'static';
      graphics.cursor = 'pointer';
      graphics.on('pointerdown', () => {
        if (this.onEdgeClick) {
          this.onEdgeClick(edge);
        }
      });

      this.highlightContainer.addChild(graphics);
    });
  }

  highlightHexes(hexes: HexCoord[], color: number = 0xff0000) {
    this.clearHighlights();

    hexes.forEach((hex) => {
      const pos = hexToPixel(hex, this.hexSize);
      const graphics = new PIXI.Graphics();

      graphics.poly(hexPoints(this.hexSize * 0.9));
      graphics.fill({ color, alpha: 0.4 });
      graphics.stroke({ color: 0xffffff, width: 3 });

      graphics.position.set(pos.x, pos.y);
      graphics.eventMode = 'static';
      graphics.cursor = 'pointer';
      graphics.on('pointerdown', () => {
        if (this.onHexClick) {
          this.onHexClick(hex);
        }
      });

      this.highlightContainer.addChild(graphics);
    });
  }

  clearHighlights() {
    this.highlightContainer.removeChildren();
  }

  destroy() {
    this.app.destroy(true);
  }
}
