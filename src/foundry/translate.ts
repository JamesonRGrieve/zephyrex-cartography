// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Pure translation from the core's document specs to Foundry create data:
 * door, sense and movement enums, and scene px to scene distance units. It has
 * no Foundry runtime dependency, so it is unit-tested even though it sits at
 * the boundary.
 */
import { MODULE_ID } from '../module-id';
import type { DoorState, DoorType, LightDoc, TileDoc, WallDoc } from '../tools/documents';
import type { LightCreateData, TileCreateData, WallCreateData } from './boundary';

/** `CONST.WALL_DOOR_TYPES` (stable across v13 and v14). */
const DOOR_TYPES: Record<DoorType, number> = { none: 0, door: 1, secret: 2 };

/** `CONST.WALL_DOOR_STATES`. */
const DOOR_STATES: Record<DoorState, number> = { closed: 0, open: 1, locked: 2 };

/** `CONST.EDGE_SENSE_TYPES` (v14) / `WALL_SENSE_TYPES` (v13): NONE and NORMAL. */
const SENSE_NONE = 0;
const SENSE_NORMAL = 20;

/** `CONST.WALL_MOVEMENT_TYPES`: NONE and NORMAL. */
const MOVE_NONE = 0;
const MOVE_NORMAL = 20;

export interface SceneGrid {
    /** Px per grid square. */
    readonly size: number;
    /** Scene distance units per grid square. */
    readonly distance: number;
}

function sense(blocks: boolean): number {
    return blocks ? SENSE_NORMAL : SENSE_NONE;
}

export function wallCreateData(wall: WallDoc): WallCreateData {
    return {
        c: [wall.a.x, wall.a.y, wall.b.x, wall.b.y],
        door: DOOR_TYPES[wall.door],
        ds: DOOR_STATES[wall.doorState],
        sight: sense(wall.blocks.sight),
        light: sense(wall.blocks.light),
        sound: sense(wall.blocks.sound),
        move: wall.blocks.movement ? MOVE_NORMAL : MOVE_NONE,
    };
}

/** Scene px to scene distance units (a light's radius is measured in the scene's distance units). */
export function pxToDistance(px: number, grid: SceneGrid): number {
    return grid.size > 0 ? (px / grid.size) * grid.distance : 0;
}

export function lightCreateData(light: LightDoc, grid: SceneGrid): LightCreateData {
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
    };
}

export function tileCreateData(tile: TileDoc): TileCreateData {
    return {
        texture: { src: tile.src },
        x: tile.x,
        y: tile.y,
        width: tile.width,
        height: tile.height,
        rotation: tile.rotation,
        elevation: tile.elevation,
        flags: { [MODULE_ID]: { featureId: tile.featureId } },
    };
}
