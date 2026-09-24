// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { BLOCKS_ALL } from './documents';
import { LIQUID_LOOKS, makePath } from './path';
import { NO_PLAN, planDocuments } from './plan';
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
        const walled = makePath('p', 'river', pts, 10, 'window', LIQUID_LOOKS.water);
        const unwalled = makePath('q', 'road', pts, 10, null, LIQUID_LOOKS.water);
        const walls = walled ? planDocuments(walled).walls : [];
        expect(walls.length).toBeGreaterThan(1);
        // Foundry's window: seen and lit through within two squares, fading.
        expect(walls[0]).toMatchObject({ blocks: { sight: 'proximity', movement: true }, threshold: { sight: 2, attenuation: true } });
        expect(unwalled ? planDocuments(unwalled).walls : null).toEqual([]);
    });

    it('plans nothing for terrain regions', () => {
        const region = makeRegion('g', 'grassland', square);
        expect(region ? planDocuments(region) : null).toEqual(NO_PLAN);
    });

    it('gives painted ground with effects its region, the effects after any movement cost', () => {
        const region = makeRegion('g', 'marsh', square);
        const dark = { kind: 'darkness', mode: 'darken', modifier: 0.5 } as const;
        const plan = region ? planDocuments({ ...region, effects: [dark] }) : null;
        expect(plan?.regions).toEqual([expect.objectContaining({ label: { kind: 'terrain', biome: 'marsh' }, behaviour: null, effects: [dark] })]);
        const mire = region ? planDocuments({ ...region, movementCost: 2, effects: [dark] }) : null;
        expect(mire?.regions[0]).toMatchObject({ behaviour: { kind: 'terrain', difficulties: { walk: 2 } }, effects: [dark] });
    });

    it('gives a room with difficult ground or effects a region over its floor, and a plain room none', () => {
        const room = makeRoom('r', 'dirt', square);
        expect(room ? planDocuments(room).regions : null).toEqual([]);
        const rubble = room ? planDocuments({ ...room, movementCost: 3 }) : null;
        expect(rubble?.regions).toEqual([
            {
                id: null,
                label: { kind: 'room' },
                polygon: square,
                bottom: null,
                top: null,
                level: null,
                spans: [],
                behaviour: { kind: 'terrain', difficulties: { walk: 3 } },
            },
        ]);
        const dim = room ? planDocuments({ ...room, effects: [{ kind: 'suppressWeather' }] }) : null;
        expect(dim?.regions).toEqual([expect.objectContaining({ label: { kind: 'room' }, behaviour: null, effects: [{ kind: 'suppressWeather' }] })]);
    });
});
