# Kopiatan

A Singapore-themed Catan game built in Rust with WebAssembly support and real-time multiplayer.

## Screenshots

### Main Menu
![Main Menu](screenshots/new-design/main-menu.png)

### Game Board - Setup Phase
![Game Board Setup](screenshots/new-design/settlement-placement.png)

### Game Board - Settlements Placed
![Setup Complete](screenshots/new-design/setup-complete.png)

## Features

- **Full Catan Gameplay**: Complete implementation of Catan rules including setup, trading, building, robber, and victory conditions
- **Singapore Theme**: Resources themed after Singapore landmarks with custom hex tile patterns
- **"Tropical Night Market" Design**: Dark navy UI with amber/gold accents, gradient buttons, and glowing effects
- **Multiplayer**: Real-time WebSocket multiplayer with room system and chat
- **Single Player**: Play locally with multiple players on the same machine
- **Map Editor**: Create and save custom board layouts
- **Save/Load**: Persist game state across sessions
- **Polished Visuals**: Procedural hex tile patterns, 3D-effect buildings, glowing port buoys, animated highlights, dice with dot displays, and card-style resource display

## Tech Stack

- **Game Engine**: Rust (compiled to WebAssembly via wasm-bindgen)
- **Frontend**: SolidJS + Pixi.js for WebGL board rendering
- **Server**: Rust WebSocket server for multiplayer
- **Styling**: CSS custom properties design system with Playfair Display + DM Sans typography

## Project Structure

```
kopiatan/
├── crates/
│   ├── catan-core/     # Core game engine (Rust)
│   └── catan-server/   # WebSocket game server
├── frontend/           # SolidJS + Pixi.js UI
│   ├── src/
│   │   ├── game/       # Pixi.js board renderer
│   │   ├── components/ # SolidJS UI components
│   │   ├── stores/     # Game & multiplayer state
│   │   └── utils/      # Sound manager, helpers
│   └── public/
├── reference/          # Design reference screenshots
└── screenshots/        # App screenshots
```

## Quick Start

### Prerequisites
- Rust (latest stable)
- Node.js 18+
- pnpm

### Running the Game

1. **Start the game server:**
```bash
cd crates/catan-server
cargo run
```

2. **Start the frontend:**
```bash
cd frontend
pnpm install
pnpm dev
```

3. Open http://localhost:5173 in your browser

### Running Tests

```bash
cargo test
```

## Game Phases

The game follows standard Catan phases:
1. **Setup**: Place initial settlements and roads
2. **PreRoll**: Roll dice to start turn
3. **MainPhase**: Build, trade, and develop
4. **RobberMoveRequired**: Move robber when 7 is rolled
5. **DiscardRequired**: Discard cards when you have 8+ and 7 is rolled

## Singapore Theme

Resources are themed after Singapore landmarks:
- **Brick** (HDB Estates) - warm red hex tiles with brick patterns
- **Lumber** (Botanic Gardens) - lush green with tree canopy patterns
- **Ore** (Jurong Industrial) - steel gray with angular rock shapes
- **Grain** (Hawker Centers) - golden yellow with wheat stalk patterns
- **Wool** (Sentosa Resort) - tropical teal with wave patterns
- **Desert** (Bukit Timah) - sandy beige with dune contours

## License

MIT
