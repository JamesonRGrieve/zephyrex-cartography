// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Pure translation from the core's document specs to Foundry create data:
 * door, sense and movement enums, scene px to scene distance units, native
 * Level membership (v14), and the teleport behaviour schema, which differs
 * between v13 and v14. It has no Foundry runtime dependency, so it is
 * unit-tested even though it sits at the boundary.
 */
import type { Point } from '../geometry/spline';
import { MODULE_ID } from '../module-id';
import type { DoorState, DoorType, LightDoc, RegionDoc, TileDoc, WallDoc } from '../tools/documents';
import type { LightCreateData, RegionCreateData, TileCreateData, WallCreateData } from './boundary';

/** `CONST.WALL_DOOR_TYPES` (stable across v13 and v14). */
const DOOR_TYPES: Record<DoorType, number> = { none: 0, door: 1, secret: 2 };

/** `CONST.WALL_DOOR_STATES`. */
const DOOR_STATES: Record<DoorState, number> = { closed: 0, open: 1, locked: 2 };

const DOOR_STATE_NAMES: readonly DoorState[] = ['closed', 'open', 'locked'];

/** `CONST.EDGE_SENSE_TYPES` (v14) / `WALL_SENSE_TYPES` (v13): NONE and NORMAL. */
const SENSE_NONE = 0;
const SENSE_NORMAL = 20;

/** `CONST.WALL_MOVEMENT_TYPES`: NONE and NORMAL. */
const MOVE_NONE = 0;
const MOVE_NORMAL = 20;

/** Foundry generation from which scenes have native Level documents and the multi-destination teleport schema. */
export const NATIVE_LEVELS_GENERATION = 14;

export interface SceneGrid {
    /** Px per grid square. */
    readonly size: number;
    /** Scene distance units per grid square. */
    readonly distance: number;
}

/** How create data is shaped for the running Foundry: whether level ids are native Level documents. */
export interface TranslateOptions {
    readonly nativeLevels: boolean;
}

/** The door state for a wall's `ds` value, or null for a value Foundry does not define. */
export function doorStateFromDs(ds: number): DoorState | null {
    return DOOR_STATE_NAMES.find((state) => DOOR_STATES[state] === ds) ?? null;
}

function sense(blocks: boolean): number {
    return blocks ? SENSE_NORMAL : SENSE_NONE;
}

/** Native level membership: only on v14, where level ids are Level documents (an empty set means every level). */
function levelsField(level: string | null, options: TranslateOptions): { levels?: string[] } {
    return options.nativeLevels && level !== null ? { levels: [level] } : {};
}

export function wallCreateData(wall: WallDoc, options: TranslateOptions): WallCreateData {
    return {
        c: [wall.a.x, wall.a.y, wall.b.x, wall.b.y],
        door: DOOR_TYPES[wall.door],
        ds: DOOR_STATES[wall.doorState],
        sight: sense(wall.blocks.sight),
        light: sense(wall.blocks.light),
        sound: sense(wall.blocks.sound),
        move: wall.blocks.movement ? MOVE_NORMAL : MOVE_NONE,
        ...levelsField(wall.level, options),
    };
}

/** Scene px to scene distance units (a light's radius is measured in the scene's distance units). */
export function pxToDistance(px: number, grid: SceneGrid): number {
    return grid.size > 0 ? (px / grid.size) * grid.distance : 0;
}

export function lightCreateData(light: LightDoc, grid: SceneGrid, options: TranslateOptions): LightCreateData {
    return {
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
        ...levelsField(light.level, options),
    };
}

export function tileCreateData(tile: TileDoc, options: TranslateOptions): TileCreateData {
    return {
        texture: { src: tile.src },
        x: tile.x,
        y: tile.y,
        width: tile.width,
        height: tile.height,
        rotation: tile.rotation,
        elevation: tile.elevation,
        flags: { [MODULE_ID]: { featureId: tile.featureId } },
        ...levelsField(tile.level, options),
    };
}

function flatten(points: readonly Point[]): number[] {
    return points.flatMap((p) => [p.x, p.y]);
}

/**
 * A teleport behaviour to `destinations` (region UUIDs). v14 takes a set of
 * destinations and can keep the token's relative position (the ends of a
 * stair share a footprint); v13 takes one destination, so only the first is
 * used there.
 */
function teleportBehaviour(destinations: readonly string[], options: TranslateOptions): RegionCreateData['behaviors'][number] {
    const choice = destinations.length > 1;
    const system = options.nativeLevels
        ? { destinations: [...destinations], placement: 'relative', choice }
        : { destination: destinations[0] ?? '', choice: false };
    return { type: 'teleportToken', system };
}

/**
 * Create data for the regions of one plan, whose ids are chosen up front
 * (`ids[i]` for `regions[i]`) so each teleport can name its destinations'
 * UUIDs within the same create call.
 */
export function regionCreateData(
    regions: readonly RegionDoc[],
    ids: readonly string[],
    uuidOf: (id: string) => string,
    nameOf: (region: RegionDoc) => string,
    options: TranslateOptions,
): RegionCreateData[] {
    return regions.map((region, i) => {
        const destinations = (region.teleport?.targets ?? [])
            .map((t) => ids[t])
            .filter((id): id is string => id !== undefined)
            .map(uuidOf);
        return {
            _id: ids[i] ?? '',
            name: nameOf(region),
            shapes: [{ type: 'polygon', points: flatten(region.polygon), hole: false }],
            elevation: { bottom: region.bottom, top: region.top },
            behaviors: destinations.length > 0 ? [teleportBehaviour(destinations, options)] : [],
            ...levelsField(region.level, options),
        };
    });
}
