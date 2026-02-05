import * as PIXI from "pixi.js";
import type { HexCoord, VertexCoord, EdgeCoord, Tile, VertexBuilding, EdgeBuilding, Player, TileType, Resource } from "../types/game";
import { getPlayerColor } from "../types/game";

// Hex geometry constants
const HEX_SIZE = 50; // Radius in pixels

// Enhanced color palette - Singapore themed
const TILE_COLORS: Record<string, { base: number; highlight: number; shadow: number }> = {
  Brick: { base: 0xc0392b, highlight: 0xe74c3c, shadow: 0x922b21 },      // HDB Estates - warm red
  Lumber: { base: 0x27ae60, highlight: 0x2ecc71, shadow: 0x1e8449 },     // Botanic Gardens - lush green
  Ore: { base: 0x5d6d7e, highlight: 0x85929e, shadow: 0x34495e },        // Jurong Industrial - steel gray
  Grain: { base: 0xf39c12, highlight: 0xf7dc6f, shadow: 0xd68910 },      // Hawker Centers - golden yellow
  Wool: { base: 0xa8e6cf, highlight: 0xdcedc1, shadow: 0x88d4ab },       // Sentosa Resort - tropical teal
  Desert: { base: 0xdcc6a0, highlight: 0xf5e6c8, shadow: 0xc9b896 },     // Bukit Timah - sandy beige
  Ocean: { base: 0x1a5276, highlight: 0x2980b9, shadow: 0x154360 },      // Singapore Strait - deep blue
};

// Player colors with enhanced palette
const PLAYER_COLORS: Record<string, { base: number; highlight: number; shadow: number }> = {
  Red: { base: 0xe74c3c, highlight: 0xf1948a, shadow: 0xb03a2e },
  Blue: { base: 0x3498db, highlight: 0x85c1e9, shadow: 0x2471a3 },
  Orange: { base: 0xe67e22, highlight: 0xf5b041, shadow: 0xca6f1e },
  White: { base: 0xecf0f1, highlight: 0xffffff, shadow: 0xbdc3c7 },
};

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

// Get tile color key from tile type
function getTileColorKey(tileType: TileType): string {
  if (tileType === "Desert") return "Desert";
  if (tileType === "Ocean") return "Ocean";
  if (typeof tileType === "object" && "Resource" in tileType) {
    return tileType.Resource;
  }
  return "Desert";
}

// Get resource icon symbol
function getResourceSymbol(resource: Resource): string {
  const symbols: Record<Resource, string> = {
    Brick: "🏢",
    Lumber: "🌳",
    Ore: "⚙️",
    Grain: "🍜",
    Wool: "🏖️",
  };
  return symbols[resource];
}

export class BoardRenderer {
  private app: PIXI.Application;
  private boardContainer: PIXI.Container;
  private highlightContainer: PIXI.Container;
  private buildingsContainer: PIXI.Container;
  private effectsContainer: PIXI.Container;
  private hexSize: number;
  private centerOffset: { x: number; y: number };

  private onVertexClick?: (vertex: VertexCoord) => void;
  private onEdgeClick?: (edge: EdgeCoord) => void;
  private onHexClick?: (hex: HexCoord) => void;

  // Track highlight graphics for hover effects
  private vertexHighlights: Map<string, PIXI.Graphics> = new Map();
  private edgeHighlights: Map<string, PIXI.Graphics> = new Map();
  private hexHighlights: Map<string, PIXI.Graphics> = new Map();

  constructor(_canvas: HTMLCanvasElement, width: number, height: number) {
    this.hexSize = HEX_SIZE;
    this.centerOffset = { x: width / 2, y: height / 2 };

    this.app = new PIXI.Application();
    this.boardContainer = new PIXI.Container();
    this.highlightContainer = new PIXI.Container();
    this.buildingsContainer = new PIXI.Container();
    this.effectsContainer = new PIXI.Container();
  }

