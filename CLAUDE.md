# Zephyrex Cartography — Contributor & Agent Protocol

`zephyrex-cartography` is an **AGPL** Foundry VTT v14 module: a **standalone
scene authoring tool**. It paints terrain, draws roads and rivers, builds
structures (rooms, walls, doors, lights), and places **structure-aware stamps**,
all as **native Foundry documents**. It is the open-source take on the best of
**FA-Nexus**, **MapForge**, **Dungeondraft**, and **Inkarnate**.

Art (stamps, terrain textures) is **not** in this repo. It ships in separate
**asset-pack modules**, starting with
[`zephyrex-cartography-assets`](https://github.com/JamesonRGrieve/zephyrex-cartography-assets).
This module owns the engine and the **pack schema** every pack must conform to.

This file is authoritative for this repo. It stacks on the workspace standards
(`/home/jameson/Source/CLAUDE.md`) and the user-level engineering tenets; where
this file is more specific, it wins. **This is a standalone tool:** the checkout
happens to sit inside the `dh-campaign` directory, but that campaign vault and its
`CLAUDE.md` do **not** govern this repo, and nothing here may depend on it.

---

## ⛔ TOP RULES — non-negotiable

1. **Full gates, no shortcuts. Fresh code goes to ZERO — never baseline a
   problem in new code.** Every lint warning, type error, and coverage gap in
   code we write is fixed at the source, not recorded as an accepted floor. The
   ratchets exist to lock a *clean* state in as a hard gate, not to warehouse
   debt. If a rule legitimately does not apply (a genuine framework/parse
   boundary), use a **documented, point-of-use** exception — never a blanket
   disable, file override, or baseline.
2. **Match foundry-system's quality bar exactly.** Its patterns are the
   reference: graduate-at-zero ratchets, `require-await`/`promise-function-async`
   idioms, point-of-use `eslint-disable … -- <rationale>` for real boundaries.
3. **Architecture / dependency / asset-sourcing decisions are the operator's.**
   Surface the specific decision and ask; never infer a default.
4. **AGPL-3.0-or-later. SPDX header on every source file:**
   `// SPDX-License-Identifier: AGPL-3.0-or-later`. Every dependency must be
   licence-compatible. Art lives in asset packs under their own licences.
5. **Commit + push after each feature lands green** (the operator's standing
   cadence for this repo). Work on `main`, never branch. Stage explicit
   pathspecs, `git add <paths> && git commit` in one breath. Never `--no-verify`.
6. **Never invent assets/licences/facts.** Verify a licence before bundling;
   verify a Foundry API (document fields, region behaviour types) against
   fvtt-types before building on it. An empty query result is suspect, not proof.

---

## Code-quality bar — the full gate

`pnpm gate` runs the whole gate serially (CI uses it); `.husky/pre-commit` fans
the same set out in parallel. Both must be green before a commit. Every ratchet
is a **one-way valve**: a metric may improve, never regress, and a rule that
reaches zero **graduates to a hard error** (and, for ESLint, flips
`warn`→`error` in `.eslintrc.json`). Baselines are committed alongside the change
that moves them.

Gate members (all wired into `gate` + pre-commit + CI):

- **prettier** `--check` (zero diff), **stylelint**, **biome** (`biome:ratchet`, 0 diagnostics)
- **tsc** `--noEmit` (main + `tsconfig.test.json`), **strict:ratchet**, **test:typecheck:ratchet**
- **vitest** with v8 coverage (`pnpm test:coverage`): the full suite, green.
  **coverage:ratchet** holds lines, statements, functions and branches over
  the pure core at or above `.coverage-baseline`; a metric at 100% locks
  there. The Foundry boundary is covered by the e2e suite instead.
- **symmetry** (hard): every `src/ui/*-view.ts` has stories and a story test;
  every core module has a co-located test (or a reasoned entry in
  `.coverage-opt-out.json`); every production module is imported by another
  (tests and stories do not count, so nothing ships unreachable).
- **type-coverage** `--strict` — **locked at 100%** (`type-coverage:ratchet`); fix `any`/casts at the source (prefer a type guard over `as`), never lower the floor to pass
- **lint:ratchet** — 0 warnings; ~94 rules graduated to hard error
- **ts:ratchet** — `any` / `as any` / `@ts-expect-error` / `@ts-ignore` counts at 0
- **knip:ratchet** — no unused files/exports/deps (13 strict categories at 0)
- **deps:ratchet** — dependency-cruiser layering (see Architecture)
- **lockfile:validate** — lockfile resolves only to trusted hosts
- **build** (Vite lib) + **size-limit** (JS bundle only)
- **test:e2e** + **e2e:ratchet** (Tier B): the built module in a **real
  Foundry v14 server** (see "E2E suite" below). No test may fail; the passed
  count and the source coverage the suite reaches (`.e2e-baseline`) may not
  fall. Skipped with a banner where no Foundry release is available (CI).
- **test:storybook**: Storybook builds, and Playwright renders **every
  story** in its `index.json` in a real browser. Each must mount with no page
  or console errors or failed loads, and match its committed screenshot
  (`tests/storybook/stories.spec.ts-snapshots/`, taken with the system
  Chromium). CI uses Playwright's bundled Chromium and ignores snapshots.
  Refresh baselines deliberately with `pnpm test:storybook --update-snapshots`,
  then look at every changed PNG before committing it.

## E2E suite (Tier B)

`pnpm test:e2e` runs `tests/e2e/*.spec.ts` with Playwright against a real
Foundry v14 server.
- **Server.** Each worker gets its own server, data directory and world on
  port `FOUNDRY_TEST_PORT + slot` (base 30101). `scripts/e2e-world.mjs`
  provisions each one from `tests/e2e/fixtures/`:
  - a rules-free game system;
  - the seed world;
  - a stamp pack with one stamp per behaviour;
  - this module's `module.json` and current `dist/`.
- **Release.** It comes from `FOUNDRY_RELEASE_DIR` (default `.foundry-release`,
  gitignored; a symlink to a licensed release is fine).
  `scripts/foundry-hostname-shim.cjs` makes the local server match the
  licence's hostname. This is a throwaway local instance, never the live
  server.
- **Optional integrations.** Modules in `FOUNDRY_TEST_MODULES` (default
  `.foundry-test-modules`, gitignored) are installed and activated too:
  Item Piles with socketlib and lib-wrapper. The fixture configures Item
  Piles for the e2e system (its Actor type), as a GM would. Specs for an
  integration skip, with a reason, when its module is absent.
- **Specs.** They use the `world` fixture (`tests/e2e/lib/foundry.ts`): joined
  as the Gamemaster, module and pack active, a fresh gridded scene. They drive
  the module through its **public API**
  (`game.modules.get('zephyrex-cartography').api`: `controller()`,
  `buildSpec()`, `generateFloorPlan()`). They assert on the native documents
  Foundry holds.
  - Any page or console error fails the test.
  - Canvas screenshots (`frameScene`, which hides the UI; pass `'walls'` to
    show wall lines) are compared with `toHaveScreenshot`. They are pinned to
    the system Chromium with software GL. Refresh them with
    `pnpm test:e2e --update-snapshots=all`, then look at every changed PNG.
- **Coverage.** The fixture records the module's JS coverage per test.
  `scripts/e2e-coverage.mjs` maps it onto `src/` through the source maps
  (`.e2e-coverage/`), and that covers the Foundry boundary unit tests cannot
  reach.
- **Every roadmap feature lands with an e2e spec** that proves it in Foundry.

## UI views and Storybook

Every DOM view lives in `src/ui/` as a pure function from a view model to
elements. It dispatches actions to a pure reducer, and its view model sits in
the pure core (e.g. `stamps/browser.ts`). The view is built from nodes and
text, never from markup strings. Controls are labelled native elements, and
focus survives a re-render. Views never import `canvas/` or `foundry/`; a thin
ApplicationV2 host in `foundry/` mounts them.

- Each view has a co-located `*.stories.ts` (Storybook 10, `@storybook/html-vite`,
  a11y addon with `test: 'error'`). Stories run the real reducer, so they stay
  interactive. They use `stamps/fixtures.ts` (inline-SVG demo packs), never
  pack assets.
- Foundry's CSS is not redistributable. `.storybook/chrome.css` stands in for
  the window chrome, and stories wrap views in `.zephyrex-cartography` so the
  `tw-` utilities apply.
- A co-located `*-view.test.ts` mounts every story under vitest, so stories
  cannot rot, and `pnpm test:storybook` renders and screenshots every story
  in a real browser (see the gate). `pnpm storybook` runs the dev server.
- Tailwind's preflight is off: it is a global element reset and would restyle
  Foundry's own chrome.

CI (`.github/workflows/ci.yml`) runs `pnpm gate` then `git diff --exit-code` — a
ratchet that had to mutate a baseline means the gate was not run locally, and
fails the build. Ratchet run-report JSONs are gitignored; the `.*-baseline`
files are the committed source of truth.

**Package manager: `/home/jameson/.local/bin/pnpm`** (corepack pnpm is broken on
this box; use the absolute path — `~` may resolve to an ai-switcher session HOME).

---

## Architecture — hexagonal, pure core + thin boundary

Layering (inner → outer; enforced by dependency-cruiser):
`geometry` (pure math) ← `tools` (feature models, pack schema) ← `canvas`
(controller, renderer) ← `foundry` (document/PIXI boundary) ← entry.

- **Pure, unit-tested core** — `src/geometry/`, `src/tools/`, `src/canvas/`.
  No PIXI/Foundry imports. Every non-trivial pure unit has a test; this core
  carries the 100% type-coverage. Rendering and persistence are injected as
  interfaces (`DrawSurface`, `SceneStore`, `WallEmitter`, `LightEmitter`) so the
  whole flow is tested with fakes.
- **Thin Foundry/PIXI boundary** — `src/foundry/*` and the entry
  `src/zephyrex-cartography.ts`. The *only* code that touches Foundry globals.
  Kept minimal and **not unit-tested** by design. Bridge over-strict library
  types here with point-of-use documented exceptions:
  - `unknown` at a real parse/framework boundary → `// eslint-disable-next-line no-restricted-syntax -- boundary: …`.
  - `FoundryScene` mirrors `Scene`'s **methods** (not function properties) so the
    live document is structurally assignable — a scoped `method-signature-style`
    exception, documented in `foundry/boundary.ts`.
  - The one `scene as FoundryScene` bridge in the entry carries a documented
    `no-unnecessary-type-assertion` disable and `type-coverage:ignore-line`.
- **Single sources:** the module id lives only in `src/module-id.ts` (flag
  scope, settings namespace, served path). Every localisation key lives only in
  `src/i18n.ts`; `i18n.test.ts` asserts it matches `src/static/lang/en.json`
  exactly (no missing, no unused keys). `src/static/` is copied into `dist/`.
- **Persistence:** features live on the scene as the `zephyrex-cartography.features`
  flag. Parsing is **defensive and total** — parsers validate shape and drop
  malformed entries, never throw; new fields are optional with defaults.

---

## Generated native documents — the lifecycle rule

Walls, doors, lights, tiles, regions and scenes are **native Foundry documents**.
The plugin never keeps a parallel model of them; Foundry owns vision, movement,
door controls, lighting and navigation. **Every feature that generates documents
tracks their ids in its own scene-flag record**, so create / update / delete are
idempotent. Editing or removing a feature re-syncs *its* documents and never
orphans them or touches hand-placed ones. **Linking to an existing scene**
(hand-built or created by another tool) only **adds** the plugin's own documents
plus a link flag. It never rewrites content the plugin did not create.

---

## Feature scope and status

**Scene controls [done]:** a tool that makes a native document type sits in
that type's own control group, after Foundry's tools
(`canvas/tool-placement.ts`).
- **Walls:** room, door and materials. **Tiles:** stamp. Edit and erase
  appear in both groups too, so what a group draws can be reshaped there.
- **The module's own group** keeps what has no native home: roads, rivers,
  the paint tool, edit, erase, undo/redo, levels and the generator.
- **Tool panels.** A tool with choices opens its panel when picked, and the
  panel's choices are what the tool draws next. The **paint tool** is one
  tool for every terrain texture: its panel is a swatch grid of the biomes
  (each shown in the active set's texture, or its flat colour) and a brush
  size. Clicking points paints an area, dragging paints a stroke.
- **Roads and rivers.** Their panel sets the next path's width. Water,
  lava, poison and acid are all the **river tool**: the panel picks the
  liquid (which resets the shade and bed to that liquid's own), its shade,
  and the texture of the **bed** laid beneath it, wider than the river and
  feathered (or none). A river is drawn in the first of its liquid's
  texture roles the active set has (`water`, `floor.shallow-water`, …),
  tinted by the shade, and the scene spec's paths take `liquid`, `shade`
  and `bed`.
- **No flat fills.** Anything the active set has no texture for (a biome,
  a material, a bed, a liquid) is drawn in a seamless procedural pattern
  (`tools/procedural.ts`: ripples for liquids, grain for the rest) tinted in
  its colour.
- **Names.** Tools in a native group are named `zephyrex-<tool>`, so they
  never clash with Foundry's own (Walls has `doors`).
- **Inert native layers.** The tools set none of `interaction`, `creation`
  or `control`, so the native layer creates and selects nothing while one
  is active.
- **Redraws.** A canvas redraw re-activates the native layer with its tool
  still selected, and the draw layer picks the tool straight back up.
- **Pointer.** While a tool is active, the draw layer has a hit area over the
  whole scene. Without it, a bare container is hit only through what it has
  drawn, so clicks on empty canvas would never reach it. While idle it takes
  no events.
- **Left presses.** A tool's left press stops at the draw layer: reaching
  the stage, Foundry would also run its own gestures on it, such as the
  Shift long-press ping that pulls every view. The right button still pans.
- `tests/e2e/pointer.spec.ts` drives every tool with the real mouse from its
  group.

**Terrain & paths [done]:** click + freehand paths (Catmull-Rom, RDP), variable
width ribbons, river taper, 13-biome regions, freehand brush strokes, feathered
edges, tiled textures from selectable packs, control-point editing, eraser,
undo/redo, z-order, wall emission along paths.

**Structures [done]:** grid-snapped rooms with floors; perimeter walls as native
`WallDocument`s; wall re-sync on edit; doors (`WallDocument.door`) via a door
tool; an auto `AmbientLightDocument` per room at its centroid.

**Stamp engine [done]:**
- **Pack schema** (versioned, owned here — see below) that every asset pack's
  stamp catalog must validate against. Pack modules are discovered by flag.
- **Placement** as native `TileDocument`s from the browser (click, drag or
  double-click). A placed stamp records its image, footprint and behaviour at
  placement. Variants cycle in place from the Tile HUD, and GM edits to the tile
  (move, resize, rotate, delete) flow back into the feature.
- **Occlusion walls:** `bounds` wraps the rotated footprint; `alpha` traces the
  image once per variant (marching squares), falling back to bounds.
- **Light emitters:** `light` emits a native AmbientLight that follows the
  variant (`light: null` = unlit), the stamp's position and its rotation.
- **Doors:** a door stamp emits its door wall along its long axis in the
  variant's state and cuts collinear room walls; placing it snaps it onto the
  nearest room wall. A door opened in play switches the stamp's variant.
- **Terrain texture sets** come from packs (world `textureSet` setting).
- **Containers:** with Item Piles active (optional, `recommends`), a
  `container` stamp is backed by an Item Piles `container` pile over its
  footprint. The pile is kept when emptied, follows the stamp, and is deleted
  with it. The Item Piles API was verified against its v3.3 source.
- Stair and ladder `transition` stamps belong to Levels.

**Levels [done]:** native Foundry, no Levels module.
- **Model.** A scene's floors are elevation bands (`tools/levels.ts`). Every
  feature has a `level` (null shows on every level). Its documents take that
  level's floor elevation and level id.
- **Editing.** The GM edits one level at a time from the levels panel (pick,
  add above or below, rename, set band, remove when empty). Only that level's
  features, plus level-less ones, are drawn and pickable.
- **Stairs.** `transition` stamps (stairs, ladder, lift, hatch; up, down or
  both) generate one native `changeLevel` region over the stamp. It sits on
  the stamp's level and each adjacent level it reaches, spanning their bands.
  A token entering it is offered the other levels and keeps its height above
  the floor.
- **Native.** Levels *are* the scene's native Level documents. Walls, tiles,
  lights and regions get `levels`, so vision is per floor. Submap teleports
  use `destinations`, `placement: relative` and a choice when there are
  several.

**Submaps [done]:** an enterable stamp (a building, a hab) gets an "Interior"
button on its Tile HUD. The GM either creates a new interior scene (gridded like
the current one) or **links an existing one**, imported scenes included.

- **Regions.** The link fixes both region ids up front, so each teleport can
  name the other across scenes. The entrance sits over the stamp; the exit is
  one square at the interior's centre, for the GM to move.
- **Lifecycle.** The entrance follows the stamp (moves keep its id). The exit
  is deleted with the stamp or on unlink; the interior scene itself is always
  kept.
- **Levels.** An exit in a multi-level interior sits on that scene's initial
  Level, as teleports require.

**Undo/redo [done]** carries the scene with it. Features an undo or redo drops
are discarded (documents, container pile, interior exit). Features it brings
back are revived: documents recreated, a fresh pile, and the exit rebuilt under
its fixed id. Changed features re-sync from their live documents.

**Shared walls [done]:** rooms on the same floor never double a shared edge.
The earlier room (in feature order) owns the shared stretch and the later room
cuts it out. The stretch is a door if either room marks it. When a room is
added, moved or removed, only the neighbours whose planned walls change are
re-synced.

**Room doors [done]:** each room door has a Foundry type (door, secret) and
state (closed, open, locked). A bare segment index, the original format,
parses as a closed door.
- The door tool turns a wall into a door, and clicking an existing door opens
  the door panel to set type and state or remove it.
- A door changed in play is recorded on its room without recreating walls, so
  later re-syncs keep it as left. Each room wall doc carries its perimeter
  `segment` for that mapping.

**Per-point path width [done]:** in edit mode, Shift-dragging a road or river
control point sets that point's half-width to its distance from the pointer.
It previews live and is clamped to a visible minimum.

**Terrain as Scene Regions [done]:** an opt-in world setting (`terrainRegions`,
off by default). Each biome region and brush stroke gets a Scene Region over
exactly what is painted, named after its biome and on its level's band. They
carry no behaviours: GMs and systems attach their own (difficult terrain,
weather and so on). Toggling it, or loading a scene last edited under the
other setting, re-syncs only terrain that disagrees. Only the active GM writes.

**Room nesting [done]:** a room inside another room on the same level (a closet
in a hall) always draws above the room containing it and is picked first,
whatever the drawing order. Nesting is derived from geometry on every draw
(`tools/nesting.ts`), never stored, so edits cannot leave it stale.

**Room materials [done]:** a room's floor is a biome or a pack `floor.<name>`
texture role; its walls are either not drawn or a textured band along the
perimeter in a `wall.<name>` role (`tools/materials.ts`). The materials tool
sets both on a clicked room, and they are the defaults for new rooms. The
choices are whatever the active texture set provides. A role the set lacks
draws as flat colour. Materials are visual only: the native walls and doors
are the same whatever the wall material.

**Generative map builder [done]:** real maps are built *declaratively* with
this module's own tools, not by generating images.
- **Scene spec.** A map as data (`generate/spec.ts`, published as
  `schema/scene-spec.v1.schema.json`, same rules as the pack schema). It holds
  terrain regions and strokes, paths, rooms with doors and materials, stamps
  with interiors, and levels. Coordinates are in grid squares or scene px.
- **Realising.** `canvas/realize.ts` builds a spec through the controller's
  public API, exactly as the GM's tools would, so the result is ordinary,
  editable features. The whole spec is one undo step (`controller.batch`).
  Anything it cannot build (a missing stamp, an interior it cannot link) is
  reported, not thrown.
- **Floor-plan generator.** `generate/floor-plan.ts` is seeded and
  repeatable. It partitions a footprint into rooms wall to wall and crosses
  every split with a one-square door, so every room is reachable, plus an
  optional entrance.
- **Map builder window.** It generates a plan (seed, size, room sizes,
  entrance; rooms take the materials tool's current materials), or builds any
  pasted spec. A generated plan's spec lands in the spec box for editing. The
  spec's origin is the scene's top-left corner.
- **Declarative-first rule (still binding):** every tool's effect must be
  expressible as data and applied through the pure controller API. No
  behaviour may exist only in pointer/UI handlers. A new feature needs a
  scene-spec entry and a realiser test before it is done.

---

## Foundry v14 coverage — the roadmap

The goal is **full use of Foundry v14's scene features**.
- **Sources.** The list comes from comparing what the plugin generates with
  the v14 document schemas and region behaviours in the 14.359 source
  (`common/documents/*.mjs`, `common/constants.mjs`,
  `client/data/region-behaviors/`), and from the v14 release notes, 14.349 to
  14.368 (read 2026-09-23).
- **Checking.** The latest stable is 14.368 and the local reference source is
  14.359. Check anything the notes date after 14.359 against a newer release
  before building on it.
- **Closing a gap** means exposing the option everywhere it applies:
  - the engine's plan and document specs, and the Foundry translation;
  - the stamp pack schema (additive v1 fields);
  - the scene spec;
  - the UI.
  Release numbers in brackets say where a feature arrived.

Work down the priorities in order.

### Priority 0: v14 semantics the engine must respect [fixed]
- **Tile anchor.** A v14 tile's `(x, y)` is its *anchor* point, and it
  rotates about the anchor (`TileDocument#shape` is a `RectangleShapeData`,
  14.349). The core's frames are an unrotated top-left, so `tileCreateData`
  sends the centre with an explicit 0.5 anchor, and `tileFrame` converts a
  tile back through whatever anchor it has.
- **Level deletion (14.361).** Deleting a Level deletes every placeable that
  exists only on it. `reloadLevels` drops the features of a missing level,
  and removes them from the undo history too, so nothing is revived onto a
  level that is gone. Only the active GM does this; other clients re-read.

### Priority 1: engine foundations
These make everything after them cheaper and safer, so they come first.
- **[done] Atomic writes with `foundry.documents.modifyBatch(operations)`**
  [14.349; broadcasts to every client since 14.353]. It applies many create,
  update and delete operations as one database transaction.
  - Every edit is one controller transaction: with its dependent re-syncs,
    and likewise an undo, a redo, a batch and a built spec.
    `canvas/staged-changes.ts` stages its document changes, and the
    `DocumentSink` (`newId`, `write`) writes them as a single `modifyBatch`.
  - Operations cannot use each other's results, so every document gets its
    id up front and is created with `keepId`.
  - Removing a document created earlier in the same transaction cancels the
    create. A re-sync that plans as many tiles, or walls, as the feature
    has updates them in place, keeping their ids: a door or switch a player
    just used is never deleted from under them. A revived feature forgets
    its deleted ids first, so its documents are recreated.
  - Foundry's dry run drops updates that change nothing, and a batch left
    with nothing to write also resolves to no results; that is not a
    rejection.
  - Foundry rejects a batch that deletes and recreates one id. So a written
    region replaced under its own fixed id (a submap entrance following its
    stamp) is an update that leaves its behaviours alone.
  - Foundry reports a rejected batch only as an empty result, so
    `scene-bridge.modifyBatch` throws on it. Then the transaction rolls the
    features, the store and the undo history back to where it began.
    Side effects outside the scene's documents are not rolled back: another
    scene's exit, a pile or a level.
- **[done] Name every generated document** after its feature, for
  Foundry's Placeables sidebar tab and palette [14.354, 14.355]. Tiles take
  the stamp's pack name, which the stamp keeps. Lights are "<stamp> light" or
  "Room light". Regions describe what they connect or cover
  (`foundry/document-names.ts`). v14 walls have no name.
- **[done] Generated regions are `locked`** with visibility `LAYER`, since a
  feature owns their geometry. An interior exit stays unlocked for the GM to
  place. (From 14.356 the default visibility for non-template regions is
  only on the Region layer when unlocked, which would hide a locked region.)
- **[done] Level bands from the grid.** A new level is 4 grid squares
  tall, as Foundry makes them [14.368] (`levelHeightFor`). The entry sets
  the controller's `levelHeight` from the scene's grid distance, and a
  native Level with an open top is closed at that height.
  `DEFAULT_LEVEL_HEIGHT` is only the fallback for a scene with no grid.
- **[done] Emitter elevation.** Lights and sounds are no longer unbounded
  vertically; they reach by elevation and level [14.353, 14.355]. A stamp's
  light and sound sit on its level, at that level's floor plus the stamp's
  own elevation, and `tests/e2e/emitters.spec.ts` proves it in Foundry. Any
  new emitter (particles) follows the same rule and gets the same proof.
  A fresh v14 scene already has a default Level; nothing may assume level
  bands start at 0.
- **Level-aware helpers for the UI:** `CanvasDocument#locatedInLevel`
  [14.364] and `PlaceableObject#isFilteredOut` [14.364].

### Priority 2: native levels
- **[done] Stairs → `changeLevel`.** A transition stamp makes one region
  spanning the levels it joins, with a `changeLevel` behaviour: Foundry asks
  the token which level to take. Teleport stays for submaps, which cross
  scenes. `RegionDoc.behaviour` is a `teleport` / `changeLevel` union, and
  Priority 5 extends it. `tests/e2e/levels.spec.ts` proves it in Foundry.
  - **Still open:** restricting which movement actions trigger it [14.361],
    so stair stamps walk and ladders climb, with the pack schema saying
    which. In 14.359 the behaviour's schema is empty. Build this against a
    ≥14.361 reference release; the behaviour firing until the token leaves
    the region is also from 14.361.
- **[done] Floors → `defineSurface`** [14.353]. It gives a region a surface
  at its bottom, top or both that restricts light, movement, sight and sound
  and causes occlusion or exposure.
  - A room on a level with another below gets a floor: a flat region over
    the room at its level's base, on both levels (`RegionDoc.spans`), whose
    surface restricts everything and occludes. So the level below cannot be
    seen, heard, lit or walked through.
  - Foundry refreshes its surfaces when one comes into view, meaning a level
    it is on is viewed, so the e2e check in `tests/e2e/levels.spec.ts` views
    each level before `Scene#getSurfaces`.
  - **[done] Roof stamps and reveal.** A stamp's `surface` becomes a Define
    Surface region over its footprint, from its base up its physical height
    (its level's band when the height or the grid is unknown), at the
    bottom, top or both. `reveal` is Foundry's **Reveal Elevated Surface**
    [14.355] (`exposure` in the behaviour's data): roofs and balconies stay
    hidden from observers almost directly below.
  - **Still open: room ceilings.**
  - It pairs with the tile **SURFACE** occlusion mode (Priority 4).
- **[done] Per-level images.** A `Level` carries its `art`: the native
  Level's `background`, `foreground` and `fog` image paths. The levels panel
  sets each by typing a path or with Foundry's file picker, and a scene spec
  level entry sets them too. Art never re-syncs features: `planningLevels`
  leaves it out.
  - **Still open:** the rest of the Level's look. That is the background
    colour, the tints and alpha thresholds, `textures` (anchor, offset, fit,
    scale, rotation) and `visibility.levels`.
- **Level preloading** [14.364]. The levels panel can preload a level's
  images before the party climbs to it.
- **Buildings: interior scene or upper levels.** A building can open into a
  separate interior scene (submaps) or have its floors as Levels of the same
  scene. That is the GM's choice per building, so an enterable stamp offers
  both.
- **Tests and validation** use `Scene#getSurfaces` and
  `Scene#testSurfaceCollision` [14.355, 14.356] to check floors and walls.
  `Level#updateRegionShapeConstraints` [14.365] refreshes region constraints
  after a level edit.

### Priority 3: full wall and door options
- **[done] Senses, one-way walls and thresholds.**
  - Stamp occlusion walls take the whole `EDGE_SENSE_TYPES` range per sense
    (NONE, LIMITED, NORMAL, PROXIMITY, DISTANCE), movement on or off, `dir`,
    and `threshold` (light, sight and sound distances, and `attenuation`).
  - **Rooms** take a wall kind: Foundry's own Walls palette presets (solid,
    terrain, invisible, ethereal, window), mirrored exactly in
    `tools/wall-presets.ts`. It is set in the materials panel, named with
    Foundry's own strings, and in the scene spec (`wallKind`), and the
    floor-plan generator passes it on. A room's doors still block everything
    while shut.
  - **[done] Path walls** take a kind too, or none: a road or river's
    `walls` is a wall preset or null (a persisted `true`, the original
    format, is solid). The road and river panel picks it, with Foundry's
    names, and the scene spec's paths take a kind or a boolean.
- **[done] Door sounds and animation.** A door wall carries a `look`: a
  `CONFIG.Wall.doorSounds` key and an animation, each null for Foundry's
  default. These become the Wall's `doorSound` and `animation`.
  - Door stamps declare theirs in the pack schema, with the animation's
    type, direction, double, duration, flip and strength.
  - Room doors pick a sound and an animation type in the door panel, from
    Foundry's own lists, and the scene spec's room doors take both.
  - Still open: the animation `texture`. Door types and states are complete.
- **[done] No blank walls.** Foundry groups walls that block nothing as
  "Blank Walls" [14.361]. The engine never emits one. A stamp whose walls
  would block nothing gets none, and every room wall kind blocks something.

### Priority 4: tiles and lights
- **[done] Stamp tiles** take their pack's `tile`:
  - `alpha` and `hidden`;
  - `occlusion`: `modes` is a set of `CONST.OCCLUSION_MODES` [14.355]: FADE
    1, SURFACE 2, RADIAL 4, VISION 8. With `alpha`, it makes roofs and
    canopies give way to tokens beneath them;
  - `texture.alphaThreshold` [14.359];
  - `restrictions` (`light`, `weather`);
  - `video` (`loop`, `autoplay`, `volume`).
  Anything the pack leaves out stays undefined and takes Foundry's default.
- **[done] Lights** take:
  - `walls` and `vision`;
  - in `config`: `negative` (darkness sources), `priority`, `coloration`,
    `attenuation`, `luminosity`, `saturation`, `contrast` and `shadows`.
  - `coloration` maps to `AdaptiveLightingShader.SHADER_TECHNIQUES` ids. Those
    run 0–10, then 100 (Natural Attenuation) and 101 (Adaptive Attenuation)
    [14.349], so they are not an index into the list.
  - These come on top of dim, bright, colour, alpha, angle, rotation and
    animation.
  - **[done]** `hidden` (placed hidden from players) and the `darkness`
    range the light is active in (`config.darkness`, 0–1, min ≤ max; a lamp
    that lights only at night). Both are optional pack fields.
- **[done] Light switches that players click.** A switch is a stamp the engine
  treats as a door: its variants are its on and off states, and it has a
  native door wall that blocks nothing (every sense `none`, movement off).
  - **In play.** Players use Foundry's own door control. v14 lets a player
    change a door's state (`wall.mjs`), and it handles the `WALL_DOORS`
    permission, the pause, sound and visibility. The existing door-state
    hook runs on the active GM. It turns the switch to its matching variant
    and toggles every linked target in one atomic write. No socket.
  - **Targets.** A switch lists what it controls:
    - lamp stamps, switched to their lit or unlit variant, so the art,
      particles and sound follow;
    - a room's generated light;
    - plain AmbientLights, through their native `hidden` field.
  - **Linking.** The link tool, with the Lighting tools, picks a switch,
    then clicks targets to add or remove them, and draws link lines while
    it is active. Removing a target drops it from its switches, and undo
    and redo follow the usual rules. `tests/e2e/switches.spec.ts` and
    `pointer.spec.ts` prove it in Foundry.
  - **Still open:** scene-spec links, and a switch icon in place of
    Foundry's door icon (check whether v14 can show one for one wall).

### Priority 5: regions
- **Shapes beyond polygons** [14.349, 14.352, 14.356]:
  - rectangle, circle, ellipse, cone, ring, line, emanation and token;
  - **grid** (`GridShapeData`): an arbitrary set of grid cells.
  Shapes other than polygons can be grid-based. Rooms become rectangle shapes
  where they are rectangles, and terrain painted on the grid becomes exact
  grid cells.
- **Region fields**:
  - `color`;
  - `restriction` (a region acting as a barrier of type light, darkness,
    sight, sound or move) with its `priority`;
  - `hidden` [14.360]: GM-only, with behaviours off;
  - `highlightMode` (covered grid spaces) and `displayMeasurements`;
  - `ownership`;
  - `attachment.token`: a region that moves with a token [14.353, renamed
    14.356].
- **Region behaviours** on terrain regions and rooms. Generated today:
  `teleportToken` (submaps), `changeLevel` (stairs), `defineSurface` (room
  floors, roof stamps) and **[done] `modifyMovementCost`**: a stamp's
  `terrain` becomes a "<stamp> terrain" region over its footprint on its
  level, with the pack's cost per movement action (actions left out keep
  Foundry's 1). The roadmap's earlier name for it, `increaseMovementCost`,
  is not the v14 type key. Still to add:
  - difficult terrain on painted terrain and rooms;
  - `adjustDarknessLevel`, `suppressWeather` and `applyActiveEffect`;
  - `displayScrollingText`, `executeMacro`, `executeScript`, `pauseGame` and
    `toggleBehavior`.
- **Teleport options for submap entrances** [14.349, 14.353]:
  - destination placement: relative, centre, or unsnapped;
  - random or chosen destinations;
  - `avoidOccupied`;
  - a custom prompt, with `{scene}`, `{token}` and `{region}` placeholders
    [fixed in 14.365];
  - a **scene-transition animation** (one of 14 types) for going between
    scenes.
  The submap panel lets the GM pick the transition and write the prompt.
- **Spawn regions.** `RegionDocument#spawnTokens` and
  `TokenLayer#placeTokens` [14.352, 14.356] make it possible for a scene spec
  or generator to declare spawn regions: encounters and reinforcements.
- **Hazard presets.** Measured templates are gone [14.352], and areas of
  effect are regions now. Region presets (fire, gas, rubble) combine a shape
  with behaviours and fit the same model.

### Priority 6: sounds, particles and effects
- **Ambient sounds**, as stamp emitters (a generator's hum, a fountain), at
  the right elevation (Priority 1).
- **[done] Particle emitters.** Each emitter a stamp's variant declares
  (smoke, embers, sparks, dripping water) runs as v14's native
  `ParticleGenerator` [14.355] in effect mode, keeping its count alive
  (`manual: false`; effect mode otherwise spawns only on request).
  - `tools/particles.ts` plans them in scene terms: the spawn point or
    footprint box, speed in px per second, the stamp's rotation added to the
    angle, and elevation as the stamp's floor plus its own height.
  - Particles are per client, not documents, so `foundry/particles.ts` wraps
    the feature renderer: a drawn stamp starts its emitters, a changed one
    restarts them, a removed one stops them hard. Only emitters on the
    viewed level run; viewing another level redraws the canvas.
  - `tests/e2e/stamps.spec.ts` proves them in Foundry. The VFX module
    [14.356] is not used.
- **Canvas shake** (`CanvasShakeEffect` [14.355]) is for scripted moments
  such as explosions, not authored scene content. It is last: a region
  behaviour or macro could trigger it if a use appears.

### Priority 7: other documents, scene settings and assets
- **Notes** (map pins), with their `author` field [14.353], and
  **drawings**.
- **Scene settings:**
  - darkness, weather and environment;
  - fog of war, including the exploration mode:
    `CONST.FOG_EXPLORATION_MODES` DISABLED, INDIVIDUAL or SHARED [14.353];
  - the scene's transition animation [14.352].
  The scene spec can set them, matching the scene config's Basics and Levels
  tabs.
- **Compressed textures.** Tiles and backgrounds accept KTX2 and Basis files
  [14.362]. Asset packs can ship GPU-compressed art for large stamp sets, and
  the pack schema and loader accept those extensions.

### Priority 8: RGBA mask texture painting
Terrain today is polygons and brush strokes, each one biome with a
feathered edge. The operator asked for texture painting with an **RGBA mask
option**: a splat map, as in Dungeondraft and Inkarnate.
- **Mask.** A painted mask image whose four channels each weight one texture
  from the active set, blended per pixel. Soft, pressure-free brushes paint
  into one channel and take from the others, giving hand-painted edges no
  polygon can.
- **Scene and texture set.** The mask covers a scene area at a chosen
  resolution. A texture set assigns a texture role to each channel, and
  several masks can layer for more than four textures.
- **Persistence.** The mask is image data, not geometry, so it is stored as
  a file in the world's data rather than inlined in the scene flag. The
  scene flag keeps its path, bounds, channel roles and level.
- **Rendering.** The overlay draws the blend (a PIXI shader over the four
  textures). A GM can bake it to a native Tile or into a Level background,
  so it renders without the module.
- **Everything else as today.** Undo, levels, the scene spec (a mask can be
  given as a file path) and the e2e suite all apply.

---

## Stamp pack schema — the contract

The engine owns a **versioned schema** for asset packs, defined once in zod in
`src/stamps/schema.ts`. Everything derives from that file: the engine's types
(`z.infer`), its runtime validation (`parseStampPack`), and the **published JSON
Schema** at `schema/stamp-pack.v1.schema.json`. The JSON Schema is generated by
`pnpm schema:gen` and checked by `schema:check` in the gate. Node loads the
schema modules directly via type stripping, so they import only `zod` and
dependency-free leaf modules (`gen-schema.mjs` resolves their extensionless
imports).

- **Pack discovery:** an asset module ships one manifest, `zephyrex-pack.json`,
  at its root and advertises it with `flags["zephyrex-cartography"].pack` in its
  `module.json`. Any module can therefore be a pack. Paths inside the manifest
  are relative to that module's root.
- **Validation:** the manifest sets `"$schema"` to the public raw-GitHub URL of the
  JSON Schema (both repos are public) and `"schemaVersion": 1`. Packs validate
  against that URL at authoring time. The engine validates again at load and
  reports invalid packs instead of silently dropping them. Stamp-id uniqueness
  is checked in code, because JSON Schema can't express it.
- **Contents per stamp:**
  - identity, category, tags, scale band, perspective;
  - **variants**: a free-text state label, an image, and a pixel size at the
    pack's `referenceGridSize`;
  - `physical`: height in grid units, cover 0–1, blocksMovement;
  - `occlusion`: none, bounds or alpha, plus how the walls restrict each
    sense (on, off, or `limited`, `proximity`, `distance`), a one-way
    `direction`, and a `threshold`;
  - `light`: radii, colour, animation, darkness sources (`negative`),
    priority, colouration technique, luminosity, attenuation, saturation,
    contrast, shadows, whether it is walled and gives vision, the darkness
    range it is active in, and whether it is placed hidden;
  - `door`: type, `animation` (ascend, descend, slide, swing, swivel) and a
    Foundry door `sound`;
  - `transition`: stairs, ladder, lift or hatch; up, down or both; and the
    movement actions that use it;
  - `enterable` (submap-capable);
  - `container`: `true`, or Item Piles pile options (type, starting closed or
    locked, distance, sounds, and which variant shows each pile state);
  - `particles`: native particle emitters (textures, spawn area, count,
    lifetime, velocity, alpha, scale, fade, blend);
  - `sound`: an ambient sound emitter;
  - `tile`: alpha, hidden, combinable occlusion modes (fade, surface, radial,
    vision), alpha threshold, light and weather restrictions, video;
  - `surface`: a Define Surface floor or roof over the footprint, optionally
    revealed;
  - `terrain`: a movement-cost multiplier per movement action.
- **Variant overrides.** Structural properties sit on the stamp, and a
  **variant may override them**. `null` removes a property for that variant:
  `light: null` for an unlit variant, `particles` only on a "destroyed" one,
  `terrain` only when rubble, `container: false` for a smashed crate.
  `doorState` marks open or closed, and `physical` merges field by field.
- **Assets.** Every asset path (images, particle textures, sounds) is
  relative to the pack module and resolved to its served URL at load; an
  absolute URL passes through.
- **Texture sets.** The manifest also carries texture sets: role → image
  path, licence, credits.
- **Engine support, by field.**
  - Realised: identity through `enterable`, occlusion sense levels,
    `direction` and `threshold`, and `container` pile options (type, state,
    distance, inspection, sounds). A variant's `container` override is
    followed too: switching to a variant that is not a container removes the
    pile, and switching back (or undoing) makes a fresh one. `sound` becomes
    a native AmbientSound ("<stamp> sound") at its offset, on the stamp's
    level, removed by a variant with `sound: null`. `tile`, the new light
    and door fields, `surface` and `terrain` are realised too (see their
    priorities).
  - Particles run as native particle generators (Priority 6).
  - Not yet realised: transition movement, and pile `states`. The engine takes each one up as its roadmap priority lands.
    Packs may author them now; they are validated and snapshotted on placed
    stamps, so they take effect as soon as that priority ships.
- **Evolution:** v1 changes are **additive only**. A breaking change becomes a new
  version with its own schema file, and the parser keeps reading supported
  older versions.

---

## Terrain / biomes

`BiomeKind` is the terrain enum. Water and ocean have no land texture role:
they render translucent, in a water texture from the set or a procedural
ripple. Every other biome is a tiled texture, or procedural grain in its
colour.

**Adding or renaming a biome requires lockstep updates**, or the build breaks /
tests fail: `tools/biome.ts` (`BiomeKind`, `BIOMES`, `BIOME_STYLES`) →
`tools/texture.ts` (`BIOME_TEXTURE`, `BIOME_TINT`) → `i18n.ts`
(`BIOME_TITLE_KEYS`) + `static/lang/en.json`. The paint panel offers every
biome from `BIOMES` with no further change.
`region.test.ts`, `texture.test.ts` and `i18n.test.ts` enforce it. A new biome's
texture *role* (its name) should be added to the packs' texture sets. A set
lacking a role renders that terrain as flat colour.

---

## Textures and asset packs

This repo bundles **no art**. Terrain textures are **texture sets** inside asset
packs (the `textureSets` of the pack manifest: role → image path, licence,
credits). The GM picks one set with the world `textureSet` setting, whose choices
fill in once packs load; an unset or uninstalled choice means the first loaded
set. The renderer resolves each biome/path **role** through the active set.
The stamp engine's own packs, `zephyrex-cartography-assets` (CC0 Poly Haven and
ambientCG sets), own the fetch script and credits.

- **Licence verified before bundling — never assumed** (in whichever pack ships it).
- Assets are **static module files referenced by runtime URL**, never
  `import`ed into TS (that would inline them into the size-limited bundle).

---

## Foundry packaging

- **Targets v14 only** (`module.json` minimum and verified 14). Build on v14
  APIs directly (native Levels, multi-destination teleports, per-level walls);
  never add a fallback or version branch for v13 or earlier.
- `module.json` (id `zephyrex-cartography`):
  `esmodules`→`dist/zephyrex-cartography.js`, `styles`→`dist/zephyrex-cartography.css`,
  `languages`→`dist/lang/en.json`.
- Vite lib build → `dist/` (`src/static/` copied verbatim).
- Foundry runtime globals (`game`, `Hooks`, `foundry`, `canvas`, `CONFIG`,
  `PIXI`) come from the host page. They are referenced as globals and never imported.
