# Zephyrex Cartography — Draw — Contributor & Agent Protocol

`dh-cartography-draw` is an **AGPL** Foundry VTT v13+ module for in-Foundry map
painting: drawing roads, rivers, and paths as editable splines, and painting
biome/terrain regions — the open-source re-implementation of the best
**non-stamp** cartography features of **FA-Nexus** and **MapForge** plus the
**landscaping** featureset of **Inkarnate**. It is the AGPL companion to the
`dh-cartography` asset library.

This file is authoritative for this repo. It stacks on top of the workspace
`../CLAUDE.md` and the user-level engineering tenets; where this file is more
specific, it wins. Read it before your first edit.

---

## ⛔ TOP RULES — non-negotiable

1. **Full gates, no shortcuts. Fresh code goes to ZERO — never baseline a
   problem in new code.** Every lint warning, type error, and coverage gap in
   code we write is fixed at the source, not recorded as an accepted floor. The
   ratchets exist to lock a *clean* state in as a hard gate, not to warehouse
   debt. If a rule legitimately does not apply (a genuine framework/parse
   boundary), use a **documented, point-of-use** exception — never a blanket
   disable, file override, or baseline. (This rule exists because baselining 30
   warnings in a greenfield repo was attempted and rejected.)
2. **Match foundry-system's quality bar exactly.** Its patterns are the
   reference: graduate-at-zero ratchets, `require-await`/`promise-function-async`
   idioms, point-of-use `eslint-disable … -- <rationale>` for real boundaries.
   Mirror it; do not invent a looser standard.
3. **Architecture / dependency / asset-sourcing decisions are the operator's.**
   Where a service/tool/asset comes from, what gets installed, and how the build
   is structured are not the agent's to decide unilaterally. Surface the specific
   decision and ask. (Texture-pack *sourcing* was such a decision — see Textures.)
4. **AGPL-3.0-or-later. SPDX header on every source file:**
   `// SPDX-License-Identifier: AGPL-3.0-or-later`. Every bundled dependency and
   asset must be licence-compatible (see Textures).
5. **Commit only when the operator asks. Work on `main`, never branch.** Stage
   explicit pathspecs, `git add <paths> && git commit` in one breath. Never
   `--no-verify`.
6. **Never invent lore/assets/licences.** Verify a texture's licence *before*
   bundling it; verify a fact before asserting it. An empty query result is
   suspect (a broken query), not proof of absence — re-check before concluding.

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
- **deps:ratchet** — dependency-cruiser layering (`geometry → tools → canvas`; `foundry`/entry may import inward)
- **lockfile:validate** — lockfile resolves only to trusted hosts
- **build** (Vite lib) + **size-limit** (JS bundle only)

CI (`.github/workflows/ci.yml`) runs `pnpm gate` then `git diff --exit-code` — a
ratchet that had to mutate a baseline means the gate was not run locally, and
fails the build. Ratchet run-report JSONs (`.ts-coverage.json`,
`.strict-coverage.json`, `.test-typecheck-coverage.json`) are gitignored; the
`.*-baseline` files are the committed source of truth.

**Package manager: `~/.local/bin/pnpm`** (corepack pnpm is broken on this box).

---

## Architecture — hexagonal, pure core + thin boundary

- **Pure, unit-tested core** — `src/geometry/`, `src/tools/`, `src/canvas/`
  (controller, renderer). No PIXI/Foundry imports. Every non-trivial pure unit
  has a test; this core carries the 100% type-coverage. Rendering and
  persistence are injected as interfaces (`DrawSurface`, `SceneStore`,
  `WallEmitter`) so the whole flow is tested with fakes.
