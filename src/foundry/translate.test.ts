// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { BLOCKS_ALL, type RegionDoc } from '../tools/documents';
import { doorStateFromDs, lightCreateData, pxToDistance, regionCreateData, regionUuid, tileCreateData, tileFrame, wallCreateData } from './translate';

const GRID = { size: 100, distance: 5 };

const BLOCKS_WALL = { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, door: 'none' as const, doorState: 'closed' as const, blocks: BLOCKS_ALL, level: null };

describe('wallCreateData', () => {
    it('translates a plain wall blocking every sense', () => {
        expect(wallCreateData({ a: { x: 0, y: 0 }, b: { x: 10, y: 5 }, door: 'none', doorState: 'closed', blocks: BLOCKS_ALL, level: null }, GRID)).toEqual({
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
        const data = wallCreateData(
            {
                a: { x: 0, y: 0 },
                b: { x: 1, y: 0 },
                door: 'secret',
                doorState: 'locked',
                blocks: { sight: 'none', movement: true, light: 'none', sound: 'normal' },
                level: null,
            },
            GRID,
        );
        expect(data).toMatchObject({ door: 2, ds: 2, sight: 0, light: 0, sound: 20, move: 20 });
    });

    it('translates every sense level, one-way walls and thresholds in scene distance units', () => {
        const data = wallCreateData(
            {
                a: { x: 0, y: 0 },
                b: { x: 1, y: 0 },
                door: 'none',
                doorState: 'closed',
                blocks: { sight: 'limited', movement: false, light: 'proximity', sound: 'distance' },
                direction: 'left',
                threshold: { light: 2, attenuation: true },
                level: null,
            },
            GRID,
        );
        expect(data).toMatchObject({ sight: 10, light: 30, sound: 40, move: 0, dir: 1, threshold: { light: 10, sight: null, sound: null, attenuation: true } });
        expect(wallCreateData({ ...BLOCKS_WALL, direction: 'right' }, GRID).dir).toBe(2);
        expect(wallCreateData(BLOCKS_WALL, GRID)).not.toHaveProperty('dir');
    });

    it('puts a levelled wall on its native Level, and a level-less one on every level', () => {
        const wall = { ...BLOCKS_WALL, level: 'L1' };
        expect(wallCreateData(wall, GRID).levels).toEqual(['L1']);
        expect(wallCreateData({ ...wall, level: null }, GRID).levels).toBeUndefined();
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
                {
                    source: { kind: 'stamp', name: 'Lamp' },
                    x: 1,
                    y: 2,
                    dim: 400,
                    bright: 200,
                    color: '#ff0000',
                    angle: 90,
                    rotation: 45,
                    animation: { type: 'torch' },
                    elevation: 3,
                    level: 'L2',
                },
                GRID,
                'Lamp light',
            ),
        ).toEqual({
            name: 'Lamp light',
            x: 1,
            y: 2,
            elevation: 3,
            rotation: 45,
            config: { dim: 20, bright: 10, color: '#ff0000', angle: 90, animation: { type: 'torch' } },
            levels: ['L2'],
        });
    });

    it('omits absent optional styling and defaults rotation to 0', () => {
        expect(lightCreateData({ source: { kind: 'room' }, x: 0, y: 0, dim: 100, bright: 0, elevation: 0, level: null }, GRID, 'Room light')).toEqual({
            name: 'Room light',
            x: 0,
            y: 0,
            elevation: 0,
            rotation: 0,
            config: { dim: 5, bright: 0 },
        });
    });
});

describe('tileCreateData', () => {
    it('places the tile by its centre anchor, with its level and owning feature flag', () => {
        expect(
            tileCreateData({ name: 'Lamp', src: 'a.png', x: 10, y: 20, width: 30, height: 40, rotation: 90, elevation: 5, level: 'L1', featureId: 'f1' }),
        ).toEqual({
            name: 'Lamp',
            texture: { src: 'a.png', anchorX: 0.5, anchorY: 0.5 },
            x: 25,
            y: 40,
            width: 30,
            height: 40,
            rotation: 90,
            elevation: 5,
            flags: { 'zephyrex-cartography': { featureId: 'f1' } },
            levels: ['L1'],
        });
    });
});

describe('tileFrame', () => {
    it('reads back the top-left the tile was created from', () => {
        const tile = { name: 'Lamp', src: 'a.png', x: 10, y: 20, width: 30, height: 40, rotation: 45, elevation: 0, level: null, featureId: 'f1' };
        expect(tileFrame(tileCreateData(tile))).toEqual({ x: 10, y: 20, width: 30, height: 40, rotation: 45 });
    });

    it('honours any anchor a GM set', () => {
        expect(tileFrame({ x: 100, y: 100, width: 50, height: 20, rotation: 0, texture: { anchorX: 0, anchorY: 1 } })).toEqual({
            x: 100,
            y: 80,
            width: 50,
            height: 20,
            rotation: 0,
        });
    });

    it('rounds a fractional centre to the integer Foundry stores', () => {
        const data = tileCreateData({ name: 'Lamp', src: 'a.png', x: 0, y: 0, width: 5, height: 3, rotation: 0, elevation: 0, level: null, featureId: 'f' });
        expect([data.x, data.y]).toEqual([3, 2]);
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
            locked: true,
            visibility: 0,
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

    it('locks regions drawn from features, but leaves an interior exit for the GM to move', () => {
        const exit: RegionDoc = { id: 'out1', label: { kind: 'exit', scene: 'Town' }, polygon: square, bottom: null, top: null, level: null, teleport: null };
        const [entrance, back] = regionCreateData([{ ...exit, id: 'in1', label: { kind: 'entrance', scene: 'Hab' } }, exit], ['in1', 'out1'], 's', nameOf);
        expect([entrance?.locked, back?.locked]).toEqual([true, false]);
        expect([entrance?.visibility, back?.visibility]).toEqual([0, 0]);
    });
});
