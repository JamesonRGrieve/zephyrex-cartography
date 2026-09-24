// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The minimal Foundry surface the boundary implementations depend on. A real
 * Foundry `Scene` satisfies {@link FoundryScene} structurally; the entry seam is
 * the single place that adapts the live document to this shape.
 */

/** Native Level membership (absent means every level). */
interface OnLevels {
    readonly levels?: readonly string[];
}

export interface WallCreateData extends OnLevels {
    /** Wall endpoints as `[x0, y0, x1, y1]` in scene pixels. */
    readonly c: readonly number[];
    readonly door: number;
    readonly ds: number;
    readonly sight: number;
    readonly light: number;
    readonly sound: number;
    readonly move: number;
    /** `CONST.EDGE_DIRECTIONS`; absent restricts from both sides. */
    readonly dir?: number;
    /** Proximity and distance sense thresholds in scene distance units; null is unbounded. */
    readonly threshold?: { readonly light: number | null; readonly sight: number | null; readonly sound: number | null; readonly attenuation: boolean };
}

export interface LightCreateData extends OnLevels {
    readonly name: string;
    readonly x: number;
    readonly y: number;
    readonly elevation: number;
    readonly rotation: number;
    readonly config: {
        readonly dim: number;
        readonly bright: number;
        readonly color?: string;
        readonly alpha?: number;
        readonly angle?: number;
        readonly animation?: { readonly type: string; readonly speed?: number; readonly intensity?: number };
    };
}

export interface TileCreateData extends OnLevels {
    readonly name: string;
    /** The anchor is the point `x`, `y` names and the tile rotates about. */
    readonly texture: { readonly src: string; readonly anchorX: number; readonly anchorY: number };
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly rotation: number;
    readonly elevation: number;
    readonly flags: Readonly<Record<string, { readonly featureId: string }>>;
}

export interface SoundCreateData extends OnLevels {
    readonly name: string;
    readonly x: number;
    readonly y: number;
    readonly elevation: number;
    /** Scene distance units. */
    readonly radius: number;
    readonly path: string;
    readonly volume: number;
    readonly repeat: boolean;
    readonly walls: boolean;
    readonly easing: boolean;
}

interface TileUpdateData extends TileCreateData {
    readonly _id: string;
}

/** Teleport destinations (region UUIDs), where the token lands in them, and whether it chooses one. */
interface TeleportSystem {
    readonly destinations: readonly string[];
    readonly placement: string;
    readonly choice: boolean;
}

/** A surface at the region's bottom, top or both, and what it restricts (v14 `defineSurface`, 14.359). */
interface SurfaceSystem {
    readonly placement: 'bottom' | 'top' | 'both';
    readonly light: boolean;
    readonly move: boolean;
    readonly sight: boolean;
    readonly sound: boolean;
    readonly occlusion: boolean;
    readonly exposure: boolean;
}

export interface RegionCreateData extends OnLevels {
    readonly _id: string;
    readonly name: string;
    readonly shapes: readonly { readonly type: 'polygon'; readonly points: readonly number[]; readonly hole: boolean }[];
    /** A null bound is open-ended. */
    readonly elevation: { readonly bottom: number | null; readonly top: number | null };
    /** `changeLevel` has an empty schema in v14 (14.359). */
    readonly behaviors: readonly (
        | { readonly type: 'teleportToken'; readonly system: TeleportSystem }
        | { readonly type: 'changeLevel'; readonly system: Readonly<Record<string, never>> }
        | { readonly type: 'defineSurface'; readonly system: SurfaceSystem }
    )[];
    readonly locked: boolean;
    /** A `CONST.REGION_VISIBILITY` value. */
    readonly visibility: number;
}

/** A region redrawn in place: everything but its behaviours, which are embedded documents of their own. */
type RegionUpdateData = Omit<RegionCreateData, 'behaviors'>;

interface LevelCreateData {
    readonly name: string;
    readonly elevation: { readonly bottom: number; readonly top: number };
}

interface LevelUpdateData {
    readonly _id: string;
    readonly name?: string;
    readonly elevation?: { readonly bottom: number; readonly top: number };
}

