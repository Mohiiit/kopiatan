import * as PIXI from "pixi.js";
import type { HexCoord, VertexCoord, EdgeCoord, Tile, VertexBuilding, EdgeBuilding, Player, TileType, Resource, Harbor } from "../types/game";

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

// Port colors - warm amber accents for Tropical Night Market theme
const PORT_COLORS = {
  Generic: { base: 0x6b4423, highlight: 0xd4a574, shadow: 0x3d2914, accent: 0xf4a460 }, // Warm brown for generic 3:1
  Brick: { base: 0xa83232, highlight: 0xe67373, shadow: 0x6b1f1f, accent: 0xff6b6b },
  Lumber: { base: 0x228b22, highlight: 0x66bb66, shadow: 0x145214, accent: 0x90ee90 },
  Ore: { base: 0x4a5568, highlight: 0x9ca3af, shadow: 0x2d3748, accent: 0xcbd5e1 },
  Grain: { base: 0xd97706, highlight: 0xfbbf24, shadow: 0x92400e, accent: 0xfde68a },
  Wool: { base: 0x5eead4, highlight: 0xa7f3d0, shadow: 0x2dd4bf, accent: 0xd1fae5 },
};

// Dock wood colors for consistent pier styling
const DOCK_COLORS = {
  plank: 0x8b6914,
  plankHighlight: 0xc9a227,
  plankShadow: 0x5c4a0f,
  post: 0x654321,
  rope: 0xd4a574,
};

export class BoardRenderer {
  private app: PIXI.Application;
  private boardContainer: PIXI.Container;
  private portsContainer: PIXI.Container;
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
    this.portsContainer = new PIXI.Container();
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
    this.portsContainer.position.set(this.centerOffset.x, this.centerOffset.y);
    this.highlightContainer.position.set(this.centerOffset.x, this.centerOffset.y);
    this.buildingsContainer.position.set(this.centerOffset.x, this.centerOffset.y);
    this.effectsContainer.position.set(this.centerOffset.x, this.centerOffset.y);

