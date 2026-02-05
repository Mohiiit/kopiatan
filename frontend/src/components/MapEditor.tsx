import { createSignal, createEffect, Show, For, onMount, onCleanup } from "solid-js";
import type { Component } from "solid-js";
import * as PIXI from "pixi.js";
import type { HexCoord } from "../types/game";

// Simpler tile types for the editor
type EditorTileType = "Forest" | "Pasture" | "Field" | "Hill" | "Mountain" | "Desert";

// Standard Catan board has 19 land tiles + ocean border
const TILE_TYPES: EditorTileType[] = ["Forest", "Pasture", "Field", "Hill", "Mountain", "Desert"];

// Map editor tile colors
function getEditorTileColor(tileType: EditorTileType): number {
  const colors: Record<EditorTileType, number> = {
    Forest: 0x228b22,    // Lumber
    Pasture: 0x98fb98,   // Wool
    Field: 0xffd700,     // Grain
    Hill: 0xc9302c,      // Brick
    Mountain: 0x708090,  // Ore
    Desert: 0xf4a460,
  };
  return colors[tileType];
}
const DICE_NUMBERS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
const HEX_SIZE = 45;

interface MapTile {
  coord: HexCoord;
  tileType: EditorTileType;
  diceNumber: number | null;
}

interface MapConfig {
  name: string;
  tiles: MapTile[];
  version: string;
}

