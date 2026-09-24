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
    /** A door's `CONFIG.Wall.doorSounds` key. */
    readonly doorSound?: string;
    /** Marks a light switch's wall, whose door control shows a light instead of a door. */
    readonly flags?: Readonly<Record<string, { readonly lightSwitch: true }>>;
    /** A door's animation; left-out (or undefined) options take Foundry's defaults. */
    readonly animation?: {
        readonly type: string;
        readonly direction?: 1 | -1 | undefined;
        readonly double?: boolean | undefined;
        readonly duration?: number | undefined;
        readonly flip?: boolean | undefined;
        readonly strength?: number | undefined;
        /** The door leaf's image path. */
        readonly texture?: string | undefined;
    };
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
        // The pack's rendering settings. Undefined keys are dropped on the way to Foundry, which then applies its defaults.
        readonly negative?: boolean | undefined;
        readonly priority?: number | undefined;
        /** An `AdaptiveLightingShader.SHADER_TECHNIQUES` id. */
        readonly coloration?: number | undefined;
        readonly luminosity?: number | undefined;
        readonly attenuation?: number | undefined;
        readonly saturation?: number | undefined;
        readonly contrast?: number | undefined;
        readonly shadows?: number | undefined;
        /** The scene darkness range (0–1) the light is active in. */
        readonly darkness?: { readonly min: number; readonly max: number } | undefined;
    };
    /** Whether walls constrain the light (Foundry's default: they do). */
    readonly walls?: boolean | undefined;
    /** Whether the light also provides vision. */
    readonly vision?: boolean | undefined;
    /** Hidden from players. */
    readonly hidden?: boolean | undefined;
}