    this.app.stage.addChild(this.boardContainer);
    this.app.stage.addChild(this.portsContainer);
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
    players: Player[],
    harbors?: Harbor[]
  ) {
    this.boardContainer.removeChildren();
    this.portsContainer.removeChildren();
    this.buildingsContainer.removeChildren();

    // Draw ocean background gradient
    this.drawOceanBackground();

    // Draw tiles
    Object.values(tiles).forEach((tile) => {
      this.drawTile(tile);
    });

    // Draw harbors/ports
    if (harbors && harbors.length > 0) {
      harbors.forEach((harbor) => {
        this.drawHarbor(harbor);
      });
    }

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

    // Draw resource-specific pattern overlay
    this.drawTilePattern(container, colorKey, colors, this.hexSize);

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

      // Create a container for the resource icon badge
      const iconContainer = new PIXI.Container();
      // Position in the upper-left area of the hex to avoid overlapping with dice number
      iconContainer.position.set(pos.x - 18, pos.y - 25);

      // Draw shadow for depth
      const iconShadow = new PIXI.Graphics();
      iconShadow.circle(1, 2, 15);
      iconShadow.fill({ color: 0x000000, alpha: 0.45 });
      iconContainer.addChild(iconShadow);

      // Draw background circle - use a contrasting dark color for visibility
      const bgCircle = new PIXI.Graphics();
      bgCircle.circle(0, 0, 15);
      bgCircle.fill({ color: 0x1a2634, alpha: 0.95 });
      iconContainer.addChild(bgCircle);

      // Draw inner highlight ring for depth
      const innerRing = new PIXI.Graphics();
      innerRing.circle(-1, -1, 12);
      innerRing.fill({ color: 0x2c3e50, alpha: 0.4 });
      iconContainer.addChild(innerRing);

      // Draw border ring for extra contrast
      const borderRing = new PIXI.Graphics();
      borderRing.circle(0, 0, 15);
      borderRing.stroke({ color: 0xffffff, width: 2.5, alpha: 0.85 });
      iconContainer.addChild(borderRing);

      // Draw the emoji icon - larger and fully opaque
      const icon = new PIXI.Text({
        text: symbol,
        style: {
          fontSize: 16,
          fontFamily: 'system-ui',
        }
      });
      icon.anchor.set(0.5);
      icon.position.set(0, 0);
      iconContainer.addChild(icon);

      this.boardContainer.addChild(iconContainer);
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

  /**
   * Draws resource-specific procedural patterns on hex tiles.
   * Patterns are subtle overlays drawn between the base fill and the inner highlight.
   * Uses lighter/darker variants of the base color at low alpha for subtlety.
   */
  private drawTilePattern(
    container: PIXI.Container,
    colorKey: string,
    colors: { base: number; highlight: number; shadow: number },
    size: number
  ) {
    const pattern = new PIXI.Graphics();
    const patternAlpha = 0.2;
    const innerSize = size * 0.92; // Stay well within hex bounds

    // Helper to check if a point is inside the hex (pointy-top)
    // We use a simpler approach: just keep pattern elements within a conservative radius
    const maxR = innerSize * 0.85;

    switch (colorKey) {
      case "Brick": {
        // Brick pattern: small rectangles arranged in offset rows (HDB Estates)
        const brickW = 12;
        const brickH = 6;
        const gap = 1.5;
        const rows = 9;
        const cols = 7;
        const startX = -(cols * (brickW + gap)) / 2;
        const startY = -(rows * (brickH + gap)) / 2;

        for (let row = 0; row < rows; row++) {
          const offsetX = row % 2 === 0 ? 0 : (brickW + gap) / 2;
          for (let col = 0; col < cols; col++) {
            const bx = startX + col * (brickW + gap) + offsetX;
            const by = startY + row * (brickH + gap);
            const cx = bx + brickW / 2;
            const cy = by + brickH / 2;
            // Only draw if center is within hex
            if (Math.sqrt(cx * cx + cy * cy) < maxR) {
              pattern.rect(bx, by, brickW, brickH);
              pattern.fill({ color: colors.shadow, alpha: patternAlpha });
              // Mortar line highlight on top edge
              pattern.moveTo(bx, by);
              pattern.lineTo(bx + brickW, by);
              pattern.stroke({ color: colors.highlight, width: 0.5, alpha: patternAlpha * 0.8 });
            }
          }
        }
        break;
      }

      case "Lumber": {
        // Tree canopy pattern: circles of varying sizes (Botanic Gardens)
        const trees = [
          { x: 0, y: -15, r: 14 },
          { x: -18, y: 8, r: 11 },
          { x: 16, y: 10, r: 12 },
          { x: -8, y: -30, r: 9 },
          { x: 22, y: -18, r: 8 },
          { x: -22, y: -14, r: 10 },
          { x: 8, y: 28, r: 9 },
          { x: -14, y: 24, r: 8 },
          { x: 28, y: -4, r: 7 },
        ];
        trees.forEach((t) => {
          if (Math.sqrt(t.x * t.x + t.y * t.y) + t.r < maxR) {
            // Tree shadow (slightly offset)
            pattern.circle(t.x + 1, t.y + 1, t.r);
            pattern.fill({ color: colors.shadow, alpha: patternAlpha * 0.6 });
            // Main canopy
            pattern.circle(t.x, t.y, t.r);
            pattern.fill({ color: colors.highlight, alpha: patternAlpha });
            // Inner highlight (light dapple)
            pattern.circle(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.5);
            pattern.fill({ color: colors.highlight, alpha: patternAlpha * 0.7 });
          }
        });
        break;
      }

      case "Ore": {
        // Angular rock/mountain shapes (Jurong Industrial)
        const rocks = [
          // Large central mountain
          [0, 5, -15, -20, -30, 5],
          [0, 5, 15, -20, 30, 5],
          // Smaller rocks scattered
          [-25, 15, -18, -5, -10, 15],
          [12, 20, 20, 0, 28, 20],
          [-8, -15, 0, -35, 8, -15],
          [20, -10, 28, -25, 35, -10],
          [-30, -5, -22, -20, -15, -5],
        ];
        rocks.forEach((r) => {
          const cx = (r[0] + r[2] + r[4]) / 3;
          const cy = (r[1] + r[3] + r[5]) / 3;
          if (Math.sqrt(cx * cx + cy * cy) < maxR * 0.85) {
            // Rock face (darker)
            pattern.poly(r);
            pattern.fill({ color: colors.shadow, alpha: patternAlpha });
            // Highlight edge on left side
            pattern.moveTo(r[0], r[1]);
            pattern.lineTo(r[2], r[3]);
            pattern.stroke({ color: colors.highlight, width: 1, alpha: patternAlpha * 0.8 });
          }
        });
        break;
      }

      case "Grain": {
        // Wheat stalk patterns: vertical lines with small V shapes (Hawker Centers)
        const stalks = [-28, -18, -8, 2, 12, 22];
        stalks.forEach((sx) => {
          const baseY = 25;
          const topY = -25;
          if (Math.abs(sx) < maxR * 0.7) {
            // Stalk stem
            pattern.moveTo(sx, baseY);
            pattern.lineTo(sx, topY);
            pattern.stroke({ color: colors.shadow, width: 1.5, alpha: patternAlpha });

            // Wheat kernels as small V shapes along the stalk
            for (let ky = topY + 4; ky < topY + 22; ky += 5) {
              // Left kernel
              pattern.moveTo(sx, ky);
              pattern.lineTo(sx - 4, ky - 3);
              pattern.stroke({ color: colors.highlight, width: 1, alpha: patternAlpha });
              // Right kernel
              pattern.moveTo(sx, ky);
              pattern.lineTo(sx + 4, ky - 3);
              pattern.stroke({ color: colors.highlight, width: 1, alpha: patternAlpha });
            }

            // Small seed head at top
            pattern.circle(sx, topY, 2);
            pattern.fill({ color: colors.highlight, alpha: patternAlpha * 0.8 });
          }
        });
        break;
      }

      case "Wool": {
        // Wave/cloud patterns: gentle horizontal curved lines (Sentosa Resort)
        const waveRows = [-30, -18, -6, 6, 18, 30];
        waveRows.forEach((wy) => {
          const amplitude = 4;
          const wavelength = 14;
          pattern.moveTo(-maxR, wy);
          for (let wx = -maxR; wx < maxR; wx += wavelength) {
            const midX = wx + wavelength / 2;
            const endX = wx + wavelength;
            if (Math.sqrt(midX * midX + wy * wy) < maxR) {
              pattern.quadraticCurveTo(midX, wy - amplitude, endX, wy);
            }
          }
          pattern.stroke({ color: colors.highlight, width: 1.5, alpha: patternAlpha });

          // Second offset wave for cloud-like softness
          pattern.moveTo(-maxR + 7, wy + 4);
          for (let wx = -maxR + 7; wx < maxR; wx += wavelength) {
            const midX = wx + wavelength / 2;
            const endX = wx + wavelength;
            if (Math.sqrt(midX * midX + (wy + 4) * (wy + 4)) < maxR) {
              pattern.quadraticCurveTo(midX, wy + 4 + amplitude, endX, wy + 4);
            }
          }
          pattern.stroke({ color: colors.shadow, width: 1, alpha: patternAlpha * 0.6 });
        });
        break;
      }

      case "Desert": {
        // Sand dune contour lines (Bukit Timah)
        const contours = [
          { yCenter: -20, amplitude: 6 },
          { yCenter: -8, amplitude: 8 },
          { yCenter: 5, amplitude: 5 },
          { yCenter: 16, amplitude: 7 },
          { yCenter: 28, amplitude: 4 },
        ];
        contours.forEach((c) => {
          pattern.moveTo(-maxR, c.yCenter);
          for (let cx = -maxR; cx <= maxR; cx += 4) {
            const ny = c.yCenter + Math.sin(cx * 0.08) * c.amplitude + Math.sin(cx * 0.03) * c.amplitude * 0.5;
            if (Math.sqrt(cx * cx + ny * ny) < maxR) {
              pattern.lineTo(cx, ny);
            }
          }
          pattern.stroke({ color: colors.shadow, width: 1, alpha: patternAlpha * 0.7 });
        });

        // Subtle dot stippling for sandy texture
        const stipplePositions = [
          [-15, -25], [10, -22], [25, -10], [-20, 0], [5, 5],
          [20, 12], [-10, 18], [15, 25], [-25, 10], [0, -12],
          [-30, -8], [30, 2], [-5, 30], [22, -20], [-18, 22],
        ];
        stipplePositions.forEach(([sx, sy]) => {
          if (Math.sqrt(sx * sx + sy * sy) < maxR) {
            pattern.circle(sx, sy, 1);
            pattern.fill({ color: colors.shadow, alpha: patternAlpha * 0.5 });
          }
        });
        break;
      }

      case "Ocean": {
        // Wave ripple pattern: concentric arc rows (Singapore Strait)
        for (let wy = -35; wy <= 35; wy += 10) {
          for (let wx = -35; wx <= 35; wx += 16) {
            const ox = wx + (Math.floor(wy / 10) % 2 === 0 ? 0 : 8);
            if (Math.sqrt(ox * ox + wy * wy) < maxR * 0.9) {
              // Small wave crest
              pattern.moveTo(ox - 6, wy);
              pattern.quadraticCurveTo(ox, wy - 4, ox + 6, wy);
              pattern.stroke({ color: colors.highlight, width: 1.5, alpha: patternAlpha });
            }
          }
        }

        // Additional subtle horizontal shimmer lines
        for (let sy = -30; sy <= 30; sy += 14) {
          pattern.moveTo(-maxR * 0.6, sy + 5);
          pattern.quadraticCurveTo(0, sy + 8, maxR * 0.6, sy + 5);
          pattern.stroke({ color: colors.highlight, width: 0.8, alpha: patternAlpha * 0.5 });
        }
        break;
      }
    }

    // Mask the pattern to hex bounds using a hex-shaped mask drawn on the pattern itself
    // We achieve clipping by drawing the pattern first, then overlaying the exterior
    // Actually, Pixi.js Graphics doesn't support true clipping easily, so we use
    // the pattern Graphics as-is since we've carefully bounded all elements within maxR.
    container.addChild(pattern);
  }

  private drawDiceNumber(pos: { x: number; y: number }, number: number, hasRobber: boolean) {
    const isHot = number === 6 || number === 8;
    const yOffset = hasRobber ? -8 : 8;

    // Number circle container
    const container = new PIXI.Container();
    container.position.set(pos.x, pos.y + yOffset);

    // Outer drop shadow (soft, larger spread)
    const outerShadow = new PIXI.Graphics();
    outerShadow.circle(1, 3, 20);
    outerShadow.fill({ color: 0x000000, alpha: 0.2 });
    container.addChild(outerShadow);

    // Circle shadow
    const shadow = new PIXI.Graphics();
    shadow.circle(1, 2, 18);
    shadow.fill({ color: 0x000000, alpha: 0.35 });
    container.addChild(shadow);

    // Circle background with gradient effect - cream
    const circleBg = new PIXI.Graphics();
    circleBg.circle(0, 0, 18);
    circleBg.fill({ color: 0xfaf3e0 });
    container.addChild(circleBg);

    // Inner highlight (top-left sheen)
    const circleHighlight = new PIXI.Graphics();
    circleHighlight.circle(-3, -3, 13);
    circleHighlight.fill({ color: 0xffffff, alpha: 0.35 });
    container.addChild(circleHighlight);

    // Circle border
    const circleBorder = new PIXI.Graphics();
    circleBorder.circle(0, 0, 18);
    circleBorder.stroke({ color: isHot ? 0xc0392b : 0x7f8c8d, width: 2.5 });
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

    // Probability dots - larger and more visible
    const dots = Math.min(6 - Math.abs(7 - number), 5);
    const dotContainer = new PIXI.Container();
    for (let i = 0; i < dots; i++) {
      const dot = new PIXI.Graphics();
      dot.circle((i - (dots - 1) / 2) * 5, 12, 2);
      dot.fill({ color: isHot ? 0xc0392b : 0x5d6d7e });
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

  private drawHarbor(harbor: Harbor) {
    const edgePos = edgeToPixel(harbor.edge, this.hexSize);

    // Calculate position offset - ports should be rendered on the ocean side of the edge
    const centerDist = Math.sqrt(edgePos.x * edgePos.x + edgePos.y * edgePos.y);
    const offsetScale = centerDist > 0 ? 55 / centerDist : 0;
    const offsetX = edgePos.x * offsetScale;
    const offsetY = edgePos.y * offsetScale;

    const pos = {
      x: edgePos.x + offsetX,
      y: edgePos.y + offsetY,
    };

    const container = new PIXI.Container();
    container.position.set(pos.x, pos.y);

    // Determine harbor type and colors
    const isGeneric = harbor.harbor_type === "Generic";
    const resource = typeof harbor.harbor_type === "object" && "Specific" in harbor.harbor_type
      ? harbor.harbor_type.Specific
      : null;

    const colorKey = isGeneric ? "Generic" : (resource || "Generic");
    const colors = PORT_COLORS[colorKey as keyof typeof PORT_COLORS] || PORT_COLORS.Generic;

    // Calculate angle from port to edge (pointing toward the board)
    const angle = Math.atan2(-offsetY, -offsetX);

    // --- Draw connecting dashed line from port to edge ---
    const lineLength = 35;
    const dashCount = 4;
    const dashLength = lineLength / (dashCount * 2);

    for (let i = 0; i < dashCount; i++) {
      const startT = (i * 2 + 0.3) / (dashCount * 2);
      const endT = (i * 2 + 1.3) / (dashCount * 2);

      const dash = new PIXI.Graphics();
      dash.moveTo(
        Math.cos(angle) * lineLength * startT,
        Math.sin(angle) * lineLength * startT
      );
      dash.lineTo(
        Math.cos(angle) * lineLength * endT,
        Math.sin(angle) * lineLength * endT
      );
      dash.stroke({ color: colors.accent, width: 2, alpha: 0.6 });
      container.addChild(dash);
    }

    // --- Draw glowing beacon/buoy marker ---
    const buoyRadius = 18;

    // Outer glow effect (multiple layers)
    for (let i = 3; i >= 0; i--) {
      const glow = new PIXI.Graphics();
      const glowRadius = buoyRadius + i * 4;
      glow.circle(0, 0, glowRadius);
      glow.fill({ color: colors.accent, alpha: 0.08 - i * 0.015 });
      container.addChild(glow);
    }

    // Shadow under the buoy
    const shadow = new PIXI.Graphics();
    shadow.ellipse(2, 3, buoyRadius * 0.9, buoyRadius * 0.5);
    shadow.fill({ color: 0x000000, alpha: 0.25 });
    container.addChild(shadow);

    // Main buoy body - circular with gradient-like layering
    const buoyBase = new PIXI.Graphics();
    buoyBase.circle(0, 0, buoyRadius);
    buoyBase.fill({ color: colors.shadow });
    container.addChild(buoyBase);

    const buoyMid = new PIXI.Graphics();
    buoyMid.circle(0, -1, buoyRadius - 2);
    buoyMid.fill({ color: colors.base });
    container.addChild(buoyMid);

    // Highlight crescent on top-left
    const highlight = new PIXI.Graphics();
    highlight.arc(0, 0, buoyRadius - 3, -Math.PI * 0.8, -Math.PI * 0.2);
    highlight.stroke({ color: colors.highlight, width: 3, alpha: 0.7 });
    container.addChild(highlight);

    // Inner circle for content
    const innerCircle = new PIXI.Graphics();
    innerCircle.circle(0, -1, buoyRadius - 5);
    innerCircle.fill({ color: 0x1a2634, alpha: 0.85 });
    innerCircle.stroke({ color: colors.accent, width: 2 });
    container.addChild(innerCircle);

    // --- Content inside the buoy ---
    if (isGeneric) {
      // Generic port: Show ⚓ anchor and 3:1 ratio
      const anchorIcon = new PIXI.Text({
        text: "⚓",
        style: {
          fontSize: 14,
          fontFamily: 'system-ui',
        }
      });
      anchorIcon.anchor.set(0.5);
      anchorIcon.position.set(0, -6);
      container.addChild(anchorIcon);

      // Trade ratio
      const ratioText = new PIXI.Text({
        text: "3:1",
        style: {
          fontSize: 10,
          fontWeight: 'bold',
          fontFamily: 'system-ui, sans-serif',
          fill: 0xffffff,
        }
      });
      ratioText.anchor.set(0.5);
      ratioText.position.set(0, 6);
      container.addChild(ratioText);

    } else if (resource) {
      // Specific resource port: Show resource icon and 2:1 ratio
      const symbol = getResourceSymbol(resource);
      const icon = new PIXI.Text({
        text: symbol,
        style: {
          fontSize: 14,
          fontFamily: 'system-ui',
        }
      });
      icon.anchor.set(0.5);
      icon.position.set(0, -6);
      container.addChild(icon);

      // Trade ratio
      const ratioText = new PIXI.Text({
        text: "2:1",
        style: {
          fontSize: 10,
          fontWeight: 'bold',
          fontFamily: 'system-ui, sans-serif',
          fill: 0xffffff,
        }
      });
      ratioText.anchor.set(0.5);
      ratioText.position.set(0, 6);
      container.addChild(ratioText);
    }

    // Small decorative wave lines under the buoy
    const waves = new PIXI.Graphics();
    waves.moveTo(-10, buoyRadius + 3);
    waves.quadraticCurveTo(-5, buoyRadius + 6, 0, buoyRadius + 3);
    waves.quadraticCurveTo(5, buoyRadius, 10, buoyRadius + 3);
    waves.stroke({ color: colors.highlight, width: 1.5, alpha: 0.4 });
    container.addChild(waves);

    this.portsContainer.addChild(container);
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
    // Roads should lie ALONG the hex edges, connecting adjacent vertices
    // For a pointy-top hex, the edge angles from horizontal are:
    // - East/West edges: vertical (PI/2)
    // - NorthEast/SouthWest edges: PI/6 (30 degrees)
    // - SouthEast/NorthWest edges: -PI/6 (-30 degrees)
    let rotation = 0;
    switch (coord.direction) {
      case "NorthEast":
      case "SouthWest":
        rotation = Math.PI / 6;
        break;
      case "East":
      case "West":
        rotation = Math.PI / 2;
        break;
      case "SouthEast":
      case "NorthWest":
        rotation = -Math.PI / 6;
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

      // Rotation to align highlights along hex edges (same as road rotation)
      let rotation = 0;
      switch (edge.direction) {
        case "NorthEast":
        case "SouthWest":
          rotation = Math.PI / 6;
          break;
        case "East":
        case "West":
          rotation = Math.PI / 2;
          break;
        case "SouthEast":
        case "NorthWest":
          rotation = -Math.PI / 6;
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
