// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Specs for the native Foundry documents the plugin generates. They are plain
 * data in scene pixels. The pure core builds them, and the Foundry boundary
 * translates them into document create data: CONST enums, distance units and
 * version differences. Every generated document's id is recorded on the
 * feature that produced it, in a {@link GeneratedDocs} record, so that feature
 * can re-sync or delete exactly its own documents (the lifecycle rule).
 */
import type { Point } from '../geometry/spline';
import type { PlacedBehaviour, StampLight, StampTile } from '../stamps/schema';
import type { BiomeKind } from './biome';
import { isRecord, stringArray } from './guards';

export type DoorType = 'none' | 'door' | 'secret';

export type DoorState = 'closed' | 'open' | 'locked';

/**
 * How a wall restricts one sense, as Foundry's edge sense types: not at all,
 * fully, as a terrain wall (only past a second one), or only within
 * (proximity) or beyond (distance) the wall's threshold.
 */
export type SenseLevel = 'none' | 'normal' | 'limited' | 'proximity' | 'distance';

/** How a wall restricts each sense; movement is simply blocked or not. */
export interface SenseBlock {
    readonly sight: SenseLevel;
    readonly movement: boolean;
    readonly light: SenseLevel;
    readonly sound: SenseLevel;
}

export const BLOCKS_ALL: SenseBlock = { sight: 'normal', movement: true, light: 'normal', sound: 'normal' };

/** A pack's sense setting: `true` blocks, `false` lets through, or a named sense level. */
export function senseLevel(setting: boolean | Exclude<SenseLevel, 'none' | 'normal'>): SenseLevel {
    if (setting === true) {
        return 'normal';
    }
    return setting === false ? 'none' : setting;
}

/** Which side a one-way wall restricts from, walking it from `a` to `b`. */
export type WallDirection = 'both' | 'left' | 'right';

/** Distances (grid units) for proximity and distance senses. */
export interface WallThreshold {
    readonly light?: number;
    readonly sight?: number;
    readonly sound?: number;
    readonly attenuation?: boolean;
}

/** How a Foundry door animates open (`CONFIG.Wall.animationTypes`). */
export const DOOR_ANIMATIONS = ['ascend', 'descend', 'slide', 'swing', 'swivel'] as const;

export type DoorAnimationType = (typeof DOOR_ANIMATIONS)[number];

/** A door's animation; options left out (or undefined, as a pack parses them) take Foundry's defaults. */
export interface DoorAnimation {
    readonly type: DoorAnimationType;
    readonly direction?: 1 | -1 | undefined;
    readonly double?: boolean | undefined;
    /** Milliseconds. */
    readonly duration?: number | undefined;
    readonly flip?: boolean | undefined;
    readonly strength?: number | undefined;
    /** The served image of the door leaf Foundry animates. */
    readonly texture?: string | undefined;
}

/** How a door sounds and moves: a `CONFIG.Wall.doorSounds` key and an animation, each null for Foundry's default. */
export interface DoorLook {
    readonly sound: string | null;
    readonly animation: DoorAnimation | null;
}

export interface WallDoc {
    readonly a: Point;
    readonly b: Point;
    readonly door: DoorType;
    readonly doorState: DoorState;
    /** For a door, how it sounds and animates; absent on plain walls. */
    readonly look?: DoorLook;
    readonly blocks: SenseBlock;
    /** A one-way wall; omitted restricts from both sides. */
    readonly direction?: WallDirection;
    readonly threshold?: WallThreshold;
    /** Level (elevation band) id the wall belongs to, or null for every level. */
    readonly level: string | null;
    /** For a room wall, the perimeter segment it comes from (so a door changed in play maps back to its room door). */
    readonly segment?: number;
}

interface LightAnimation {
    readonly type: string;
    readonly speed?: number;
    readonly intensity?: number;
}

/** What emits a generated light; the boundary names the light after it. */
export type LightSource = { readonly kind: 'stamp'; readonly name: string } | { readonly kind: 'room' };

export interface LightDoc {
    readonly source: LightSource;
    readonly x: number;
    readonly y: number;
    /** Dim radius in scene px. */
    readonly dim: number;
    /** Bright radius in scene px. */
    readonly bright: number;
    readonly color?: string;
    readonly alpha?: number;
    /** Emission cone in degrees (360 = omnidirectional). */
    readonly angle?: number;
    /** Direction the cone faces, in degrees. */
    readonly rotation?: number;
    readonly animation?: LightAnimation;
    /** How the light renders and what it touches, as its pack declares; left out, Foundry's defaults. */
    readonly technique?: LightTechnique;
    readonly elevation: number;
    readonly level: string | null;
}

/** A stamp light's rendering and reach, beyond its radii, colour and animation (v14 AmbientLight). */
export type LightTechnique = Pick<
    StampLight,
    'negative' | 'priority' | 'coloration' | 'luminosity' | 'attenuation' | 'saturation' | 'contrast' | 'shadows' | 'walls' | 'vision' | 'darkness' | 'hidden'
>;

/** A native ambient sound, emitted by a stamp. */
export interface SoundDoc {
    /** The emitting stamp's pack name. */
    readonly name: string;
    readonly x: number;
    readonly y: number;
    /** Audible radius in scene px. */
    readonly radius: number;
    /** Served audio URL. */
    readonly path: string;
    readonly volume: number;
    readonly repeat: boolean;
    /** Walls muffle the sound. */
    readonly walls: boolean;
    /** Volume falls off with distance. */
    readonly easing: boolean;
    readonly elevation: number;
    readonly level: string | null;
}

