// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The single place a live Foundry `Scene` is viewed as the narrow
 * {@link FoundryScene} the boundary needs. A `Scene` structurally provides
 * everything FoundryScene declares, so the pure store and document code never
 * depends on fvtt-types' flag and embedded-document generics.
 */
import type { BatchOperation, FoundryScene, ModifyBatch } from './boundary';

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

// eslint-disable-next-line no-restricted-syntax -- boundary: fvtt-types declares modifyBatch over the backend's fully-processed operation shape (modifiedTime, deleteAll, …), which no caller supplies — its own doc example would not typecheck — so the function is taken as unknown and narrowed
function isModifyBatch(value: unknown): value is ModifyBatch {
    return typeof value === 'function';
}

/**
 * `foundry.documents.modifyBatch` over our narrow scene operations: one
 * transaction, all of it or none. Foundry reports a rejected batch only by
 * resolving to no results (the server's error is swallowed), so that is
 * thrown here: a caller must never believe a write landed that did not.
 */
export async function modifyBatch(operations: readonly BatchOperation[]): Promise<void> {
    const batch = foundry.documents.modifyBatch;
    if (!isModifyBatch(batch)) {
        throw new Error('foundry.documents.modifyBatch is unavailable');
    }
    const results = await batch([...operations]);
    if (operations.length > 0 && Array.isArray(results) && results.length === 0) {
        throw new Error(`Foundry rejected a batch of ${String(operations.length)} scene document operations`);
    }
}

/** Any scene in the world, by id. */
export function worldScene(id: string): FoundryScene | null {
    return asFoundryScene(game.scenes?.get(id));
}