export type EmbeddedName = 'Wall' | 'AmbientLight' | 'AmbientSound' | 'Tile' | 'Region' | 'Level';

type EmbeddedCreateData = WallCreateData | LightCreateData | SoundCreateData | TileCreateData | RegionCreateData | LevelCreateData;

/** Create data carrying the id the document will have. */
export type IdentifiedCreateData = EmbeddedCreateData & { readonly _id: string };

/**
 * One operation of `foundry.documents.modifyBatch` on a scene's embedded
 * documents. Operations run in order and may not use each other's results,
 * so every create carries its own `_id` (`keepId`).
 */
export type BatchOperation =
    | {
          readonly action: 'create';
          readonly documentName: EmbeddedName;
          readonly parent: FoundryScene;
          readonly data: readonly IdentifiedCreateData[];
          readonly keepId: true;
      }
    | { readonly action: 'update'; readonly documentName: 'Tile'; readonly parent: FoundryScene; readonly updates: readonly TileUpdateData[] }
    | { readonly action: 'update'; readonly documentName: 'Region'; readonly parent: FoundryScene; readonly updates: readonly RegionUpdateData[] }
    | { readonly action: 'delete'; readonly documentName: EmbeddedName; readonly parent: FoundryScene; readonly ids: readonly string[] };

/** Applies a batch of operations in one transaction: all of them land, or none. */
export type ModifyBatch = (operations: readonly BatchOperation[]) => Promise<unknown>;

export interface EmbeddedCollection {
    readonly has: (id: string) => boolean;
}

/** A native Level document, as far as the level store reads it. */
export interface NativeLevel {
    readonly id: string | null;
    readonly name: string;
    /** An open bound is null in source data and ±Infinity once Foundry prepares it. */
    readonly elevation: { readonly bottom: number | null; readonly top: number | null };
}

/*
 * FoundryScene mirrors members of the live `Scene` document, so they are
 * declared as METHODS rather than function properties on purpose: Foundry's
 * getFlag / setFlag / createEmbeddedDocuments are constrained generic *methods*,
 * and only method (bivariant) parameter checking lets the real document be
 * asserted into this minimal, precisely-typed surface. Property (strict,
 * contravariant) signatures break that bridge (the scope generics stop
 * overlapping). Hence the scoped method-signature-style exception.
 */
/* eslint-disable @typescript-eslint/method-signature-style -- bivariant method signatures are required to bridge the live Foundry Scene document; see the note above */
export interface FoundryScene {
    readonly id: string | null;
    readonly name: string;
    /** The playable rectangle inside the padding, and the grid size, in px. */
    readonly dimensions: { readonly sceneX: number; readonly sceneY: number; readonly sceneWidth: number; readonly sceneHeight: number; readonly size: number };
    /** The Level a token lands on by default. */
    readonly initialLevel: { readonly id: string | null } | null;
    /** Grid size in px per square, and the scene distance units one square spans. */
    readonly grid: { readonly size: number; readonly distance: number };
    readonly walls: EmbeddedCollection;
    readonly lights: EmbeddedCollection;
    readonly sounds: EmbeddedCollection;
    readonly tiles: EmbeddedCollection;
    readonly regions: EmbeddedCollection;
    readonly levels: { readonly contents: readonly NativeLevel[]; readonly size: number };
    // eslint-disable-next-line no-restricted-syntax -- boundary: a Foundry flag value is arbitrary serialised JSON; getFlag returns unknown by contract and is narrowed at the parse boundary
    getFlag(scope: string, key: string): unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: setFlag accepts an arbitrary serialisable flag value, exactly as the live Foundry Scene API does
    setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
    createEmbeddedDocuments(embeddedName: EmbeddedName, data: readonly EmbeddedCreateData[], operation?: { readonly keepId?: boolean }): Promise<unknown>;
    updateEmbeddedDocuments(embeddedName: 'Tile', updates: TileUpdateData[]): Promise<unknown>;
    updateEmbeddedDocuments(embeddedName: 'Level', updates: LevelUpdateData[]): Promise<unknown>;
    deleteEmbeddedDocuments(embeddedName: EmbeddedName, ids: readonly string[]): Promise<unknown>;
}
/* eslint-enable @typescript-eslint/method-signature-style */
