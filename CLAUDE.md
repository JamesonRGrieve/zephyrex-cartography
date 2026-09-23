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

**Stamp engine [in progress]** — migrated from the former asset module:
- **Pack schema** (versioned, owned here — see below) that every asset pack's
  stamp catalog must validate against.
- Placement as native `TileDocument`s, variant cycling, browser UI, optional
  Item Piles containers.
- **Occlusion walls:** a placed stamp is wrapped in native walls per its
  schema (bounding box, then alpha-silhouette trace).
- **Light emitters:** stamps declaring `light` emit a native light that follows
  the stamp's variant (lit/unlit).
- **Doors and transitions:** door stamps drive `WallDocument.door`; stair or
  ladder stamps create level transitions.

**Levels [next]:** Foundry **v13-native Scene Regions + elevation bands** (no
Levels module). Rooms/structures carry an elevation band; stairs are Regions
that move a token between bands.

**Submaps [next]:** clicking an enterable stamp (a building, a hab) either
creates a new interior scene or **links an existing one**. Both directions get
auto-built transition regions, tracked per the lifecycle rule.

Follow-ups: shared-wall dedup between adjacent rooms; room nesting; per-door
type/state UI; floor/wall materials beyond biomes; undo/redo of generated
documents; per-point path width; Scene Regions from biomes.

---

## Stamp pack schema — the contract

The engine owns a **versioned schema** for asset packs. It is the single source
of truth: runtime types and validation derive from it, and a published JSON
Schema lets pack repos validate at authoring time. A pack declares its
`schemaVersion`. The engine accepts supported versions and reports invalid
stamps rather than silently dropping them. The schema covers, per stamp:
identity/category/tags/scale/perspective; **variants** (state name, image,
pixel size at the pack's reference grid); physical **height** and **cover**;
**occlusion** (wall mode + which senses it blocks); **light** emission; **door**
behaviour; **transitions** (stairs/ladders between levels); **enterable**
(submap-capable). Structural properties sit on the stamp and can be
**overridden per variant** (an unlit torch emits no light; a broken door stops
blocking). Changing the schema means bumping its version and keeping the parser
able to read supported older versions.

---

## Terrain / biomes

`BiomeKind` is the terrain enum. Water, ocean, and **river are untextured** —
they render as a translucent tint. Every other biome is a tiled texture.

**Adding or renaming a biome requires lockstep updates**, or the build breaks /
tests fail: `tools/region.ts` (`BiomeKind`, `BIOMES`, `BIOME_STYLES`) →
`tools/texture.ts` (`BIOME_TEXTURE`, `BIOME_TINT`) → `i18n.ts`
(`BIOME_TITLE_KEYS`) + `static/lang/en.json` → the entry (`BIOME_ICONS`).
`region.test.ts`, `texture.test.ts` and `i18n.test.ts` enforce it. Textures for a
new biome must be added to every texture pack.

---

## Textures and asset packs

Terrain textures are FOSS packs (verified CC0: **Poly Haven**, **ambientCG**),
selectable at runtime by world setting, with identical `<key>.jpg` naming across
packs. **They are moving to `zephyrex-cartography-assets`** with the stamps; the
engine resolves them from the asset module at runtime.

- **Licence verified before bundling — never assumed.** Only sources whose
  terms explicitly permit redistribution. Read the actual licence page.
- **Cite every asset** (generated per-pack `CREDITS.md`).
- **Reproducible** via the pack's fetch script from its manifest.
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
