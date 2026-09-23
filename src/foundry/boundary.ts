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

/*
 * FoundryScene mirrors three members of the live `Scene` document, so they are
 * declared as METHODS rather than function properties on purpose: Foundry's
 * getFlag / setFlag / createEmbeddedDocuments are constrained generic *methods*,
 * and only method (bivariant) parameter checking lets the real document be
 * asserted into this minimal, precisely-typed surface. Property (strict,
 * contravariant) signatures break that bridge (the scope generics stop
 * overlapping). Hence the scoped method-signature-style exception.
 */
/* eslint-disable @typescript-eslint/method-signature-style -- bivariant method signatures are required to bridge the live Foundry Scene document; see the note above */
export interface FoundryScene {
    // eslint-disable-next-line no-restricted-syntax -- boundary: a Foundry flag value is arbitrary serialised JSON; getFlag returns unknown by contract and is narrowed at the parse boundary
    getFlag(scope: string, key: string): unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: setFlag accepts an arbitrary serialisable flag value, exactly as the live Foundry Scene API does
    setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
    createEmbeddedDocuments(embeddedName: 'Wall', data: readonly WallCreateData[]): Promise<unknown>;
    deleteEmbeddedDocuments(embeddedName: 'Wall', ids: readonly string[]): Promise<unknown>;
}
/* eslint-enable @typescript-eslint/method-signature-style */
