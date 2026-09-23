// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DEFAULT_FLOOR, makeRoom, parseRoom, withRoomPoints, withRoomWalls } from './room';

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

    it('rejects non-rooms, unknown floors, and too-few points', () => {
        expect(parseRoom({ type: 'region', id: 'x' })).toBeNull();
        expect(parseRoom({ type: 'room', id: 'y', floor: 'quicksand', points: pts })).toBeNull();
        expect(parseRoom({ type: 'room', id: 'z', floor: 'dirt', points: pts.slice(0, 2) })).toBeNull();
    });
});
