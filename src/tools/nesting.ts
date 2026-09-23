// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Room nesting: a room drawn inside another (a closet in a hall, a vault in a
 * keep) renders above the room containing it, and is picked before it, in
 * whatever order the two were drawn. Nesting is derived from geometry on
 * demand rather than stored, so it can never go stale as rooms are edited.
 * Pure and unit-tested.
 */
import { pointInPolygon } from '../geometry/hit';
import type { Feature } from './feature';
import type { RoomFeature } from './room';

function flat(room: RoomFeature): number[] {
    return room.points.flatMap((p) => [p.x, p.y]);
}

/** Does `outer` contain every vertex of `inner`? (Both on the same level.) */
export function roomContains(outer: RoomFeature, inner: RoomFeature): boolean {
    if (outer.id === inner.id || outer.level !== inner.level) {
        return false;
    }
    const polygon = flat(outer);
    return inner.points.every((p) => pointInPolygon(p, polygon));
}

/** How many rooms contain `room`: 0 for a top-level room, 1 for a room in a room, and so on. */
export function nestingDepth(room: RoomFeature, rooms: readonly RoomFeature[]): number {
    return rooms.filter((outer) => roomContains(outer, room)).length;
}

/**
 * Features in drawing order: every feature keeps its place, except that the
 * slots held by rooms are refilled shallowest-first (ties keep their original
 * order), so a nested room always draws after the rooms containing it.
 */
export function drawOrder(features: readonly Feature[]): Feature[] {
    const rooms = features.filter((f): f is RoomFeature => f.type === 'room');
    const byDepth = rooms
        .map((room, i) => ({ room, i, depth: nestingDepth(room, rooms) }))
        .sort((a, b) => a.depth - b.depth || a.i - b.i)
        .map((entry) => entry.room);
    let next = 0;
    return features.map((f) => {
        if (f.type !== 'room') {
            return f;
        }
        const room = byDepth[next] ?? f;
        next += 1;
        return room;
    });
}