export const MapEditor: Component<{ onClose: () => void }> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let app: PIXI.Application | undefined;
  let boardContainer: PIXI.Container | undefined;

  const [tiles, setTiles] = createSignal<MapTile[]>(generateDefaultBoard());
  const [selectedTile, setSelectedTile] = createSignal<HexCoord | null>(null);
  const [mapName, setMapName] = createSignal("Custom Map");
  const [savedMaps, setSavedMaps] = createSignal<string[]>([]);
  const [validationErrors, setValidationErrors] = createSignal<string[]>([]);

  // Generate default standard Catan board layout
  function generateDefaultBoard(): MapTile[] {
    const tiles: MapTile[] = [];

    // Standard Catan hex coordinates (axial)
    const coords = [
      // Row 0 (top)
      { q: 0, r: -2 }, { q: 1, r: -2 }, { q: 2, r: -2 },
      // Row 1
      { q: -1, r: -1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 2, r: -1 },
      // Row 2 (middle)
      { q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 },
      // Row 3
      { q: -2, r: 1 }, { q: -1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 1 },
      // Row 4 (bottom)
      { q: -2, r: 2 }, { q: -1, r: 2 }, { q: 0, r: 2 },
    ];

    // Standard tile type distribution
    const typeDistribution: EditorTileType[] = [
      "Forest", "Forest", "Forest", "Forest",
      "Pasture", "Pasture", "Pasture", "Pasture",
      "Field", "Field", "Field", "Field",
      "Hill", "Hill", "Hill",
      "Mountain", "Mountain", "Mountain",
      "Desert",
    ];

    // Standard number distribution (no 7)
    const numberDistribution = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

    // Shuffle distributions for variety
    const shuffledTypes = [...typeDistribution].sort(() => Math.random() - 0.5);
    const shuffledNumbers = [...numberDistribution];

    let numberIndex = 0;
    coords.forEach((coord, i) => {
      const tileType = shuffledTypes[i];
      const diceNumber = tileType === "Desert" ? null : shuffledNumbers[numberIndex++];
      tiles.push({ coord, tileType, diceNumber });
    });

    return tiles;
  }

  function hexToPixel(coord: HexCoord): { x: number; y: number } {
    const x = HEX_SIZE * (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r);
    const y = HEX_SIZE * ((3 / 2) * coord.r);
    return { x, y };
  }

  function hexPoints(): number[] {
    const points: number[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      points.push(HEX_SIZE * Math.cos(angle));
      points.push(HEX_SIZE * Math.sin(angle));
    }
    return points;
  }

  onMount(async () => {
    if (!canvasRef) return;

    app = new PIXI.Application();
    await app.init({
      canvas: canvasRef,
      width: 600,
      height: 500,
      backgroundColor: 0x1e90ff,
      antialias: true,
    });

    boardContainer = new PIXI.Container();
    boardContainer.position.set(300, 250);
    app.stage.addChild(boardContainer);

    renderBoard();
    loadSavedMaps();
  });

  onCleanup(() => {
    app?.destroy(true);
  });

  createEffect(() => {
    // Re-render when tiles or selection changes
    // Access signals to track them
    tiles();
    selectedTile();
    renderBoard();
  });

  function renderBoard() {
    if (!boardContainer) return;
    boardContainer.removeChildren();

    tiles().forEach((tile) => {
      const pos = hexToPixel(tile.coord);
      const graphics = new PIXI.Graphics();

      // Draw hex
      const color = getEditorTileColor(tile.tileType);
      graphics.poly(hexPoints());
      graphics.fill({ color });

      // Highlight selected
      const isSelected =
        selectedTile()?.q === tile.coord.q && selectedTile()?.r === tile.coord.r;
      graphics.stroke({
        color: isSelected ? 0xffff00 : 0x333333,
        width: isSelected ? 3 : 2,
      });

      graphics.position.set(pos.x, pos.y);
      graphics.eventMode = "static";
      graphics.cursor = "pointer";
      graphics.on("pointerdown", () => {
        setSelectedTile(tile.coord);
      });

      boardContainer!.addChild(graphics);

      // Draw dice number
      if (tile.diceNumber) {
        const isHot = tile.diceNumber === 6 || tile.diceNumber === 8;

        const circle = new PIXI.Graphics();
        circle.circle(0, 0, 12);
        circle.fill({ color: 0xffffff });
        circle.position.set(pos.x, pos.y);
        boardContainer!.addChild(circle);

        const text = new PIXI.Text({
          text: tile.diceNumber.toString(),
          style: {
            fontSize: 14,
            fontWeight: "bold",
            fill: isHot ? 0xff0000 : 0x000000,
          },
        });
        text.anchor.set(0.5);
        text.position.set(pos.x, pos.y);
        boardContainer!.addChild(text);
      }
    });
  }

  function updateSelectedTile(updates: Partial<MapTile>) {
    const sel = selectedTile();
    if (!sel) return;

    setTiles((prev) =>
      prev.map((tile) =>
        tile.coord.q === sel.q && tile.coord.r === sel.r
          ? { ...tile, ...updates }
          : tile
      )
    );
  }

  function validateMap(): string[] {
    const errors: string[] = [];
    const tileList = tiles();

    // Check tile count
    if (tileList.length !== 19) {
      errors.push(`Expected 19 tiles, found ${tileList.length}`);
    }

    // Count tile types
    const typeCounts = new Map<EditorTileType, number>();
    tileList.forEach((t) => {
      typeCounts.set(t.tileType, (typeCounts.get(t.tileType) || 0) + 1);
    });

    // Validate resource distribution
    const desertCount = typeCounts.get("Desert") || 0;
    if (desertCount !== 1) {
      errors.push(`Expected 1 Desert, found ${desertCount}`);
    }

    // Check for tiles without numbers (except desert)
    const noNumberTiles = tileList.filter(
      (t) => t.tileType !== "Desert" && !t.diceNumber
    );
    if (noNumberTiles.length > 0) {
      errors.push(`${noNumberTiles.length} resource tiles missing dice numbers`);
    }

    // Check for too many 6s or 8s (simplified check - full adjacency would require hex neighbor calculation)
    const sixCount = tileList.filter((t) => t.diceNumber === 6).length;
    const eightCount = tileList.filter((t) => t.diceNumber === 8).length;
    if (sixCount > 2) {
      errors.push(`Too many 6s (${sixCount}), standard has 2`);
    }
    if (eightCount > 2) {
      errors.push(`Too many 8s (${eightCount}), standard has 2`);
    }

    setValidationErrors(errors);
    return errors;
  }

  function saveMap() {
    const errors = validateMap();
    if (errors.length > 0) {
      alert("Please fix validation errors before saving");
      return;
    }

    const config: MapConfig = {
      name: mapName(),
      tiles: tiles(),
      version: "1.0",
    };

    const key = `kopiatan_map_${mapName().toLowerCase().replace(/\s+/g, "_")}`;
    localStorage.setItem(key, JSON.stringify(config));

    loadSavedMaps();
    alert("Map saved successfully!");
  }

  function loadSavedMaps() {
    const maps: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("kopiatan_map_")) {
        const name = key.replace("kopiatan_map_", "").replace(/_/g, " ");
        maps.push(name);
      }
    }
    setSavedMaps(maps);
  }

  function loadMap(name: string) {
    const key = `kopiatan_map_${name.toLowerCase().replace(/\s+/g, "_")}`;
    const data = localStorage.getItem(key);
    if (data) {
      const config: MapConfig = JSON.parse(data);
      setTiles(config.tiles);
      setMapName(config.name);
      setSelectedTile(null);
    }
  }

  function deleteMap(name: string) {
    if (!confirm(`Delete map "${name}"?`)) return;
    const key = `kopiatan_map_${name.toLowerCase().replace(/\s+/g, "_")}`;
    localStorage.removeItem(key);
    loadSavedMaps();
  }

  function exportMap() {
    const config: MapConfig = {
      name: mapName(),
      tiles: tiles(),
      version: "1.0",
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${mapName().replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importMap(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const config: MapConfig = JSON.parse(ev.target?.result as string);
        setTiles(config.tiles);
        setMapName(config.name);
        setSelectedTile(null);
      } catch {
        alert("Invalid map file");
      }
    };
    reader.readAsText(file);
  }

  function randomize() {
    setTiles(generateDefaultBoard());
    setSelectedTile(null);
  }

  const getSelectedTile = () =>
    tiles().find(
      (t) => t.coord.q === selectedTile()?.q && t.coord.r === selectedTile()?.r
    );

  return (
    <div class="map-editor">
      <div class="editor-header">
        <h2>Map Editor</h2>
        <button onClick={props.onClose} class="close-btn">
          Close
        </button>
      </div>

      <div class="editor-content">
        <div class="canvas-container">
          <canvas ref={canvasRef} width={600} height={500} />
        </div>

        <div class="editor-sidebar">
          {/* Map Name */}
          <div class="section">
            <label>Map Name:</label>
            <input
              type="text"
              value={mapName()}
              onInput={(e) => setMapName(e.target.value)}
            />
          </div>

          {/* Tile Editor */}
          <Show when={selectedTile() && getSelectedTile()}>
            <div class="section tile-editor">
              <h3>Edit Tile ({selectedTile()!.q}, {selectedTile()!.r})</h3>

              <label>Type:</label>
              <select
                value={getSelectedTile()!.tileType}
                onChange={(e) =>
                  updateSelectedTile({
                    tileType: e.target.value as EditorTileType,
                    diceNumber:
                      e.target.value === "Desert"
                        ? null
                        : getSelectedTile()!.diceNumber,
                  })
                }
              >
                <For each={TILE_TYPES}>
                  {(type) => <option value={type}>{type}</option>}
                </For>
              </select>

              <Show when={getSelectedTile()!.tileType !== "Desert"}>
                <label>Dice Number:</label>
                <select
                  value={getSelectedTile()!.diceNumber || ""}
                  onChange={(e) =>
                    updateSelectedTile({
                      diceNumber: parseInt(e.target.value) || null,
                    })
                  }
                >
                  <option value="">None</option>
                  <For each={DICE_NUMBERS}>
                    {(num) => <option value={num}>{num}</option>}
                  </For>
                </select>
              </Show>
            </div>
          </Show>

          <Show when={!selectedTile()}>
            <p class="hint">Click a tile to edit</p>
          </Show>

          {/* Validation */}
          <Show when={validationErrors().length > 0}>
            <div class="section errors">
              <h3>Validation Errors</h3>
              <ul>
                <For each={validationErrors()}>
                  {(err) => <li>{err}</li>}
                </For>
              </ul>
            </div>
          </Show>

          {/* Actions */}
          <div class="section actions">
            <button onClick={validateMap} class="btn">
              Validate
            </button>
            <button onClick={saveMap} class="btn btn-primary">
              Save
            </button>
            <button onClick={randomize} class="btn">
              Randomize
            </button>
            <button onClick={exportMap} class="btn">
              Export
            </button>
            <label class="btn file-btn">
              Import
              <input
                type="file"
                accept=".json"
                onChange={importMap}
                style={{ display: "none" }}
              />
            </label>
          </div>

          {/* Saved Maps */}
          <div class="section saved-maps">
            <h3>Saved Maps</h3>
            <Show
              when={savedMaps().length > 0}
              fallback={<p class="hint">No saved maps</p>}
            >
              <div class="map-list">
                <For each={savedMaps()}>
                  {(name) => (
                    <div class="map-item">
                      <span>{name}</span>
                      <div class="map-actions">
                        <button onClick={() => loadMap(name)}>Load</button>
                        <button onClick={() => deleteMap(name)} class="delete">
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapEditor;
