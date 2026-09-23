// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Rooms: the structure-mapping primitive. A room is a grid-snapped, closed
 * floor area of a single material. Its floor renders with a crisp edge,
 * because its walls cover the boundary, so there is no feathering. The floor
 * material reuses the biome texture set for now. Any perimeter segment can be
 * a door, with a Foundry door type and state. Model, defensive parser and edit
 * constructors. Pure and unit-tested.
 */
import { distance, type Point } from '../geometry/spline';
import { centroid, perimeterSegments, type Segment } from '../geometry/wall';
import { NO_DOCS, parseGeneratedDocs, type DoorState, type GeneratedDocs } from './documents';
import { NEW_FEATURE, parseFeatureCommon, type FeatureCommon } from './feature-common';
import { isPoint, isRecord, stringArray } from './guards';
import { isBiomeKind, type BiomeKind } from './region';

/** Default floor material for a freshly drawn room. */
export const DEFAULT_FLOOR: BiomeKind = 'dirt';

/** Bright light covers this fraction of the room light's dim radius. */
const ROOM_BRIGHT_FRACTION = 0.5;

export type RoomDoorType = 'door' | 'secret';

const DOOR_TYPES: readonly RoomDoorType[] = ['door', 'secret'];
const DOOR_STATES: readonly DoorState[] = ['closed', 'open', 'locked'];

/** A door on one of the room's perimeter segments. */
export interface RoomDoor {
    readonly segment: number;
    readonly type: RoomDoorType;
    readonly state: DoorState;
}

/** A door's settings, without the segment it sits on. */
export type DoorSettings = Omit<RoomDoor, 'segment'>;

/** What a new door is: an ordinary, closed door. */
export const NEW_DOOR: DoorSettings = { type: 'door', state: 'closed' };

/** A room; its `points` are the grid-snapped boundary (>= 3), its documents the perimeter walls and centre light. */
export interface RoomFeature extends FeatureCommon {
    readonly type: 'room';
    /** Floor material (reuses the biome texture set). */
    readonly floor: BiomeKind;
    readonly doors: RoomDoor[];
}

/** One perimeter segment of a room, and the door on it if any. */
export interface RoomWall extends Segment {
    readonly segment: number;
    readonly door: RoomDoor | null;
}

/** Build a committed room from a boundary point stream, or null if fewer than 3 points. */
export function makeRoom(id: string, floor: BiomeKind, points: readonly Point[]): RoomFeature | null {
    if (points.length < 3) {
        return null;
    }
    return { type: 'room', id, floor, points: points.map((p) => ({ x: p.x, y: p.y })), doors: [], ...NEW_FEATURE };
}

/** Rebuild a room with new boundary points (edit ops), preserving floor + doors + document links, or null if < 3. */
export function withRoomPoints(room: RoomFeature, points: readonly Point[]): RoomFeature | null {
    if (points.length < 3) {
        return null;
    }
    // A closed polygon of n points has n perimeter segments; drop doors on segments that no longer exist.
    const doors = room.doors.filter((d) => d.segment < points.length);
    return { ...room, points: points.map((p) => ({ x: p.x, y: p.y })), doors };
}

/** The door on `segment`, or null. */
export function doorOn(room: RoomFeature, segment: number): RoomDoor | null {
    return room.doors.find((d) => d.segment === segment) ?? null;
}

/** Put a door with `settings` on `segment` (replacing any there), or clear it with null. */
export function withRoomDoor(room: RoomFeature, segment: number, settings: DoorSettings | null): RoomFeature {
    const others = room.doors.filter((d) => d.segment !== segment);
    return { ...room, doors: settings === null ? others : [...others, { segment, ...settings }].sort((a, b) => a.segment - b.segment) };
}

/** The room's perimeter walls, each with the door on it, if any. */
export function roomWalls(room: RoomFeature): RoomWall[] {
    return perimeterSegments(room.points).map((s, i) => ({ a: s.a, b: s.b, segment: i, door: doorOn(room, i) }));
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

// eslint-disable-next-line no-restricted-syntax -- boundary: parses persisted doors; a bare segment index (the original format) is an ordinary closed door
function parseDoor(v: unknown): RoomDoor | null {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) {
        return { segment: v, ...NEW_DOOR };
    }
    if (!isRecord(v) || typeof v['segment'] !== 'number' || !Number.isInteger(v['segment']) || v['segment'] < 0) {
        return null;
    }
    const { segment, type, state } = v;
    return {
        segment,
        type: DOOR_TYPES.find((t) => t === type) ?? NEW_DOOR.type,
        state: DOOR_STATES.find((s) => s === state) ?? NEW_DOOR.state,
    };
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
    const doors = Array.isArray(v['doors']) ? v['doors'].map(parseDoor).filter((d): d is RoomDoor => d !== null) : [];
    return {
        type: 'room',
        id: v['id'],
        floor: v['floor'],
        points: points.map((p) => ({ x: p.x, y: p.y })),
        doors,
        ...parseFeatureCommon(v),
        docs: roomDocs(v),
    };
}
