// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The minimal Foundry surface the boundary implementations depend on. A real
 * Foundry `Scene` satisfies {@link FoundryScene} structurally; the entry seam is
 * the single place that adapts the live document to this shape.
 */
export interface WallCreateData {
    /** Wall endpoints as `[x0, y0, x1, y1]` in scene pixels. */
    readonly c: readonly number[];
}

export interface FoundryScene {
    getFlag(scope: string, key: string): unknown;
    setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
    createEmbeddedDocuments(embeddedName: 'Wall', data: readonly WallCreateData[]): Promise<unknown>;
}
