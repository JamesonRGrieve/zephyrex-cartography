// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DEFAULT_FLOOR, makeRoom, parseRoom, roomWalls, withRoomDoors, withRoomLights, withRoomPoints, withRoomWalls } from './room';

const pts = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
];

describe('makeRoom', () => {
    it('builds a room from >= 3 points with no wall links yet', () => {
        const r = makeRoom('r', DEFAULT_FLOOR, pts);
        expect(r?.type).toBe('room');
        expect(r?.floor).toBe(DEFAULT_FLOOR);
        expect(r?.points).toHaveLength(4);
        expect(r?.wallIds).toEqual([]);
        expect(r?.lightIds).toEqual([]);
    });

    it('returns null for fewer than three points', () => {
        expect(
            makeRoom('r', 'stone' as never, [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
            ]),
        ).toBeNull();
    });
});

describe('withRoomPoints', () => {
    it('rebuilds with new points, preserving floor', () => {
        const r = makeRoom('r', 'rock', pts);
        expect(r).not.toBeNull();
        const shrunk = r ? withRoomPoints(r, pts.slice(0, 3)) : null;
        expect(shrunk?.points).toHaveLength(3);
        expect(shrunk?.floor).toBe('rock');
        expect(r ? withRoomPoints(r, pts.slice(0, 2)) : 'x').toBeNull();
    });
});

describe('doors + roomWalls', () => {
    it('flags door segments in the generated walls', () => {
        const r = makeRoom('r', 'dirt', pts); // 4 points → 4 perimeter segments
        const withDoor = r ? withRoomDoors(r, [1]) : null;
        const walls = withDoor ? roomWalls(withDoor) : [];
        expect(walls).toHaveLength(4);
        expect(walls[1]?.door).toBe(true);
        expect(walls[0]?.door).toBe(false);
    });

    it('drops door indices that no longer exist when the room shrinks', () => {
        const r = makeRoom('r', 'dirt', pts);
        const withDoor = r ? withRoomDoors(r, [3]) : null; // door on the 4th segment
        const shrunk = withDoor ? withRoomPoints(withDoor, pts.slice(0, 3)) : null; // now 3 segments
        expect(shrunk?.doors).toEqual([]);
    });
});

describe('withRoomWalls', () => {
    it('records the generated wall ids', () => {
        const r = makeRoom('r', 'dirt', pts);
        expect(r).not.toBeNull();
        const walled = r ? withRoomWalls(r, ['w0', 'w1', 'w2', 'w3']) : null;
        expect(walled?.wallIds).toEqual(['w0', 'w1', 'w2', 'w3']);
        // Re-editing points preserves the wall links.
        const moved = walled ? withRoomPoints(walled, pts.slice(0, 3)) : null;
        expect(moved?.wallIds).toEqual(['w0', 'w1', 'w2', 'w3']);
    });

    it('records the generated light ids', () => {
        const r = makeRoom('r', 'dirt', pts);
        const lit = r ? withRoomLights(r, ['L0']) : null;
        expect(lit?.lightIds).toEqual(['L0']);
        // Wall + light links coexist and survive a points edit.
        const both = lit ? withRoomWalls(lit, ['w0']) : null;
        const moved = both ? withRoomPoints(both, pts.slice(0, 3)) : null;
        expect(moved?.lightIds).toEqual(['L0']);
        expect(moved?.wallIds).toEqual(['w0']);
    });
});

describe('parseRoom', () => {
    it('parses a valid room and its wall ids', () => {
        const r = parseRoom({ type: 'room', id: 'a', floor: 'sand', points: pts, wallIds: ['w0', 'w1'] });
        expect(r?.floor).toBe('sand');
        expect(r?.points).toHaveLength(4);
        expect(r?.wallIds).toEqual(['w0', 'w1']);
    });

    it('defaults wall ids to empty when absent', () => {
        expect(parseRoom({ type: 'room', id: 'a', floor: 'sand', points: pts })?.wallIds).toEqual([]);
    });

    it('parses door indices', () => {
        expect(parseRoom({ type: 'room', id: 'a', floor: 'dirt', points: pts, doors: [0, 2] })?.doors).toEqual([0, 2]);
    });

    it('rejects non-rooms, unknown floors, and too-few points', () => {
        expect(parseRoom({ type: 'region', id: 'x' })).toBeNull();
        expect(parseRoom({ type: 'room', id: 'y', floor: 'quicksand', points: pts })).toBeNull();
        expect(parseRoom({ type: 'room', id: 'z', floor: 'dirt', points: pts.slice(0, 2) })).toBeNull();
    });
});