  async init(canvas: HTMLCanvasElement, width: number, height: number) {
    await this.app.init({
      canvas,
      width,
      height,
      backgroundColor: 0x0d1b2a, // Deep navy background
      antialias: true,
    });

    this.boardContainer.position.set(this.centerOffset.x, this.centerOffset.y);
    this.highlightContainer.position.set(this.centerOffset.x, this.centerOffset.y);
    this.buildingsContainer.position.set(this.centerOffset.x, this.centerOffset.y);
    this.effectsContainer.position.set(this.centerOffset.x, this.centerOffset.y);

    this.app.stage.addChild(this.boardContainer);
    this.app.stage.addChild(this.highlightContainer);
    this.app.stage.addChild(this.buildingsContainer);
    this.app.stage.addChild(this.effectsContainer);

    // Add ambient animation tick
    this.app.ticker.add(() => this.animateTick());
  }

  private animationTime = 0;
  private animateTick() {
    this.animationTime += 0.016; // ~60fps

    // Subtle pulse on highlight vertices
    this.vertexHighlights.forEach((graphics) => {
      const scale = 1 + Math.sin(this.animationTime * 3) * 0.1;
      graphics.scale.set(scale);
    });

    // Subtle pulse on highlight edges
    this.edgeHighlights.forEach((graphics) => {
      const alpha = 0.5 + Math.sin(this.animationTime * 2.5) * 0.2;
      graphics.alpha = alpha;
    });

    // Subtle pulse on highlight hexes
    this.hexHighlights.forEach((graphics) => {
      const alpha = 0.35 + Math.sin(this.animationTime * 2) * 0.15;
      graphics.alpha = alpha;
    });
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

    // Draw ocean background gradient
    this.drawOceanBackground();

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

  private drawOceanBackground() {
    const bg = new PIXI.Graphics();
    // Draw a large gradient-like ocean area
    bg.circle(0, 0, 350);
    bg.fill({ color: 0x154360, alpha: 0.5 });
    bg.circle(0, 0, 300);
    bg.fill({ color: 0x1a5276, alpha: 0.3 });
    this.boardContainer.addChild(bg);
  }

  private parseVertexCoord(str: string): VertexCoord | null {
    try {
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
    const container = new PIXI.Container();
    container.position.set(pos.x, pos.y);

    const colorKey = getTileColorKey(tile.tile_type);
    const colors = TILE_COLORS[colorKey] || TILE_COLORS.Desert;

    // Draw hex shadow (offset slightly)
    const shadow = new PIXI.Graphics();
    shadow.poly(hexPoints(this.hexSize * 0.98));
    shadow.fill({ color: 0x000000, alpha: 0.3 });
    shadow.position.set(2, 3);
    container.addChild(shadow);

    // Draw main hex fill
    const hexFill = new PIXI.Graphics();
    hexFill.poly(hexPoints(this.hexSize));
    hexFill.fill({ color: colors.base });
    container.addChild(hexFill);

    // Draw hex inner highlight (top-left)
    const highlight = new PIXI.Graphics();
    highlight.poly(hexPoints(this.hexSize * 0.85));
    highlight.fill({ color: colors.highlight, alpha: 0.3 });
    highlight.position.set(-2, -2);
    container.addChild(highlight);

    // Draw hex border
    const border = new PIXI.Graphics();
    border.poly(hexPoints(this.hexSize));
    border.stroke({ color: colors.shadow, width: 3 });
    container.addChild(border);

    // Inner border for depth
    const innerBorder = new PIXI.Graphics();
    innerBorder.poly(hexPoints(this.hexSize * 0.95));
    innerBorder.stroke({ color: colors.highlight, width: 1, alpha: 0.5 });
    container.addChild(innerBorder);

    // Make clickable
    hexFill.eventMode = 'static';
    hexFill.cursor = 'pointer';
    hexFill.on('pointerdown', () => {
      if (this.onHexClick) {
        this.onHexClick(tile.coord);
      }
    });

    this.boardContainer.addChild(container);

    // Draw resource icon for resource tiles
    if (tile.tile_type !== "Ocean" && typeof tile.tile_type === "object" && "Resource" in tile.tile_type) {
      const symbol = getResourceSymbol(tile.tile_type.Resource);
      const icon = new PIXI.Text({
        text: symbol,
        style: {
          fontSize: 18,
          fontFamily: 'system-ui',
        }
      });
      icon.anchor.set(0.5);
      icon.position.set(pos.x, pos.y - 20);
      icon.alpha = 0.6;
      this.boardContainer.addChild(icon);
    }

    // Draw dice number
    if (tile.dice_number && tile.tile_type !== "Ocean") {
      this.drawDiceNumber(pos, tile.dice_number, tile.has_robber);
    }

    // Draw robber
    if (tile.has_robber) {
      this.drawRobber(pos);
    }
  }

  private drawDiceNumber(pos: { x: number; y: number }, number: number, hasRobber: boolean) {
    const isHot = number === 6 || number === 8;
    const yOffset = hasRobber ? -8 : 8;

    // Number circle container
    const container = new PIXI.Container();
    container.position.set(pos.x, pos.y + yOffset);

    // Circle shadow
    const shadow = new PIXI.Graphics();
    shadow.circle(1, 2, 16);
    shadow.fill({ color: 0x000000, alpha: 0.3 });
    container.addChild(shadow);

    // Circle background with gradient effect
    const circleBg = new PIXI.Graphics();
    circleBg.circle(0, 0, 16);
    circleBg.fill({ color: 0xfaf3e0 });
    container.addChild(circleBg);

    // Inner highlight
    const circleHighlight = new PIXI.Graphics();
    circleHighlight.circle(-2, -2, 12);
    circleHighlight.fill({ color: 0xffffff, alpha: 0.4 });
    container.addChild(circleHighlight);

    // Circle border
    const circleBorder = new PIXI.Graphics();
    circleBorder.circle(0, 0, 16);
    circleBorder.stroke({ color: isHot ? 0xc0392b : 0x7f8c8d, width: 2 });
    container.addChild(circleBorder);

    // Number text
    const text = new PIXI.Text({
      text: number.toString(),
      style: {
        fontSize: isHot ? 18 : 16,
        fontWeight: 'bold',
        fontFamily: 'Georgia, serif',
        fill: isHot ? 0xc0392b : 0x2c3e50,
      }
    });
    text.anchor.set(0.5);
    container.addChild(text);

    // Probability dots
    const dots = Math.min(6 - Math.abs(7 - number), 5);
    const dotContainer = new PIXI.Container();
    for (let i = 0; i < dots; i++) {
      const dot = new PIXI.Graphics();
      dot.circle((i - (dots - 1) / 2) * 4, 10, 1.5);
      dot.fill({ color: isHot ? 0xc0392b : 0x7f8c8d });
      dotContainer.addChild(dot);
    }
    container.addChild(dotContainer);

    this.boardContainer.addChild(container);
  }

  private drawRobber(pos: { x: number; y: number }) {
    const container = new PIXI.Container();
    container.position.set(pos.x, pos.y + 25);

    // Robber shadow
    const shadow = new PIXI.Graphics();
    shadow.ellipse(2, 8, 10, 4);
    shadow.fill({ color: 0x000000, alpha: 0.4 });
    container.addChild(shadow);

    // Robber body - hooded figure
    const body = new PIXI.Graphics();
    // Body cone
    body.moveTo(-8, 8);
    body.lineTo(0, -8);
    body.lineTo(8, 8);
    body.lineTo(-8, 8);
    body.fill({ color: 0x1a1a2e });
    body.stroke({ color: 0x0d0d15, width: 2 });
    container.addChild(body);

    // Hood/head
    const head = new PIXI.Graphics();
    head.circle(0, -6, 7);
    head.fill({ color: 0x16213e });
    head.stroke({ color: 0x0d0d15, width: 2 });
    container.addChild(head);

    // Menacing eyes
    const leftEye = new PIXI.Graphics();
    leftEye.circle(-3, -6, 2);
    leftEye.fill({ color: 0xe74c3c });
    container.addChild(leftEye);

    const rightEye = new PIXI.Graphics();
    rightEye.circle(3, -6, 2);
    rightEye.fill({ color: 0xe74c3c });
    container.addChild(rightEye);

    this.boardContainer.addChild(container);
  }

  private drawBuilding(coord: VertexCoord, building: VertexBuilding, players: Player[]) {
    const pos = vertexToPixel(coord, this.hexSize);

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
    const colorName = player?.color || "White";
    const colors = PLAYER_COLORS[colorName] || PLAYER_COLORS.White;

    const container = new PIXI.Container();
    container.position.set(pos.x, pos.y);

    if (isCity) {
      this.drawCity(container, colors);
    } else {
      this.drawSettlement(container, colors);
    }

    this.buildingsContainer.addChild(container);
  }

  private drawSettlement(container: PIXI.Container, colors: { base: number; highlight: number; shadow: number }) {
    // Shadow
    const shadow = new PIXI.Graphics();
    shadow.moveTo(-8, 12);
    shadow.lineTo(10, 12);
    shadow.lineTo(10, 4);
    shadow.lineTo(2, -6);
    shadow.lineTo(-6, 4);
    shadow.lineTo(-8, 12);
    shadow.fill({ color: 0x000000, alpha: 0.3 });
    container.addChild(shadow);

    // House base
    const base = new PIXI.Graphics();
    base.rect(-7, 0, 14, 10);
    base.fill({ color: colors.base });
    container.addChild(base);

    // House shadow side
    const sideShadow = new PIXI.Graphics();
    sideShadow.rect(3, 0, 4, 10);
    sideShadow.fill({ color: colors.shadow });
    container.addChild(sideShadow);

    // Roof
    const roof = new PIXI.Graphics();
    roof.poly([-9, 0, 0, -10, 9, 0]);
    roof.fill({ color: colors.shadow });
    container.addChild(roof);

    // Roof highlight
    const roofHighlight = new PIXI.Graphics();
    roofHighlight.poly([-7, 0, 0, -8, 2, -4, -2, 0]);
    roofHighlight.fill({ color: colors.highlight, alpha: 0.5 });
    container.addChild(roofHighlight);

    // Door
    const door = new PIXI.Graphics();
    door.rect(-2, 4, 4, 6);
    door.fill({ color: colors.shadow });
    container.addChild(door);

    // Outline
    const outline = new PIXI.Graphics();
    outline.rect(-7, 0, 14, 10);
    outline.stroke({ color: 0x000000, width: 1.5 });
    outline.poly([-9, 0, 0, -10, 9, 0]);
    outline.stroke({ color: 0x000000, width: 1.5 });
    container.addChild(outline);
  }

  private drawCity(container: PIXI.Container, colors: { base: number; highlight: number; shadow: number }) {
    // Shadow
    const shadow = new PIXI.Graphics();
    shadow.rect(-10, 18, 24, 8);
    shadow.fill({ color: 0x000000, alpha: 0.25 });
    container.addChild(shadow);

    // Main building (left tower)
    const leftTower = new PIXI.Graphics();
    leftTower.rect(-12, -5, 10, 20);
    leftTower.fill({ color: colors.base });
    container.addChild(leftTower);

    // Left tower shadow side
    const leftShadow = new PIXI.Graphics();
    leftShadow.rect(-4, -5, 2, 20);
    leftShadow.fill({ color: colors.shadow });
    container.addChild(leftShadow);

    // Left tower roof
    const leftRoof = new PIXI.Graphics();
    leftRoof.poly([-14, -5, -7, -15, 0, -5]);
    leftRoof.fill({ color: colors.shadow });
    container.addChild(leftRoof);

    // Right tower (taller)
    const rightTower = new PIXI.Graphics();
    rightTower.rect(0, -12, 12, 27);
    rightTower.fill({ color: colors.base });
    container.addChild(rightTower);

    // Right tower shadow
    const rightShadow = new PIXI.Graphics();
    rightShadow.rect(8, -12, 4, 27);
    rightShadow.fill({ color: colors.shadow });
    container.addChild(rightShadow);

    // Right tower roof
    const rightRoof = new PIXI.Graphics();
    rightRoof.poly([-2, -12, 6, -22, 14, -12]);
    rightRoof.fill({ color: colors.shadow });
    container.addChild(rightRoof);

    // Windows
    for (let i = 0; i < 2; i++) {
      const win = new PIXI.Graphics();
      win.rect(-9, -2 + i * 6, 3, 3);
      win.fill({ color: 0xffeaa7, alpha: 0.8 });
      container.addChild(win);
    }
    for (let i = 0; i < 3; i++) {
      const win = new PIXI.Graphics();
      win.rect(3, -8 + i * 6, 3, 3);
      win.fill({ color: 0xffeaa7, alpha: 0.8 });
      container.addChild(win);
    }

    // Outlines
    const outline = new PIXI.Graphics();
    outline.rect(-12, -5, 10, 20);
    outline.stroke({ color: 0x000000, width: 1.5 });
    outline.poly([-14, -5, -7, -15, 0, -5]);
    outline.stroke({ color: 0x000000, width: 1.5 });
    outline.rect(0, -12, 12, 27);
    outline.stroke({ color: 0x000000, width: 1.5 });
    outline.poly([-2, -12, 6, -22, 14, -12]);
    outline.stroke({ color: 0x000000, width: 1.5 });
    container.addChild(outline);
  }

  private drawRoad(coord: EdgeCoord, building: EdgeBuilding, players: Player[]) {
    if (typeof building !== "object" || !("Road" in building)) return;

    const playerId = building.Road;
    const player = players[playerId];
    const colorName = player?.color || "White";
    const colors = PLAYER_COLORS[colorName] || PLAYER_COLORS.White;

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

    const container = new PIXI.Container();
    container.position.set(pos.x, pos.y);
    container.rotation = rotation;

    // Road shadow
    const shadow = new PIXI.Graphics();
    shadow.roundRect(-16, -2, 32, 8, 3);
    shadow.fill({ color: 0x000000, alpha: 0.3 });
    shadow.position.set(1, 2);
    container.addChild(shadow);

    // Road base
    const roadBase = new PIXI.Graphics();
    roadBase.roundRect(-16, -3, 32, 8, 3);
    roadBase.fill({ color: colors.base });
    container.addChild(roadBase);

    // Road top highlight
    const roadHighlight = new PIXI.Graphics();
    roadHighlight.roundRect(-14, -3, 28, 3, 2);
    roadHighlight.fill({ color: colors.highlight, alpha: 0.5 });
    container.addChild(roadHighlight);

    // Road bottom shadow
    const roadShadow = new PIXI.Graphics();
    roadShadow.roundRect(-14, 2, 28, 2, 1);
    roadShadow.fill({ color: colors.shadow, alpha: 0.5 });
    container.addChild(roadShadow);

    // Road outline
    const outline = new PIXI.Graphics();
    outline.roundRect(-16, -3, 32, 8, 3);
    outline.stroke({ color: 0x000000, width: 1.5 });
    container.addChild(outline);

    this.buildingsContainer.addChild(container);
  }

  highlightVertices(vertices: VertexCoord[], color: number = 0x2ecc71) {
    this.clearHighlights();

    vertices.forEach((vertex) => {
      const pos = vertexToPixel(vertex, this.hexSize);
      const key = JSON.stringify(vertex);

      const container = new PIXI.Container();
      container.position.set(pos.x, pos.y);

      // Outer glow
      const glow = new PIXI.Graphics();
      glow.circle(0, 0, 14);
      glow.fill({ color, alpha: 0.3 });
      container.addChild(glow);

      // Main highlight circle
      const main = new PIXI.Graphics();
      main.circle(0, 0, 10);
      main.fill({ color, alpha: 0.7 });
      container.addChild(main);

      // Inner bright spot
      const inner = new PIXI.Graphics();
      inner.circle(-2, -2, 4);
      inner.fill({ color: 0xffffff, alpha: 0.5 });
      container.addChild(inner);

      // Border
      const border = new PIXI.Graphics();
      border.circle(0, 0, 10);
      border.stroke({ color: 0xffffff, width: 2 });
      container.addChild(border);

      // Plus icon hint
      const plus = new PIXI.Text({
        text: '+',
        style: {
          fontSize: 14,
          fontWeight: 'bold',
          fill: 0xffffff,
        }
      });
      plus.anchor.set(0.5);
      container.addChild(plus);

      container.eventMode = 'static';
      container.cursor = 'pointer';

      // Hover effects
      container.on('pointerover', () => {
        container.scale.set(1.3);
        glow.alpha = 0.5;
      });
      container.on('pointerout', () => {
        container.scale.set(1);
        glow.alpha = 0.3;
      });
      container.on('pointerdown', () => {
        // Click feedback
        this.createPlacementFeedback(pos.x, pos.y, color);
        if (this.onVertexClick) {
          this.onVertexClick(vertex);
        }
      });

      this.highlightContainer.addChild(container);
      this.vertexHighlights.set(key, container as unknown as PIXI.Graphics);
    });
  }

  highlightEdges(edges: EdgeCoord[], color: number = 0x2ecc71) {
    this.clearHighlights();

    edges.forEach((edge) => {
      const pos = edgeToPixel(edge, this.hexSize);
      const key = JSON.stringify(edge);

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

      const container = new PIXI.Container();
      container.position.set(pos.x, pos.y);
      container.rotation = rotation;

      // Outer glow
      const glow = new PIXI.Graphics();
      glow.roundRect(-20, -6, 40, 12, 4);
      glow.fill({ color, alpha: 0.3 });
      container.addChild(glow);

      // Main highlight
      const main = new PIXI.Graphics();
      main.roundRect(-16, -4, 32, 8, 3);
      main.fill({ color, alpha: 0.7 });
      container.addChild(main);

      // Border
      const border = new PIXI.Graphics();
      border.roundRect(-16, -4, 32, 8, 3);
      border.stroke({ color: 0xffffff, width: 2 });
      container.addChild(border);

      container.eventMode = 'static';
      container.cursor = 'pointer';

      // Hover effects
      container.on('pointerover', () => {
        container.scale.set(1.15);
        glow.alpha = 0.5;
      });
      container.on('pointerout', () => {
        container.scale.set(1);
        glow.alpha = 0.3;
      });
      container.on('pointerdown', () => {
        this.createPlacementFeedback(pos.x, pos.y, color);
        if (this.onEdgeClick) {
          this.onEdgeClick(edge);
        }
      });

      this.highlightContainer.addChild(container);
      this.edgeHighlights.set(key, container as unknown as PIXI.Graphics);
    });
  }

  highlightHexes(hexes: HexCoord[], color: number = 0xe74c3c) {
    this.clearHighlights();

    hexes.forEach((hex) => {
      const pos = hexToPixel(hex, this.hexSize);
      const key = JSON.stringify(hex);

      const container = new PIXI.Container();
      container.position.set(pos.x, pos.y);

      // Outer glow
      const glow = new PIXI.Graphics();
      glow.poly(hexPoints(this.hexSize));
      glow.fill({ color, alpha: 0.2 });
      container.addChild(glow);

      // Inner highlight
      const inner = new PIXI.Graphics();
      inner.poly(hexPoints(this.hexSize * 0.85));
      inner.fill({ color, alpha: 0.4 });
      container.addChild(inner);

      // Border
      const border = new PIXI.Graphics();
      border.poly(hexPoints(this.hexSize * 0.9));
      border.stroke({ color: 0xffffff, width: 3 });
      container.addChild(border);

      // Target icon
      const target = new PIXI.Graphics();
      target.circle(0, 0, 8);
      target.stroke({ color: 0xffffff, width: 2 });
      target.moveTo(-12, 0);
      target.lineTo(12, 0);
      target.stroke({ color: 0xffffff, width: 2 });
      target.moveTo(0, -12);
      target.lineTo(0, 12);
      target.stroke({ color: 0xffffff, width: 2 });
      container.addChild(target);

      container.eventMode = 'static';
      container.cursor = 'pointer';

      // Hover effects
      container.on('pointerover', () => {
        container.scale.set(1.05);
        inner.alpha = 0.6;
      });
      container.on('pointerout', () => {
        container.scale.set(1);
        inner.alpha = 0.4;
      });
      container.on('pointerdown', () => {
        this.createPlacementFeedback(pos.x, pos.y, color);
        if (this.onHexClick) {
          this.onHexClick(hex);
        }
      });

      this.highlightContainer.addChild(container);
      this.hexHighlights.set(key, container as unknown as PIXI.Graphics);
    });
  }

  private createPlacementFeedback(x: number, y: number, color: number) {
    // Create expanding ring effect
    const ring = new PIXI.Graphics();
    ring.circle(0, 0, 10);
    ring.stroke({ color, width: 3 });
    ring.position.set(x, y);
    this.effectsContainer.addChild(ring);

    // Create particles
    const particleCount = 8;
    const particles: PIXI.Graphics[] = [];
    for (let i = 0; i < particleCount; i++) {
      const particle = new PIXI.Graphics();
      particle.circle(0, 0, 3);
      particle.fill({ color });
      particle.position.set(x, y);
      this.effectsContainer.addChild(particle);
      particles.push(particle);
    }

    // Animate
    let progress = 0;
    const animate = () => {
      progress += 0.05;

      // Ring expands and fades
      ring.scale.set(1 + progress * 2);
      ring.alpha = 1 - progress;

      // Particles shoot outward
      particles.forEach((p, i) => {
        const angle = (Math.PI * 2 * i) / particleCount;
        const dist = progress * 40;
        p.position.set(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist);
        p.alpha = 1 - progress;
        p.scale.set(1 - progress * 0.5);
      });

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Cleanup
        this.effectsContainer.removeChild(ring);
        particles.forEach(p => this.effectsContainer.removeChild(p));
      }
    };
    animate();
  }

  // Public method to trigger dice roll feedback
  createDiceRollFeedback() {
    const centerX = 0;
    const centerY = 0;

    // Create starburst effect
    const starCount = 12;
    for (let i = 0; i < starCount; i++) {
      const star = new PIXI.Graphics();
      star.moveTo(0, 0);
      star.lineTo(0, -15);
      star.stroke({ color: 0xf39c12, width: 3 });
      star.position.set(centerX, centerY);
      star.rotation = (Math.PI * 2 * i) / starCount;
      this.effectsContainer.addChild(star);

      // Animate each ray
      let progress = 0;
      const animateStar = () => {
        progress += 0.04;
        star.scale.set(1 + progress * 3);
        star.alpha = 1 - progress;

        if (progress < 1) {
          requestAnimationFrame(animateStar);
        } else {
          this.effectsContainer.removeChild(star);
        }
      };
      setTimeout(animateStar, i * 30);
    }
  }

  clearHighlights() {
    this.highlightContainer.removeChildren();
    this.vertexHighlights.clear();
    this.edgeHighlights.clear();
    this.hexHighlights.clear();
  }

  destroy() {
    this.app.destroy(true);
  }
}