- **Thin Foundry/PIXI boundary** — `src/foundry/*` and the entry
  `src/cartography-draw.ts`. The *only* code that touches PIXI/Foundry globals
  (`canvas`, `Hooks`, `game`, `PIXI`, scene controls). Kept minimal and is **not
  unit-tested** by design. Bridge over-strict library types here with
  point-of-use documented casts, e.g.:
  - `unknown` at a real parse/framework boundary (scene-flag JSON, `Scene#getFlag`
    return, a type-guard's input) → `// eslint-disable-next-line no-restricted-syntax -- boundary: …`.
  - `FoundryScene` mirrors `Scene`'s **methods** (not function properties) so the
    live document is structurally assignable — a scoped `method-signature-style`
    exception, documented in `foundry/boundary.ts`.
  - fvtt-types over-constrains some signatures (e.g. `getFlag`'s scope generic);
    a single documented `no-unnecessary-type-assertion` disable at the seam is
    correct — tsc, not the lint rule, is the source of truth on necessity.
- **Persistence**: features live on the scene as a flag
  (`dh-cartography-draw.features`), a mixed path+region blob. Parsing is
  **defensive and total** — `parseFeatures`/`parsePath`/`parseRegion` validate
  shape and drop malformed entries, never throw. **No silent data loss**;
  parsing stays backward-compatible as the model grows (new fields are optional
  with defaults).

---

## Feature scope

All of the following are in scope (the mandate is the full non-stamp featureset
of FA-Nexus + MapForge + Inkarnate landscaping — **no stamp/asset-placement
features**):

**Implemented:** click + freehand path drawing (Catmull-Rom smoothing, RDP
simplify); variable-width ribbon geometry with arc-length UVs; river end
tapering; biome/terrain regions (13 terrains) as smoothed closed fills; **tiled
terrain textures** from **multiple bundled CC0 packs** (Poly Haven, ambientCG),
GM-selectable via a world setting, with per-biome recolour tint; **freehand
brush painting** (drag a biome tool to paint a terrain swath / stroke; click for
a region vertex); **feathered region & terrain edges** (soft coastline blend);
**control-point editing** (drag to move, right-click to delete, edit tool with
live preview); wall emission along path centrelines; eraser (top-most hit);
undo/redo; z-order (front/back/raise/lower); hit-testing.

**Roadmap:** per-point width + vertex insertion; directional river taper;
coastline foam; more palettes; elevation/Levels awareness (ties to the vault's
`maps:` interior-floor model); emitting Foundry **Scene Regions**
(difficult-terrain) from biomes.

---

## Structure mapping — Foundry-native (phased)

Room-first structure authoring (Dungeondraft-style): draw a room, its floor and
its **native Foundry** walls/doors/lights follow. The decisive rule: **walls,
doors, and lights are native Foundry documents** (`WallDocument`,
`AmbientLightDocument`) generated from rooms — the plugin does **not** own a
parallel wall/light model. Foundry owns vision, movement, door controls, and
lighting; the plugin only creates/updates/deletes those documents.

**Lifecycle (critical):** a room tracks the ids of the Foundry documents it
generated (`wallIds`, `lightIds`, …) in its scene-flag record, so create /
update / delete stay idempotent — editing or removing a room re-syncs *its* docs
and never orphans them or touches hand-placed ones. Every generated-document
feature must follow this track-ids-then-reconcile pattern.

- **Phase 1 — floors + walls [done].** Square-grid snapping (`geometry/snap.ts`);
  `RoomFeature` (grid-snapped floor, crisp edge); `geometry/wall.ts`
  perimeter→segments; rooms emit native `WallDocument`s on commit and delete them
  on removal, ids tracked on the room.
- **Phase 2 — wall re-sync on edit [done].** Moving/deleting a room vertex
  deletes the old walls and re-emits from the new perimeter (`replaceFeature`).
- **Phase 3 — doors [done].** A door tool marks a room's wall segment as a
  Foundry door (`WallDocument.door`); door segment indices persist on the room
  and survive re-emission. Foundry renders the door control + open/close state.
- **Phase 4 — auto lighting [done].** Each room emits a native
  `AmbientLightDocument` at its centroid (Foundry lighting picks it up
  automatically); its id is tracked and re-synced with the room's lifecycle.

Follow-ups (not yet): shared-wall dedup between adjacent rooms (one wall,
per-side textures); room-in-room nesting; per-door type/state UI; wall/floor
material selection beyond the biome set; undo/redo of generated Foundry docs
(undo currently restores the drawing model, not the emitted documents).

---

## Terrain / biomes

`BiomeKind` is the terrain enum. Water, ocean, and **river are untextured** —
they render as a translucent tint (water reads as a shader/blend, not a tiled
photo). Every other biome is a tiled texture.

**Adding or renaming a biome requires lockstep updates**, or the build breaks /
tests fail:
`tools/region.ts` (`BiomeKind`, `BIOMES`, `BIOME_STYLES`) →
`tools/texture.ts` (`BIOME_TEXTURE`, `BIOME_TINT`) →
`cartography-draw.ts` (`BIOME_ICONS`, `BIOME_TITLES`, both `Record<BiomeKind,…>`).
`region.test.ts` and `texture.test.ts` assert every biome has a style/texture
entry — keep them passing. Textures for a new biome must be added to every pack.

---

## Textures — bundled FOSS packs

Terrain tiles are **bundled FOSS packs**, under `assets/textures/<pack>/<key>.jpg`,
so the module is self-contained. Requirements:

- **Licence must be verified before bundling — never assumed.** Only
  CC0 / CC-BY / CC-BY-SA (AGPL-compatible) sources whose terms **explicitly
  permit redistribution/bundling**. Verified sources: **Poly Haven** (CC0 1.0)
  and **ambientCG** (CC0 1.0 — "include the raw files in your project"). Read the
  actual licence page; the API may not expose a licence field.
- **Cite every asset.** Each pack carries a generated `CREDITS.md` (file → source
  asset id → author(s) → source URL → licence). Attribution is a courtesy under
  CC0, but we always provide it for provenance.
- **Multiple packs, so the GM has options**, selectable at runtime. Keep the file
  naming identical across packs (`<key>.jpg`) so only the pack subdir changes.
- **Reproducible.** `scripts/fetch-textures.mjs` (run via `pnpm assets:textures`)
  downloads every pack from the `assets/textures/PACKS.json` manifest and
  regenerates each `CREDITS.md`. It is the maintained loader — keep it working.
- **Textures are static module files referenced by runtime URL**
  (`modules/dh-cartography-draw/assets/textures/<pack>/<file>`), **never
  `import`ed** into TS — that would inline them into the size-limited JS bundle.
- The vault's "hotlink Kanka `image_full`, never download" rule is about **Kanka
  map images**, not these bundled terrain tiles. These are ours to ship.
- Diffuse/Color map only, 1k, JPG. Water/ocean/river get no texture.

---

## Foundry packaging

- `module.json` (id `dh-cartography-draw`, min v13 / verified v14) points
  `esmodules`→`dist/cartography-draw.js`, `styles`→`dist/cartography-draw.css`.
- Vite lib build → `dist/`. Static `assets/` ship in the module dir and are
  served by Foundry at `modules/<id>/…`.
- Foundry runtime globals (`game`, `Hooks`, `foundry`, `canvas`, `CONFIG`,
  `PIXI`) are provided by the host page — referenced as globals, never imported,
  never externalised.