export interface TileCreateData extends OnLevels {
    readonly name: string;
    /** The anchor is the point `x`, `y` names and the tile rotates about. */
    readonly texture: { readonly src: string; readonly anchorX: number; readonly anchorY: number; readonly alphaThreshold?: number | undefined };
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly rotation: number;
    readonly elevation: number;
    readonly flags: Readonly<Record<string, { readonly featureId: string }>>;
    // The pack's tile behaviour. Undefined keys are dropped on the way to Foundry, which then applies its defaults.
    readonly alpha?: number | undefined;
    readonly hidden?: boolean | undefined;
    /** `modes` are `CONST.OCCLUSION_MODES` values; `alpha` is the opacity while occluded. */
    readonly occlusion?: { readonly modes: readonly number[]; readonly alpha?: number | undefined } | undefined;
    readonly restrictions?: { readonly light?: boolean | undefined; readonly weather?: boolean | undefined } | undefined;
    readonly video?: { readonly loop?: boolean | undefined; readonly autoplay?: boolean | undefined; readonly volume?: number | undefined } | undefined;
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
    /** The question asked before teleporting; null for Foundry's own (14.359 `dialog`). */
    readonly dialog: { readonly revealed: string | null; readonly unrevealed: string | null };
    /** A `CONFIG.Canvas.sceneTransitions` key (null: none) and its length in ms. */
    readonly transition: { readonly type: string | null; readonly duration: number };
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

/**
 * A region shape (14.359 `common/data/data.mjs`): a polygon's flat
 * `[x0, y0, x1, y1, …]`, or a rectangle whose `x`, `y` is its anchor point and
 * which rotates about it (degrees).
 */
export type RegionShape =
    | { readonly type: 'polygon'; readonly points: readonly number[]; readonly hole: boolean }
    | {
          readonly type: 'rectangle';
          readonly x: number;
          readonly y: number;
          readonly width: number;
          readonly height: number;
          readonly anchorX: number;
          readonly anchorY: number;
          readonly rotation: number;
          readonly hole: boolean;
      };

/** The behaviours an area effect becomes, with their 14.359 schemas (`client/data/region-behaviors/`). */
export type AreaEffectBehaviour =
    /** `mode` is an `AdjustDarknessLevelRegionBehaviorType.MODES` value. */
    | { readonly type: 'adjustDarknessLevel'; readonly system: { readonly mode: number; readonly modifier: number } }
    | { readonly type: 'suppressWeather'; readonly system: Readonly<Record<string, never>> }
    /** `visibility` is a `DisplayScrollingTextRegionBehaviorType.VISIBILITY_MODES` value. */
    | {
          readonly type: 'displayScrollingText';
          readonly system: {
              readonly events: readonly string[];
              readonly text: string;
              readonly color: string;
              readonly visibility: number;
              readonly once: boolean;
          };
      }
    | { readonly type: 'pauseGame'; readonly system: { readonly once: boolean } }
    | { readonly type: 'executeMacro'; readonly system: { readonly events: readonly string[]; readonly uuid: string | null; readonly everyone: boolean } }
    | { readonly type: 'executeScript'; readonly system: { readonly events: readonly string[]; readonly source: string } }
    | { readonly type: 'applyActiveEffect'; readonly system: { readonly effects: readonly string[] } };

export interface RegionCreateData extends OnLevels {
    readonly _id: string;
    readonly name: string;
    /** `#rrggbb` on the Regions layer. */
    readonly color: string;
    /** A barrier to tokens (`move`), lights, sight or sound; absent for none. */
    readonly restriction?: { readonly enabled: boolean; readonly type: 'move'; readonly priority: number };
    readonly shapes: readonly RegionShape[];
    /** A null bound is open-ended. */
    readonly elevation: { readonly bottom: number | null; readonly top: number | null };
    /** `changeLevel` has an empty schema in v14 (14.359). */
    readonly behaviors: readonly (
        | { readonly type: 'teleportToken'; readonly system: TeleportSystem }
        | { readonly type: 'changeLevel'; readonly system: Readonly<Record<string, never>> }
        | { readonly type: 'defineSurface'; readonly system: SurfaceSystem }
        /** Cost multipliers per movement action (v14 `modifyMovementCost`, 14.359); actions left out keep Foundry's 1. */
        | { readonly type: 'modifyMovementCost'; readonly system: { readonly difficulties: Readonly<Record<string, number>> } }
        | AreaEffectBehaviour
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

/** A colour as a prepared v14 document holds it (`Color`, a Number): `css` is `#rrggbb`. */
interface PreparedColour {
    readonly css: string;
}

/** A Level image (v14 `background`, `foreground` and `fog`): its source (null: none), tint and, for two of them, alpha threshold. */
interface LevelImage<Colour> {
    readonly src: string | null;
    readonly tint: Colour;
}

interface ThresholdImage<Colour> extends LevelImage<Colour> {
    readonly alphaThreshold: number;
}

/** Where a Level's images sit (v14 `Level#textures`). */
interface LevelTextures {
    readonly anchorX: number;
    readonly anchorY: number;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly fit: string;
    readonly scaleX: number;
    readonly scaleY: number;
    readonly rotation: number;
}

export interface LevelUpdateData {
    readonly _id: string;
    readonly name?: string;
    readonly elevation?: { readonly bottom: number; readonly top: number };
    readonly background?: ThresholdImage<string> & { readonly color: string };
    readonly foreground?: ThresholdImage<string>;
    readonly fog?: LevelImage<string>;
    readonly textures?: LevelTextures;
    readonly visibility?: { readonly levels: readonly string[] };
}

/** A map Note (14.359 `common/documents/note.mjs`): the journal entry and page by id; a texture left out takes Foundry's icon. */
export interface NoteCreateData extends OnLevels {
    readonly x: number;
    readonly y: number;
    readonly elevation: number;
    readonly text: string;
    readonly entryId: string | null;
    readonly pageId: string | null;
    readonly global: boolean;
    readonly texture?: { readonly src: string };
}

export type EmbeddedName = 'Wall' | 'AmbientLight' | 'AmbientSound' | 'Tile' | 'Region' | 'Level' | 'Note';

type EmbeddedCreateData = WallCreateData | LightCreateData | SoundCreateData | TileCreateData | RegionCreateData | LevelCreateData | NoteCreateData;

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
    | {
          readonly action: 'update';
          readonly documentName: 'Wall';
          readonly parent: FoundryScene;
          readonly updates: readonly (WallCreateData & { readonly _id: string })[];
      }
    | {
          readonly action: 'update';
          readonly documentName: 'RegionBehavior';
          readonly parent: FoundryRegion;
          readonly updates: readonly { readonly _id: string; readonly system: RegionBehaviorSystem }[];
      }
    | { readonly action: 'update'; readonly documentName: 'Region'; readonly parent: FoundryScene; readonly updates: readonly RegionUpdateData[] }
    | {
          readonly action: 'update';
          readonly documentName: 'AmbientLight';
          readonly parent: FoundryScene;
          readonly updates: readonly { readonly _id: string; readonly hidden: boolean }[];
      }
    | { readonly action: 'delete'; readonly documentName: EmbeddedName; readonly parent: FoundryScene; readonly ids: readonly string[] };

/** Applies a batch of operations in one transaction: all of them land, or none. */
export type ModifyBatch = (operations: readonly BatchOperation[]) => Promise<unknown>;

export interface EmbeddedCollection {
    readonly has: (id: string) => boolean;
}

/* eslint-disable @typescript-eslint/method-signature-style -- see FoundryScene: the live document's methods must stay methods to be assignable */
/** One of a region's behaviours, as far as updating its settings in place goes. */
export interface FoundryRegionBehavior {
    readonly id: string | null;
    readonly type: string;
    update(data: { readonly system: RegionBehaviorSystem }): Promise<unknown>;
}
/* eslint-enable @typescript-eslint/method-signature-style */

/** A live Region, with its behaviours. */
export interface FoundryRegion {
    readonly behaviors: { readonly contents: readonly FoundryRegionBehavior[] };
}

/** A scene's regions: whether one exists, and the live one by id. */
export interface RegionCollection extends EmbeddedCollection {
    readonly get: (id: string) => FoundryRegion | undefined;
}

/** A generated behaviour's settings. */
export type RegionBehaviorSystem = RegionCreateData['behaviors'][number]['system'];

/** A native Level document, as far as the level store reads it. */
export interface NativeLevel {
    readonly id: string | null;
    readonly name: string;
    /** An open bound is null in source data and ±Infinity once Foundry prepares it. */
    readonly elevation: { readonly bottom: number | null; readonly top: number | null };
    readonly background: ThresholdImage<PreparedColour> & { readonly color: PreparedColour };
    readonly foreground: ThresholdImage<PreparedColour>;
    /** 14.359 gives the fog a tint (`common/documents/level.mjs`); fvtt-types does not have it yet. */
    readonly fog: { readonly src: string | null; readonly tint?: PreparedColour };
    readonly textures: LevelTextures;
    /** The other levels seen from this one (a `SceneLevelsSetField`: a Set once prepared). */
    readonly visibility: { readonly levels: Iterable<string> };
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
    readonly notes: EmbeddedCollection;
    readonly tiles: EmbeddedCollection;
    readonly regions: RegionCollection;
    readonly levels: { readonly contents: readonly NativeLevel[]; readonly size: number };
    // eslint-disable-next-line no-restricted-syntax -- boundary: a Foundry flag value is arbitrary serialised JSON; getFlag returns unknown by contract and is narrowed at the parse boundary
    getFlag(scope: string, key: string): unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: setFlag accepts an arbitrary serialisable flag value, exactly as the live Foundry Scene API does
    setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
    createEmbeddedDocuments(embeddedName: EmbeddedName, data: readonly EmbeddedCreateData[], operation?: { readonly keepId?: boolean }): Promise<unknown>;
    updateEmbeddedDocuments(embeddedName: 'Tile', updates: TileUpdateData[]): Promise<unknown>;
    updateEmbeddedDocuments(embeddedName: 'Level', updates: LevelUpdateData[]): Promise<unknown>;
    deleteEmbeddedDocuments(embeddedName: EmbeddedName, ids: readonly string[]): Promise<unknown>;
    update(data: SceneSettingsUpdate): Promise<unknown>;
}
/* eslint-enable @typescript-eslint/method-signature-style */

/** One lighting environment's values, as a partial update. */
interface EnvironmentUpdate {
    readonly hue?: number;
    readonly intensity?: number;
    readonly luminosity?: number;
    readonly saturation?: number;
    readonly shadows?: number;
}

/** The scene's own settings, as a partial update: only the keys given change. */
export interface SceneSettingsUpdate {
    readonly environment?: {
        readonly darknessLevel?: number;
        readonly darknessLock?: boolean;
        readonly globalLight?: { readonly enabled: boolean };
        readonly cycle?: boolean;
        readonly base?: EnvironmentUpdate;
        readonly dark?: EnvironmentUpdate;
    };
    readonly tokenVision?: boolean;
    /** `mode` is a `CONST.FOG_EXPLORATION_MODES` value. */
    readonly fog?: { readonly mode?: number; readonly colors?: { readonly explored?: string; readonly unexplored?: string } };
    readonly weather?: string;
    readonly transition?: { readonly type: string | null; readonly duration?: number | undefined };
}
