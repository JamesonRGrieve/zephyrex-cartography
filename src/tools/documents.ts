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
import type { WallSpec } from '../geometry/wall';
import type { PlacedBehaviour } from '../stamps/schema';
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
}

interface LightAnimation {
    readonly type: string;
    readonly speed?: number;
    readonly intensity?: number;
}

export interface LightDoc {
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

/** How a transition region names itself: what it is and where it leads (the boundary localises it). */
interface TransitionLabel {
    readonly kind: NonNullable<PlacedBehaviour['transition']>['kind'];
    readonly from: string;
    readonly to: readonly string[];
}

/**
 * A native Scene Region. `teleport.targets` are indices of other regions in the
 * same plan, so a stair's two ends can point at each other before either exists.
 * The sink turns them into region UUIDs.
 */
export interface RegionDoc {
    readonly label: TransitionLabel;
    readonly polygon: readonly Point[];
    /** Elevation band (scene distance units). */
    readonly bottom: number;
    readonly top: number;
    readonly level: string | null;
    readonly teleport: { readonly targets: readonly number[] } | null;
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

/** A plain perimeter wall (door or not), blocking every sense, on every level. */
export function wallDocFromSpec(spec: WallSpec, level: string | null = null): WallDoc {
    return { a: spec.a, b: spec.b, door: spec.door ? 'door' : 'none', doorState: 'closed', blocks: BLOCKS_ALL, level };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: parses the persisted generated-docs record of a scene-flag feature entry
export function parseGeneratedDocs(v: unknown): GeneratedDocs {
    if (!isRecord(v)) {
        return NO_DOCS;
    }
    return { walls: stringArray(v['walls']), lights: stringArray(v['lights']), tiles: stringArray(v['tiles']), regions: stringArray(v['regions']) };
}
