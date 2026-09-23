// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { catalogStamps } from '../canvas/test-fakes';
import { doorOpenings, isDoorStamp, snapDoorToRooms, stampDoorState } from './doors';
import { planDocuments } from './plan';
import { makeRoom } from './room';
import { makeStamp, stampDoorAxis, type StampFeature } from './stamp';

const [door, crate] = catalogStamps([
    {
        id: 'door',
        name: 'Door',
        category: 'Doors',
        scale: 'interior',
        perspective: 'top-down',
        door: { type: 'secret' },
        variants: [
            { state: 'shut', image: 'shut.png', width: 100, height: 20, doorState: 'locked' },
            { state: 'ajar', image: 'ajar.png', width: 100, height: 20 },
        ],
    },
    {
        id: 'crate',
        name: 'Crate',
        category: 'Storage',
        scale: 'interior',
        perspective: 'top-down',
        variants: [{ state: 'x', image: 'c.png', width: 100, height: 100 }],
    },
]);

function place(stampDef: typeof door, x: number, y: number, extra: { rotation?: number; variant?: number } = {}): StampFeature {
    if (!stampDef) {
        throw new Error('missing fixture');
    }
    return makeStamp('d1', stampDef, { stamp: stampDef.key, x, y, ...extra }, 100);
}

const room = makeRoom('r1', 'dirt', [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 300 },
    { x: 0, y: 300 },
]);
const rooms = room ? [room] : [];

describe('door stamps', () => {
    it('recognise doors, their state and their axis', () => {
        const d = place(door, 200, 0);
        expect(isDoorStamp(d)).toBe(true);
        expect(isDoorStamp(place(crate, 0, 0))).toBe(false);
        expect(stampDoorState(d)).toBe('locked');
        expect(stampDoorState(place(door, 200, 0, { variant: 1 }))).toBe('closed');
        expect(stampDoorAxis(d)).toEqual({ a: { x: 150, y: 0 }, b: { x: 250, y: 0 } });
        expect(doorOpenings([d, place(crate, 0, 0)])).toEqual([stampDoorAxis(d)]);
    });

    it('take the tall axis of a tall door', () => {
        const tall = { ...place(door, 0, 150), width: 20, height: 100 };
        expect(stampDoorAxis(tall)).toEqual({ a: { x: 0, y: 100 }, b: { x: 0, y: 200 } });
    });

    it('plan their own door wall in the variant state', () => {
        const [wall] = planDocuments(place(door, 200, 0)).walls;
        expect(wall).toMatchObject({ a: { x: 150, y: 0 }, b: { x: 250, y: 0 }, door: 'secret', doorState: 'locked' });
    });
});

describe('snapDoorToRooms', () => {
    it('lands a nearby door on the wall and lays it along the wall', () => {
        const snapped = snapDoorToRooms(place(door, 390, 140), rooms, 50);
        expect(snapped.points).toEqual([{ x: 400, y: 140 }]);
        expect([90, 270]).toContain(snapped.rotation);
    });

    it('keeps the rotation nearest the one it had', () => {
        expect(snapDoorToRooms(place(door, 200, 8, { rotation: 170 }), rooms, 50).rotation).toBe(180);
        expect(snapDoorToRooms(place(door, 200, 8, { rotation: 10 }), rooms, 50).rotation).toBe(0);
    });

    it('leaves a door far from any wall, or a non-door, where it is', () => {
        const far = place(door, 200, 150);
        expect(snapDoorToRooms(far, rooms, 50)).toBe(far);
        const box = place(crate, 395, 140);
        expect(snapDoorToRooms(box, rooms, 50)).toBe(box);
    });
});

describe('room walls around door stamps', () => {
    it('cut an opening where a door stamp sits on the wall', () => {
        const walls = room ? planDocuments(room, { features: [place(door, 200, 0)], levels: [], terrainRegions: false }).walls : [];
        const topWall = walls.filter((w) => w.a.y === 0 && w.b.y === 0);
        expect(topWall.map((w) => [w.a.x, w.b.x])).toEqual([
            [0, 150],
            [250, 400],
        ]);
        expect(walls).toHaveLength(5);
    });

    it('leave walls whole for a door stamp elsewhere', () => {
        expect(room ? planDocuments(room, { features: [place(door, 200, 150)], levels: [], terrainRegions: false }).walls : []).toHaveLength(4);
    });
});
