// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Rooms — the structure-mapping primitive: a grid-snapped, closed floor area of
 * a single material. Rendered as a crisp-edged floor fill (walls, added in a
 * later phase, cover the boundary — so no feathering). The floor material reuses
 * the biome texture set for now; a dedicated interior floor-material set
 * (wood/stone/tile) is a follow-up. Model + defensive parser + edit constructor.
 * Pure and unit-tested.
 */
import { distance, type Point } from '../geometry/spline';
import { centroid, perimeterSegments, type WallSpec } from '../geometry/wall';
import { NO_DOCS, parseGeneratedDocs, type GeneratedDocs } from './documents';
import { isPoint, isRecord, numberArray, stringArray } from './guards';
import { isBiomeKind, type BiomeKind } from './region';

/** Default floor material for a freshly drawn room. */
export const DEFAULT_FLOOR: BiomeKind = 'dirt';

/** Bright light covers this fraction of the room light's dim radius. */
const ROOM_BRIGHT_FRACTION = 0.5;

export interface RoomFeature {
    readonly type: 'room';
    readonly id: string;
    /** Floor material (reuses the biome texture set). */
    readonly floor: BiomeKind;
    /** Grid-snapped boundary control points (>= 3). */
    readonly points: Point[];
    /** Perimeter segment indices that are doors (Foundry door walls). */
    readonly doors: number[];
    /** Native Foundry documents (perimeter walls, centre light) this room generated. */
    readonly docs: GeneratedDocs;
}

/** Build a committed room from a boundary point stream, or null if fewer than 3 points. */
export function makeRoom(id: string, floor: BiomeKind, points: readonly Point[]): RoomFeature | null {
    if (points.length < 3) {
        return null;
    }
    return { type: 'room', id, floor, points: points.map((p) => ({ x: p.x, y: p.y })), doors: [], docs: NO_DOCS };
}

/** Rebuild a room with new boundary points (edit ops), preserving floor + doors + document links, or null if < 3. */
export function withRoomPoints(room: RoomFeature, points: readonly Point[]): RoomFeature | null {
    if (points.length < 3) {
        return null;
    }
    // A closed polygon of n points has n perimeter segments; drop door indices that no longer exist.
    const doors = room.doors.filter((d) => d < points.length);
    return { ...room, points: points.map((p) => ({ x: p.x, y: p.y })), doors };
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

/** The room's centre light: centred on the vertex average, its dim radius reaching the farthest corner. */
export function roomLight(room: RoomFeature): { readonly x: number; readonly y: number; readonly dim: number; readonly bright: number } {
    const c = centroid(room.points);
    const dim = room.points.reduce((max, p) => Math.max(max, distance(c, p)), 0);
    return { x: c.x, y: c.y, dim, bright: dim * ROOM_BRIGHT_FRACTION };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: reads a room's document links, accepting the legacy flat wallIds/lightIds fields
function roomDocs(v: Record<string, unknown>): GeneratedDocs {
    if (v['docs'] !== undefined) {
        return parseGeneratedDocs(v['docs']);
    }
    return { ...NO_DOCS, walls: stringArray(v['wallIds']), lights: stringArray(v['lightIds']) };
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
    return { type: 'room', id: v['id'], floor: v['floor'], points: points.map((p) => ({ x: p.x, y: p.y })), doors: numberArray(v['doors']), docs: roomDocs(v) };
}
