// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Pure translation from the core's document specs to Foundry create data:
 * door, sense and movement enums, scene px to scene distance units, native
 * Level membership, and teleport behaviours. It has no Foundry runtime
 * dependency, so it is unit-tested even though it sits at the boundary.
 */
import type { TileFrame } from '../canvas/controller';
import type { Point } from '../geometry/spline';
import { MODULE_ID } from '../module-id';
import type {
    DoorState,
    DoorType,
    LightDoc,
    RegionBehaviour,
    RegionDoc,
    SenseLevel,
    SoundDoc,
    TileDoc,
    WallDirection,
    WallDoc,
    WallThreshold,
} from '../tools/documents';
import type { LightCreateData, RegionCreateData, SoundCreateData, TileCreateData, WallCreateData } from './boundary';

/** `CONST.WALL_DOOR_TYPES`. */
const DOOR_TYPES: Record<DoorType, number> = { none: 0, door: 1, secret: 2 };

/** `CONST.WALL_DOOR_STATES`. */
const DOOR_STATES: Record<DoorState, number> = { closed: 0, open: 1, locked: 2 };

const DOOR_STATE_NAMES: readonly DoorState[] = ['closed', 'open', 'locked'];

/** `CONST.EDGE_SENSE_TYPES`. */
const SENSE_TYPES: Record<SenseLevel, number> = { none: 0, limited: 10, normal: 20, proximity: 30, distance: 40 };

/** `CONST.EDGE_DIRECTIONS`. */
const DIRECTIONS: Record<WallDirection, number> = { both: 0, left: 1, right: 2 };

/** `CONST.REGION_VISIBILITY.LAYER`: shown on the Regions layer, locked or not. */
const REGION_VISIBILITY_LAYER = 0;

/** `CONST.WALL_MOVEMENT_TYPES`: NONE and NORMAL. */
const MOVE_NONE = 0;
const MOVE_NORMAL = 20;

export interface SceneGrid {
    /** Px per grid square. */
    readonly size: number;
    /** Scene distance units per grid square. */
    readonly distance: number;
}

/** The door state for a wall's `ds` value, or null for a value Foundry does not define. */
export function doorStateFromDs(ds: number): DoorState | null {
    return DOOR_STATE_NAMES.find((state) => DOOR_STATES[state] === ds) ?? null;
}

/** A wall threshold from grid units to the scene's distance units; a sense without one is unbounded (null). */
function thresholdData(threshold: WallThreshold, grid: SceneGrid): NonNullable<WallCreateData['threshold']> {
    const distance = (gridUnits: number | undefined): number | null => (gridUnits === undefined ? null : gridUnits * grid.distance);
    return {
        light: distance(threshold.light),
        sight: distance(threshold.sight),
        sound: distance(threshold.sound),
        attenuation: threshold.attenuation ?? false,
    };
}

/** Native Level membership; left out (every level) for a document on no level. */
function levelsField(level: string | null): { levels?: string[] } {
    return level === null ? {} : { levels: [level] };
}

export function wallCreateData(wall: WallDoc, grid: SceneGrid): WallCreateData {
    return {
        c: [wall.a.x, wall.a.y, wall.b.x, wall.b.y],
        door: DOOR_TYPES[wall.door],
        ds: DOOR_STATES[wall.doorState],
        sight: SENSE_TYPES[wall.blocks.sight],
        light: SENSE_TYPES[wall.blocks.light],
        sound: SENSE_TYPES[wall.blocks.sound],
        move: wall.blocks.movement ? MOVE_NORMAL : MOVE_NONE,
        ...(wall.direction === undefined ? {} : { dir: DIRECTIONS[wall.direction] }),
        ...(wall.threshold === undefined ? {} : { threshold: thresholdData(wall.threshold, grid) }),
        ...doorLookData(wall),
        ...levelsField(wall.level),
    };
}

/** A door's sound and animation, each left to Foundry's default when unset; nothing for a plain wall. */
function doorLookData(wall: WallDoc): Pick<WallCreateData, 'doorSound' | 'animation'> {
    if (wall.door === 'none' || wall.look === undefined) {
        return {};
    }
    const { sound, animation } = wall.look;
    return { ...(sound === null ? {} : { doorSound: sound }), ...(animation === null ? {} : { animation: { ...animation } }) };
}

/** Scene px to scene distance units (a light's radius is measured in the scene's distance units). */
export function pxToDistance(px: number, grid: SceneGrid): number {
    return grid.size > 0 ? (px / grid.size) * grid.distance : 0;
}

