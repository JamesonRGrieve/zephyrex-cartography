// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { BLOCKS_ALL, type RegionDoc } from '../tools/documents';
import { doorStateFromDs, lightCreateData, pxToDistance, regionCreateData, regionUuid, tileCreateData, wallCreateData } from './translate';

const GRID = { size: 100, distance: 5 };

describe('wallCreateData', () => {
    it('translates a plain wall blocking every sense', () => {
        expect(wallCreateData({ a: { x: 0, y: 0 }, b: { x: 10, y: 5 }, door: 'none', doorState: 'closed', blocks: BLOCKS_ALL, level: null })).toEqual({
            c: [0, 0, 10, 5],
            door: 0,
            ds: 0,
            sight: 20,
            light: 20,
            sound: 20,
            move: 20,
        });
    });

    it('translates door type, door state and unblocked senses', () => {
        const data = wallCreateData({
            a: { x: 0, y: 0 },
            b: { x: 1, y: 0 },
            door: 'secret',
            doorState: 'locked',
            blocks: { sight: false, movement: true, light: false, sound: true },
            level: null,
        });
        expect(data).toMatchObject({ door: 2, ds: 2, sight: 0, light: 0, sound: 20, move: 20 });
    });

    it('puts a levelled wall on its native Level, and a level-less one on every level', () => {
        const wall = { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, door: 'none' as const, doorState: 'closed' as const, blocks: BLOCKS_ALL, level: 'L1' };
        expect(wallCreateData(wall).levels).toEqual(['L1']);
        expect(wallCreateData({ ...wall, level: null }).levels).toBeUndefined();
    });
});

describe('doorStateFromDs', () => {
    it('maps Foundry door states back, and rejects unknown values', () => {
        expect([0, 1, 2].map(doorStateFromDs)).toEqual(['closed', 'open', 'locked']);
        expect(doorStateFromDs(7)).toBeNull();
    });
});

describe('pxToDistance', () => {
    it('converts px to scene distance units via the grid', () => {
        expect(pxToDistance(250, GRID)).toBe(12.5);
        expect(pxToDistance(250, { size: 0, distance: 5 })).toBe(0);
    });
});

describe('lightCreateData', () => {
    it('converts radii to distance units and passes optional styling through', () => {
        expect(
            lightCreateData(
                { x: 1, y: 2, dim: 400, bright: 200, color: '#ff0000', angle: 90, rotation: 45, animation: { type: 'torch' }, elevation: 3, level: 'L2' },
                GRID,
            ),
        ).toEqual({
            x: 1,
            y: 2,
            elevation: 3,
            rotation: 45,
            config: { dim: 20, bright: 10, color: '#ff0000', angle: 90, animation: { type: 'torch' } },
            levels: ['L2'],
        });
    });

    it('omits absent optional styling and defaults rotation to 0', () => {
        expect(lightCreateData({ x: 0, y: 0, dim: 100, bright: 0, elevation: 0, level: null }, GRID)).toEqual({
            x: 0,
            y: 0,
            elevation: 0,
            rotation: 0,
            config: { dim: 5, bright: 0 },
        });
    });
});

describe('tileCreateData', () => {
    it('writes the texture, geometry, level and the owning feature flag', () => {
        expect(tileCreateData({ src: 'a.png', x: 1, y: 2, width: 3, height: 4, rotation: 90, elevation: 5, level: 'L1', featureId: 'f1' })).toEqual({
            texture: { src: 'a.png' },
            x: 1,
            y: 2,
            width: 3,
            height: 4,
            rotation: 90,
            elevation: 5,
            flags: { 'zephyrex-cartography': { featureId: 'f1' } },
            levels: ['L1'],
        });
    });
});

describe('regionCreateData', () => {
    const square = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
    ];
    const label = { kind: 'stairs' as const, from: 'A', to: ['B'] };
    const stair: RegionDoc[] = [
        { id: null, label, polygon: square, bottom: 0, top: 10, level: 'A', teleport: { targets: [{ plan: 1 }, { plan: 2 }] } },
        { id: null, label, polygon: square, bottom: 10, top: 20, level: 'B', teleport: { targets: [{ plan: 0 }] } },
        { id: null, label, polygon: square, bottom: -10, top: 0, level: 'C', teleport: null },
    ];
    const nameOf = (r: RegionDoc): string => `${r.label.kind} ${r.level ?? ''}`;

    it('wires teleports to every destination, relative, with a choice when there are several', () => {
        const [start, end, plain] = regionCreateData(stair, ['r0', 'r1', 'r2'], 's', nameOf);
        expect(start).toEqual({
            _id: 'r0',
            name: 'stairs A',
            shapes: [{ type: 'polygon', points: [0, 0, 10, 0, 10, 10], hole: false }],
            elevation: { bottom: 0, top: 10 },
            behaviors: [{ type: 'teleportToken', system: { destinations: ['Scene.s.Region.r1', 'Scene.s.Region.r2'], placement: 'relative', choice: true } }],
            levels: ['A'],
        });
        expect(end?.behaviors[0]?.system).toEqual({ destinations: ['Scene.s.Region.r0'], placement: 'relative', choice: false });
        expect(plain?.behaviors).toEqual([]);
    });

    it('addresses a region in another scene directly, with an open-ended band', () => {
        const entrance: RegionDoc = {
            id: 'in1',
            label: { kind: 'entrance', scene: 'Hab' },
            polygon: square,
            bottom: null,
            top: null,
            level: null,
            teleport: { targets: [{ scene: 'hab', region: 'out1' }] },
        };
        const [data] = regionCreateData([entrance], ['in1'], 's', nameOf);
        expect(data?.elevation).toEqual({ bottom: null, top: null });
        expect(data?.behaviors[0]?.system).toEqual({ destinations: ['Scene.hab.Region.out1'], placement: 'relative', choice: false });
        expect(regionUuid('a', 'b')).toBe('Scene.a.Region.b');
    });
});
