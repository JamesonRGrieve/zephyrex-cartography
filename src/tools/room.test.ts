// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { NO_DOCS } from './documents';
import { withDocs } from './feature';
import { DEFAULT_FLOOR, makeRoom, parseRoom, roomLight, roomWalls, withRoomDoors, withRoomPoints } from './room';

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
        expect(r?.docs).toEqual(NO_DOCS);
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

describe('document links', () => {
    it('survive a points edit', () => {
        const r = makeRoom('r', 'dirt', pts);
        const linked = r ? withDocs(r, { walls: ['w0'], lights: ['L0'], tiles: [], regions: [] }) : null;
        const moved = linked ? withRoomPoints(linked, pts.slice(0, 3)) : null;
        expect(moved?.docs).toEqual({ walls: ['w0'], lights: ['L0'], tiles: [], regions: [] });
    });
});

describe('roomLight', () => {
    it('centres on the vertex average and reaches the farthest corner', () => {
        const r = makeRoom('r', 'dirt', pts);
        expect(r ? roomLight(r) : null).toEqual({ x: 50, y: 50, dim: Math.hypot(50, 50), bright: Math.hypot(50, 50) / 2 });
    });
});

describe('parseRoom', () => {
    it('parses a valid room and its document links', () => {
        const r = parseRoom({ type: 'room', id: 'a', floor: 'sand', points: pts, docs: { walls: ['w0', 'w1'], lights: ['L0'] } });
        expect(r?.floor).toBe('sand');
        expect(r?.points).toHaveLength(4);
        expect(r?.docs).toEqual({ walls: ['w0', 'w1'], lights: ['L0'], tiles: [], regions: [] });
    });

    it('reads the legacy flat wallIds / lightIds fields', () => {
        const r = parseRoom({ type: 'room', id: 'a', floor: 'sand', points: pts, wallIds: ['w0', 'w1'], lightIds: ['L0'] });
        expect(r?.docs).toEqual({ walls: ['w0', 'w1'], lights: ['L0'], tiles: [], regions: [] });
    });

    it('defaults document links to empty when absent', () => {
        expect(parseRoom({ type: 'room', id: 'a', floor: 'sand', points: pts })?.docs).toEqual(NO_DOCS);
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
