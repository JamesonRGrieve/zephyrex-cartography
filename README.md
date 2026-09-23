# Zephyrex Cartography

Scene authoring for Foundry VTT v13+. Paint terrain, draw roads and rivers, and
build structures directly on the canvas. Walls, doors and lights come out as
real Foundry documents, so vision, movement and lighting just work.

It's an open (AGPL) alternative to the paid map tools (FA-Nexus, MapForge,
Dungeondraft, Inkarnate) and runs entirely inside Foundry.

## Features

- **Terrain:** 13 biomes as smoothed regions or freehand brush strokes, with
  soft edges and tiled textures from swappable texture packs.
- **Roads and rivers:** smooth, variable-width paths. Rivers taper at the ends.
  Paths can optionally emit walls along their centreline.
- **Structures:** grid-snapped rooms with floors. Each room gets native walls
  and a light, and a door tool turns any wall segment into a Foundry door.
  Editing a room keeps its walls, doors and light in sync.
- **Editing:** drag control points, delete points, erase, undo/redo, reorder.

In progress: structure-aware stamps (auto occlusion walls, light-emitting and
door stamps), multi-level scenes with stairs, and enterable buildings that open
into linked interior scenes.

## Asset packs

Art isn't bundled with this module. Stamps and terrain textures come from asset
pack modules such as `zephyrex-cartography-assets`. Packs follow a versioned
schema defined here, so anyone can publish their own.

## Install

Add the module to your Foundry `Data/modules` folder (built output in `dist/`),
then enable it in your world. Requires Foundry VTT v13 or later.

## Development

```bash
pnpm install
pnpm gate    # the full quality gate: format, lint, types, tests, ratchets, build
pnpm build   # Vite → dist/
pnpm test    # Vitest
```

Contributor rules and architecture live in [CLAUDE.md](CLAUDE.md).

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
