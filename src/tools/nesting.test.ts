// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { drawOrder, nestingDepth, roomContains } from './nesting';
import { makeRegion } from './region';
import { makeRoom, type RoomFeature } from './room';

function square(id: string, x: number, size: number, level: string | null = null): RoomFeature {
    const room = makeRoom(id, 'dirt', [
        { x, y: x },
        { x: x + size, y: x },
        { x: x + size, y: x + size },
        { x, y: x + size },
    ]);
    if (!room) {
        throw new Error('fixture');
    }
    return { ...room, level };
}

const hall = square('hall', 0, 400);
const closet = square('closet', 100, 100);
const shelf = square('shelf', 120, 20);
const annex = square('annex', 500, 100);

describe('room nesting', () => {
    it('detects containment on the same level only', () => {
        expect(roomContains(hall, closet)).toBe(true);
        expect(roomContains(closet, hall)).toBe(false);
        expect(roomContains(hall, annex)).toBe(false);
        expect(roomContains(hall, hall)).toBe(false);
        expect(roomContains(hall, square('upstairs', 100, 100, 'L2'))).toBe(false);
    });

    it('counts how deep a room is nested', () => {
        const rooms = [hall, closet, shelf, annex];
        expect([hall, closet, shelf, annex].map((r) => nestingDepth(r, rooms))).toEqual([0, 1, 2, 0]);
    });

    it('draws nested rooms after their containers, keeping everything else in place', () => {
        const lake = makeRegion('lake', 'water', [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
        ]);
        if (!lake) {
            throw new Error('fixture');
        }
        const order = drawOrder([shelf, lake, closet, hall, annex]).map((f) => f.id);
        expect(order).toEqual(['hall', 'lake', 'annex', 'closet', 'shelf']);
    });
});
