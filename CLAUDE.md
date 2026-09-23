# Zephyrex Cartography — Contributor & Agent Protocol

`zephyrex-cartography` is an **AGPL** Foundry VTT v13+ module: a **standalone
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
- **vitest** (`pnpm test`) — the full suite, green
- **type-coverage** `--strict` — **locked at 100%** (`type-coverage:ratchet`); fix `any`/casts at the source (prefer a type guard over `as`), never lower the floor to pass
- **lint:ratchet** — 0 warnings; ~94 rules graduated to hard error
- **ts:ratchet** — `any` / `as any` / `@ts-expect-error` / `@ts-ignore` counts at 0
- **knip:ratchet** — no unused files/exports/deps (13 strict categories at 0)
- **deps:ratchet** — dependency-cruiser layering (see Architecture)
- **lockfile:validate** — lockfile resolves only to trusted hosts
- **build** (Vite lib) + **size-limit** (JS bundle only)
- **build-storybook**: the stories and their config must build

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
- A `*.stories.test.ts` mounts every story under vitest, so stories cannot
  rot. `pnpm storybook` runs the dev server; `pnpm build-storybook` is in the
  gate.
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
  both) generate paired teleport Scene Regions between adjacent levels. Each end
  sits on its level's band and teleports to the other.
- **v14.** Levels *are* the scene's native Level documents. Walls, tiles,
  lights and regions get `levels`, so vision is per floor, and teleports use
  `destinations`, `placement: relative` and a choice between two ends.
- **v13.** Levels live in a scene flag. Tiles, lights and regions still take
  the band's elevation, but walls apply on every level (v13 has no per-level
  walls), and a teleport takes its first destination only.

**Submaps [done]:** an enterable stamp (a building, a hab) gets an "Interior"
button on its Tile HUD. The GM either creates a new interior scene (gridded like
the current one) or **links an existing one**, imported scenes included.

- **Regions.** The link fixes both region ids up front, so each teleport can
  name the other across scenes. The entrance sits over the stamp; the exit is
  one square at the interior's centre, for the GM to move.
- **Lifecycle.** The entrance follows the stamp (moves keep its id). The exit
  is deleted with the stamp or on unlink; the interior scene itself is always
  kept.
- **v14.** An exit in a multi-level interior sits on that scene's initial
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

Follow-ups: room nesting; floor/wall materials beyond biomes.

**Generative map builder [intent — last]:** build real maps
*declaratively* with this module's own tools, not by generating images. A
generator emits a scene spec (terrain regions, paths, rooms, doors, stamps,
levels, submaps) and it is realised through the same controller API a human
uses. It comes after everything above. To keep the door open now:

- **Declarative-first rule:** every tool's effect must be expressible as data
  (a feature or stamp-placement spec) and applied through the pure controller
  API. No behaviour may exist only in pointer/UI handlers. Handlers translate
  input into specs; they never own logic. New features must be committable from
  a spec in a test, with no pointer events involved.

---

## Stamp pack schema — the contract

The engine owns a **versioned schema** for asset packs, defined once in zod in
`src/stamps/schema.ts`. Everything derives from that file: the engine's types
(`z.infer`), its runtime validation (`parseStampPack`), and the **published JSON
Schema** at `schema/stamp-pack.v1.schema.json`. The JSON Schema is generated by
`pnpm schema:gen` and checked by `schema:check` in the gate. The schema module
imports only `zod` so Node can load it directly via type stripping.

- **Pack discovery:** an asset module ships one manifest, `zephyrex-pack.json`,
  at its root and advertises it with `flags["zephyrex-cartography"].pack` in its
  `module.json`. Any module can therefore be a pack. Paths inside the manifest
  are relative to that module's root.
- **Validation:** the manifest sets `"$schema"` to the public raw-GitHub URL of the
  JSON Schema (both repos are public) and `"schemaVersion": 1`. Packs validate
  against that URL at authoring time. The engine validates again at load and
  reports invalid packs instead of silently dropping them. Stamp-id uniqueness
  is checked in code, because JSON Schema can't express it.
- **Contents:** per stamp: identity, category, tags, scale band, perspective;
  **variants** (free-text state label, image, pixel size at the pack's
  `referenceGridSize`); `physical` (height in grid units, cover 0–1,
  blocksMovement); `occlusion` (none / bounds / alpha, plus which senses the
  walls block); `light`; `door`; `transition` (stairs, ladder, lift or hatch,
  up/down/both); `enterable` (submap-capable); `container`. Structural
  properties sit on the stamp, and a **variant may override them**:
  `light: null` for an unlit variant, `doorState` for open/closed, and
  `occlusion`/`physical` overrides. The manifest also carries **texture
  sets** (role → image path, licence, credits).
- **Evolution:** v1 changes are **additive only**. A breaking change becomes a new
  version with its own schema file, and the parser keeps reading supported
  older versions.

---

## Terrain / biomes

`BiomeKind` is the terrain enum. Water, ocean, and **river are untextured** —
they render as a translucent tint. Every other biome is a tiled texture.

**Adding or renaming a biome requires lockstep updates**, or the build breaks /
tests fail: `tools/region.ts` (`BiomeKind`, `BIOMES`, `BIOME_STYLES`) →
`tools/texture.ts` (`BIOME_TEXTURE`, `BIOME_TINT`) → `i18n.ts`
(`BIOME_TITLE_KEYS`) + `static/lang/en.json` → the entry (`BIOME_ICONS`).
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

- `module.json` (id `zephyrex-cartography`, min v13 / verified v14):
  `esmodules`→`dist/zephyrex-cartography.js`, `styles`→`dist/zephyrex-cartography.css`,
  `languages`→`dist/lang/en.json`.
- Vite lib build → `dist/` (`src/static/` copied verbatim).
- Foundry runtime globals (`game`, `Hooks`, `foundry`, `canvas`, `CONFIG`,
  `PIXI`) come from the host page. They are referenced as globals and never imported.
