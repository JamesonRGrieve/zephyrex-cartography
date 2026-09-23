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
import type { PlacedBehaviour } from '../stamps/schema';
import type { BiomeKind } from './biome';
import { isRecord, stringArray } from './guards';

export type DoorType = 'none' | 'door' | 'secret';

export type DoorState = 'closed' | 'open' | 'locked';

/** Which senses a wall blocks. */
export interface SenseBlock {
    readonly sight: boolean;
    readonly movement: boolean;
    readonly light: boolean;
    readonly sound: boolean;
}

export const BLOCKS_ALL: SenseBlock = { sight: true, movement: true, light: true, sound: true };

export interface WallDoc {
    readonly a: Point;
    readonly b: Point;
    readonly door: DoorType;
    readonly doorState: DoorState;
    readonly blocks: SenseBlock;
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
}

/**
 * How a generated region names itself (the boundary localises it): a stair
 * between levels, a way into or out of a submap, or a stretch of terrain.
 */
type RegionLabel =
    | { readonly kind: NonNullable<PlacedBehaviour['transition']>['kind']; readonly from: string; readonly to: readonly string[] }
    | { readonly kind: 'entrance' | 'exit'; readonly scene: string }
    | { readonly kind: 'terrain'; readonly biome: BiomeKind };

/**
 * Where a teleport leads: another region of the same plan (by index, so a
 * stair's two ends can point at each other before either exists), or a region
 * in any scene by id (a submap's other side).
 */
type RegionTarget = { readonly plan: number } | { readonly scene: string; readonly region: string };

/** A native Scene Region. The sink turns its targets into region UUIDs. */
export interface RegionDoc {
    /** Fixed document id, for a region another scene must be able to point at; null lets the sink choose. */
    readonly id: string | null;
    readonly label: RegionLabel;
    readonly polygon: readonly Point[];
    /** Elevation band (scene distance units); null is open-ended. */
    readonly bottom: number | null;
    readonly top: number | null;
    readonly level: string | null;
    readonly teleport: { readonly targets: readonly RegionTarget[] } | null;
}

/** The ids of every native document one feature generated, by document type. */
export interface GeneratedDocs {
    readonly walls: readonly string[];
    readonly lights: readonly string[];
    readonly tiles: readonly string[];
    readonly regions: readonly string[];
}

export const NO_DOCS: GeneratedDocs = { walls: [], lights: [], tiles: [], regions: [] };

export function hasDocs(docs: GeneratedDocs): boolean {
    return docs.walls.length + docs.lights.length + docs.tiles.length + docs.regions.length > 0;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: parses the persisted generated-docs record of a scene-flag feature entry
export function parseGeneratedDocs(v: unknown): GeneratedDocs {
    if (!isRecord(v)) {
        return NO_DOCS;
    }
    return { walls: stringArray(v['walls']), lights: stringArray(v['lights']), tiles: stringArray(v['tiles']), regions: stringArray(v['regions']) };
}
