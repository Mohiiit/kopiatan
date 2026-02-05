# Kopiatan

A Singapore-themed Catan game built in Rust with WebAssembly support.

## Project Structure

```
kopiatan/
├── crates/
│   └── catan-core/     # Core game engine (Phase 1)
├── frontend/           # SolidJS + Pixi.js UI (Phase 2)
└── server/             # WebSocket multiplayer server (Phase 3)
```

## Phase 1: Core Game Engine ✅

The core game engine (`catan-core`) provides:

- **Hex Coordinate System**: Axial coordinates for hex grid, vertices, and edges
- **Board Representation**: Tiles, buildings, harbors, and resource distribution
- **Player State**: Resources, development cards, victory points
- **Game State Machine**: Full Catan rules with turn phases, trading, robber, etc.

### Running Tests

```bash
cargo test
```

### Singapore Theme

Resources are themed after Singapore landmarks:
- **Brick** → HDB Estates (construction)
- **Lumber** → Botanic Gardens (nature reserves)
- **Ore** → Jurong Industrial (heavy industry)
- **Grain** → Hawker Centers (food culture)
- **Wool** → Sentosa (leisure/tourism)
- **Desert** → Bukit Timah (nature reserve)

## Roadmap

- [x] Phase 1: Core Game Engine
- [ ] Phase 2: Local Single-Player UI (WASM + SolidJS)
- [ ] Phase 3: Multiplayer Infrastructure (WebSocket)
- [ ] Phase 4: Custom Map Editor
- [ ] Phase 5: Trading & Robber Polish
- [ ] Phase 6: Bot Players
- [ ] Phase 7: Persistence & Accounts
- [ ] Phase 8: Deployment

## License

MIT