export interface TileDoc {
    /** The stamp's pack name, so the tile reads clearly in Foundry's Placeables tab. */
    readonly name: string;
    readonly src: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly rotation: number;
    readonly elevation: number;
    readonly level: string | null;
    /** The feature that owns this tile, written to the tile's module flag. */
    readonly featureId: string;
    /** The tile's own behaviour as its pack declares it (opacity, occlusion, restrictions, video); left out, Foundry's defaults. */
    readonly look?: StampTile;
}

/**
 * How a generated region names itself (the boundary localises it): a stair
 * between levels, a way into or out of a submap, or a stretch of terrain.
 */
type RegionLabel =
    | { readonly kind: NonNullable<PlacedBehaviour['transition']>['kind']; readonly from: string; readonly to: readonly string[] }
    | { readonly kind: 'entrance' | 'exit'; readonly scene: string }
    | { readonly kind: 'terrain'; readonly biome: BiomeKind }
    | { readonly kind: 'floor'; readonly level: string }
    | { readonly kind: 'stamp-terrain' | 'stamp-surface'; readonly name: string };

/** Where a teleported token lands in the region it arrives in (v14 `teleportToken` placement). */
export const TRAVEL_PLACEMENTS = ['relative', 'center', 'random'] as const;

export type TravelPlacement = (typeof TRAVEL_PLACEMENTS)[number];

/**
 * How a token goes through a teleport: where it lands, the scene transition
 * it sees on the way (a `CONFIG.Canvas.sceneTransitions` key, or null for
 * none) and how long that takes, and the question it is asked before going
 * (null: Foundry's own). Foundry fills `{token}`, `{region}` and `{scene}` in
 * the prompt.
 */
export interface SubmapTravel {
    readonly placement: TravelPlacement;
    readonly transition: string | null;
    /** Milliseconds, 500–10000 as Foundry takes it. */
    readonly duration: number;
    readonly prompt: string | null;
}

/** Where a teleport leads: a region in any scene, by id (a submap's other side). */
interface RegionTarget {
    readonly scene: string;
    readonly region: string;
}

/**
 * What a generated region does:
 * - `teleport` moves a token that enters it to one of `targets`, in this
 *   scene or another (a submap's entrance and exit);
 * - `changeLevel` is v14's way between floors of one scene: a token entering
 *   it is offered every other level the region sits on, keeping its height
 *   above the floor;
 * - `surface` is a solid floor at the region's bottom (v14 `defineSurface`):
 *   it restricts light, movement, sight and sound and occludes, so the level
 *   below cannot be seen or walked through.
 */
export type RegionBehaviour =
    | { readonly kind: 'teleport'; readonly targets: readonly RegionTarget[]; readonly travel: SubmapTravel }
    | { readonly kind: 'changeLevel' }
    /** A Define Surface at the region's bottom, top or both that restricts everything; `reveal` is Foundry's Reveal Elevated Surface. */
    | { readonly kind: 'surface'; readonly placement: 'bottom' | 'top' | 'both'; readonly reveal: boolean }
    /** Foundry's Modify Movement Cost: a cost multiplier per movement action (walk, fly, ...). */
    | { readonly kind: 'terrain'; readonly difficulties: Readonly<Record<string, number>> };

/** A native Scene Region. The sink turns its targets into region UUIDs. */
export interface RegionDoc {
    /** Fixed document id, for a region another scene must be able to point at; null lets the sink choose. */
    readonly id: string | null;
    readonly label: RegionLabel;
    readonly polygon: readonly Point[];
    /** Elevation band (scene distance units); null is open-ended. */
    readonly bottom: number | null;
    readonly top: number | null;
    /** The level it sits on, or null for every level. */
    readonly level: string | null;
    /**
     * Other levels it also sits on, for a region joining floors: a stair's
     * ends, or the level a floor is seen from below. Empty for most.
     */
    readonly spans: readonly string[];
    readonly behaviour: RegionBehaviour | null;
}

/** The ids of every native document one feature generated, by document type. */
export interface GeneratedDocs {
    readonly walls: readonly string[];
    readonly lights: readonly string[];
    readonly tiles: readonly string[];
    readonly regions: readonly string[];
    readonly sounds: readonly string[];
}

export const NO_DOCS: GeneratedDocs = { walls: [], lights: [], tiles: [], regions: [], sounds: [] };

export function hasDocs(docs: GeneratedDocs): boolean {
    return docs.walls.length + docs.lights.length + docs.tiles.length + docs.regions.length + docs.sounds.length > 0;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: parses the persisted generated-docs record of a scene-flag feature entry
export function parseGeneratedDocs(v: unknown): GeneratedDocs {
    if (!isRecord(v)) {
        return NO_DOCS;
    }
    return {
        walls: stringArray(v['walls']),
        lights: stringArray(v['lights']),
        tiles: stringArray(v['tiles']),
        regions: stringArray(v['regions']),
        // Recorded since stamps emit sounds; an older record has none.
        sounds: stringArray(v['sounds']),
    };
}
