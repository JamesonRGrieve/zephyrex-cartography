# Zephyrex Cartography — Draw (`dh-cartography-draw`)

In-Foundry map painting for Foundry VTT v13+: draw **roads, rivers, and paths**
as editable splines with width, texture, and optional generated walls. The
open, AGPL answer to the paid path/paint tools (FA-Nexus, MapForge).

Companion to the **Zephyrex Cartography** asset library (`dh-cartography`, the
stamp-tile browser); this module owns the *interactive drawing* surface.

> **Status — v0.1.0 scaffold.** The strict-TypeScript foundation, the pure
> geometry core (freehand simplify → Catmull-Rom → offset ribbon), and the full
> code-quality gate suite are in place and green. The Foundry canvas layer +
> path tool that turn a click/freehand stream into a rendered textured ribbon
> are the next stage.

## Quality bar

Mirrors the `wh40k-rpg` system's bar (`foundry-system`), scoped to the universal
code-quality gates — every one green today, run by `pnpm check` and pre-commit:

`eslint` (strong type-aware config) · `biome` · `prettier` · `stylelint` ·
`tsc --noEmit` (all strict flags: `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, …) · test typecheck · `vitest` ·
`type-coverage --strict` · `knip` · `dependency-cruiser` (layer rules) ·
`size-limit`.

Staged next: the auto-flipping ratchet wrappers (`lint:ratchet`, `strict:ratchet`,
`type-coverage:ratchet`, `knip:ratchet`, `deps:ratchet`, `symmetry:ratchet`,
`unconsumed:ratchet`, `important:ratchet`, `lockfile:validate`), i18n typed-key
codegen, the parallel husky fan-out, and CI. System-content gates (compendium
packs, per-system Tailwind theming, icon/hook audits) are N/A for a canvas
plugin and are added if that surface ever appears.

AGPL-3.0-or-later; SPDX header on every source file.

## Architecture

Layered inner → outer; inner layers never import outer ones (enforced by
`dependency-cruiser`):

```
geometry/  pure 2D math (spline, simplify, offset ribbon) — unit-tested
tools/     path/paint state, Foundry-agnostic
canvas/    the Foundry v14 InteractionLayer + rendering (PIXI)
cartography-draw.ts   entry: registers the layer + scene-control tools
```

## Develop

```bash
pnpm install     # pnpm 11 (see packageManager); allowlisted git build for fvtt-types
pnpm check       # the full green gate aggregate
pnpm build       # Vite → dist/cartography-draw.{js,css}
pnpm test        # Vitest
pnpm test:e2e    # Playwright vs real Foundry (opt-in; staged)
```

## Roadmap

1. **Path tool** — spline ribbon rendering (per-point width, feathered edges,
   texture along path), editable control points, optional walls along centerline.
2. **Texture painting** — brush → RenderTexture, blend modes, height-map masking.
3. **Flatten & export** — render the layer to a background image.
