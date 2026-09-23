// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Rooms — the structure-mapping primitive: a grid-snapped, closed floor area of
 * a single material. Rendered as a crisp-edged floor fill (walls, added in a
 * later phase, cover the boundary — so no feathering). The floor material reuses
 * the biome texture set for now; a dedicated interior floor-material set
 * (wood/stone/tile) is a follow-up. Model + defensive parser + edit constructor.
 * Pure and unit-tested.
 */
import type { Point } from '../geometry/spline';
import { perimeterSegments, type WallSpec } from '../geometry/wall';
import { isPoint, isRecord } from './path';
import { isBiomeKind, type BiomeKind } from './region';

/** Default floor material for a freshly drawn room. */
export const DEFAULT_FLOOR: BiomeKind = 'dirt';

export interface RoomFeature {
    readonly type: 'room';
    readonly id: string;
    /** Floor material (reuses the biome texture set). */
    readonly floor: BiomeKind;
    /** Grid-snapped boundary control points (>= 3). */
    readonly points: Point[];
    /** Perimeter segment indices that are doors (Foundry door walls). */
    readonly doors: number[];
    /** Ids of the native Foundry WallDocuments this room generated (for lifecycle sync). */
    readonly wallIds: string[];
    /** Ids of the native Foundry AmbientLightDocuments this room generated. */
    readonly lightIds: string[];
}

/** Build a committed room from a boundary point stream, or null if fewer than 3 points. */
export function makeRoom(id: string, floor: BiomeKind, points: readonly Point[]): RoomFeature | null {
    if (points.length < 3) {
        return null;
    }
    return { type: 'room', id, floor, points: points.map((p) => ({ x: p.x, y: p.y })), doors: [], wallIds: [], lightIds: [] };
}

/** Rebuild a room with new boundary points (edit ops), preserving floor + doors + wall links, or null if < 3. */
export function withRoomPoints(room: RoomFeature, points: readonly Point[]): RoomFeature | null {
    if (points.length < 3) {
        return null;
    }
    // A closed polygon of n points has n perimeter segments; drop door indices that no longer exist.
    const doors = room.doors.filter((d) => d < points.length);
    return { ...room, points: points.map((p) => ({ x: p.x, y: p.y })), doors };
}

/** Record the ids of the Foundry walls this room generated. */
export function withRoomWalls(room: RoomFeature, wallIds: readonly string[]): RoomFeature {
    return { ...room, wallIds: [...wallIds] };
}

/** Record the ids of the Foundry ambient lights this room generated. */
export function withRoomLights(room: RoomFeature, lightIds: readonly string[]): RoomFeature {
    return { ...room, lightIds: [...lightIds] };
}

/** Set which perimeter segments are doors. */
export function withRoomDoors(room: RoomFeature, doors: readonly number[]): RoomFeature {
    return { ...room, doors: [...doors] };
}

/** The room's perimeter walls, each flagged as a door or a plain wall. */
export function roomWalls(room: RoomFeature): WallSpec[] {
    const doors = new Set(room.doors);
    return perimeterSegments(room.points).map((s, i) => ({ a: s.a, b: s.b, door: doors.has(i) }));
}

// eslint-disable-next-line no-restricted-syntax -- boundary: parses one untyped scene-flag entry, validating shape and returning a narrow RoomFeature or null
export function parseRoom(v: unknown): RoomFeature | null {
    if (!isRecord(v)) {
        return null;
    }
    if (v['type'] !== 'room' || typeof v['id'] !== 'string' || !isBiomeKind(v['floor'])) {
        return null;
    }
    const points = Array.isArray(v['points']) ? v['points'].filter(isPoint) : [];
    if (points.length < 3) {
        return null;
    }
    const doors = Array.isArray(v['doors']) ? v['doors'].filter((n): n is number => typeof n === 'number') : [];
    const wallIds = Array.isArray(v['wallIds']) ? v['wallIds'].filter((s): s is string => typeof s === 'string') : [];
    const lightIds = Array.isArray(v['lightIds']) ? v['lightIds'].filter((s): s is string => typeof s === 'string') : [];
    return { type: 'room', id: v['id'], floor: v['floor'], points: points.map((p) => ({ x: p.x, y: p.y })), doors, wallIds, lightIds };
}
