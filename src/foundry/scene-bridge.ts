// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The single place a live Foundry `Scene` is viewed as the narrow
 * {@link FoundryScene} the boundary needs. A `Scene` structurally provides
 * everything FoundryScene declares, so the pure store and document code never
 * depends on fvtt-types' flag and embedded-document generics.
 */
import type { FoundryScene } from './boundary';

function asFoundryScene(scene: Scene.Implementation | null | undefined): FoundryScene | null {
    // fvtt-types over-constrains Scene's flag + embedded-document methods, so tsc requires this assertion to view the
    // live scene as our looser FoundryScene boundary. Runtime-safe; the single irreducible framework-boundary bridge.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- see note above; the rule mis-reports it as unnecessary
    return scene ? (scene as FoundryScene) : null; // type-coverage:ignore-line
}

/** The scene on the canvas. */
export function activeScene(): FoundryScene | null {
    return asFoundryScene(canvas?.scene);
}

/** Any scene in the world, by id. */
export function worldScene(id: string): FoundryScene | null {
    return asFoundryScene(game.scenes?.get(id));
}
