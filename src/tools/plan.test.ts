// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { BLOCKS_ALL } from './documents';
import { makePath } from './path';
import { planDocuments } from './plan';
import { makeRegion } from './region';
import { makeRoom, NEW_DOOR, withRoomDoor } from './room';

const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
];

describe('planDocuments', () => {
    it('plans perimeter walls and a centre light for a room', () => {
        const room = makeRoom('r', 'dirt', square);
        const plan = room ? planDocuments(withRoomDoor(room, 2, { ...NEW_DOOR, type: 'secret', state: 'locked' })) : null;
        expect(plan?.walls).toHaveLength(4);
        expect(plan?.walls.map((w) => w.door)).toEqual(['none', 'none', 'secret', 'none']);
        expect(plan?.walls[2]?.doorState).toBe('locked');
        expect(plan?.walls.map((w) => w.segment)).toEqual([0, 1, 2, 3]);
        expect(plan?.lights).toHaveLength(1);
        expect(plan?.lights[0]?.x).toBe(50);
        expect(plan?.tiles).toEqual([]);
    });

    it('gives a room’s walls its wall kind, while its doors block everything when shut', () => {
        const room = makeRoom('r', 'dirt', square, null, 'window');
        const plan = room ? planDocuments(withRoomDoor(room, 2, NEW_DOOR)) : null;
        const [wall, , door] = plan?.walls ?? [];
        expect(wall).toMatchObject({
            door: 'none',
            blocks: { sight: 'proximity', light: 'proximity', sound: 'normal', movement: true },
            threshold: { light: 2, sight: 2, attenuation: true },
        });
        expect(door).toMatchObject({ door: 'door', blocks: BLOCKS_ALL });
        expect(door).not.toHaveProperty('threshold');
    });

    it('plans centerline walls only for a path that asks for them', () => {
        const pts = [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
        ];
        const walled = makePath('p', 'river', pts, 10, true);
        const unwalled = makePath('q', 'road', pts, 10, false);
        expect(walled ? planDocuments(walled).walls.length : 0).toBeGreaterThan(1);
        expect(unwalled ? planDocuments(unwalled).walls : null).toEqual([]);
    });

    it('plans nothing for terrain regions', () => {
        const region = makeRegion('g', 'grassland', square);
        expect(region ? planDocuments(region) : null).toEqual({ walls: [], lights: [], tiles: [], regions: [], sounds: [] });
    });
});