export function lightCreateData(light: LightDoc, grid: SceneGrid, displayName: string): LightCreateData {
    return {
        name: displayName,
        x: light.x,
        y: light.y,
        elevation: light.elevation,
        rotation: light.rotation ?? 0,
        config: {
            dim: pxToDistance(light.dim, grid),
            bright: pxToDistance(light.bright, grid),
            ...(light.color === undefined ? {} : { color: light.color }),
            ...(light.alpha === undefined ? {} : { alpha: light.alpha }),
            ...(light.angle === undefined ? {} : { angle: light.angle }),
            ...(light.animation === undefined ? {} : { animation: light.animation }),
        },
        ...levelsField(light.level),
    };
}

export function soundCreateData(sound: SoundDoc, grid: SceneGrid, displayName: string): SoundCreateData {
    return {
        name: displayName,
        x: sound.x,
        y: sound.y,
        elevation: sound.elevation,
        radius: pxToDistance(sound.radius, grid),
        path: sound.path,
        volume: sound.volume,
        repeat: sound.repeat,
        walls: sound.walls,
        easing: sound.easing,
        ...levelsField(sound.level),
    };
}

/**
 * A tile sits at its texture anchor and rotates about it. The core's frames
 * are an unrotated top-left and a rotation about the centre, so tiles are
 * anchored at their centre.
 */
const TILE_ANCHOR = 0.5;

/** A tile as Foundry reports it: its anchor point, size, rotation and anchor. */
export interface TileSource {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly rotation: number;
    readonly texture: { readonly anchorX: number; readonly anchorY: number };
}

/** The core's frame (unrotated top-left) of a tile, whatever anchor a GM gave it. */
export function tileFrame(tile: TileSource): TileFrame {
    return {
        x: tile.x - tile.texture.anchorX * tile.width,
        y: tile.y - tile.texture.anchorY * tile.height,
        width: tile.width,
        height: tile.height,
        rotation: tile.rotation,
    };
}

export function tileCreateData(tile: TileDoc): TileCreateData {
    return {
        name: tile.name,
        texture: { src: tile.src, anchorX: TILE_ANCHOR, anchorY: TILE_ANCHOR },
        // Foundry stores tile positions as integers; round here so the read-back matches.
        x: Math.round(tile.x + tile.width * TILE_ANCHOR),
        y: Math.round(tile.y + tile.height * TILE_ANCHOR),
        width: tile.width,
        height: tile.height,
        rotation: tile.rotation,
        elevation: tile.elevation,
        flags: { [MODULE_ID]: { featureId: tile.featureId } },
        ...levelsField(tile.level),
    };
}

function flatten(points: readonly Point[]): number[] {
    return points.flatMap((p) => [p.x, p.y]);
}

/** A Scene Region's UUID. */
export function regionUuid(scene: string, region: string): string {
    return `Scene.${scene}.Region.${region}`;
}

/**
 * A region's native behaviour.
 * - A teleport names its destinations by region UUID. The token keeps its
 *   position relative to the region, and chooses when there is more than one
 *   way to go.
 * - `changeLevel` has no options in v14: which levels it offers comes from
 *   the region's own level membership.
 * - A floor is a `defineSurface` at the region's bottom that restricts every
 *   sense and movement and occludes what is beneath.
 */
function behaviourData(behaviour: RegionBehaviour | null): RegionCreateData['behaviors'] {
    if (behaviour === null) {
        return [];
    }
    if (behaviour.kind === 'changeLevel') {
        return [{ type: 'changeLevel', system: {} }];
    }
    if (behaviour.kind === 'surface') {
        return [
            {
                type: 'defineSurface',
                system: { placement: 'bottom', light: true, move: true, sight: true, sound: true, occlusion: true, exposure: false },
            },
        ];
    }
    const destinations = behaviour.targets.map((target) => regionUuid(target.scene, target.region));
    return [{ type: 'teleportToken', system: { destinations, placement: 'relative', choice: destinations.length > 1 } }];
}

/** The levels a region sits on: its own, and those it spans; none (every level) for a level-less region. */
function regionLevels(region: RegionDoc): { readonly levels?: readonly string[] } {
    if (region.level === null) {
        return {};
    }
    return { levels: [...new Set([region.level, ...region.spans])] };
}

/**
 * Create data for the regions of one plan, whose ids are chosen up front
 * (`ids[i]` for `regions[i]`).
 */
export function regionCreateData(regions: readonly RegionDoc[], ids: readonly string[], nameOf: (region: RegionDoc) => string): RegionCreateData[] {
    return regions.map((region, i) => ({
        _id: ids[i] ?? '',
        name: nameOf(region),
        shapes: [{ type: 'polygon', points: flatten(region.polygon), hole: false }],
        elevation: { bottom: region.bottom, top: region.top },
        behaviors: behaviourData(region.behaviour),
        // A region drawn from a feature is edited through the feature, so it is locked and
        // shown on the Regions layer. An interior exit is the GM's to place, so it stays free.
        locked: region.label.kind !== 'exit',
        visibility: REGION_VISIBILITY_LAYER,
        ...regionLevels(region),
    }));
}
