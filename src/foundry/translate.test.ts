// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { BLOCKS_ALL } from '../tools/documents';
import { doorStateFromDs, lightCreateData, pxToDistance, tileCreateData, wallCreateData } from './translate';

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
        expect(data.door).toBe(2);
        expect(data.ds).toBe(2);
        expect(data.sight).toBe(0);
        expect(data.light).toBe(0);
        expect(data.sound).toBe(20);
        expect(data.move).toBe(20);
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
                { x: 1, y: 2, dim: 400, bright: 200, color: '#ff0000', angle: 90, rotation: 45, animation: { type: 'torch' }, elevation: 3, level: null },
                GRID,
            ),
        ).toEqual({ x: 1, y: 2, elevation: 3, rotation: 45, config: { dim: 20, bright: 10, color: '#ff0000', angle: 90, animation: { type: 'torch' } } });
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
    it('writes the texture, geometry and the owning feature flag', () => {
        expect(tileCreateData({ src: 'a.png', x: 1, y: 2, width: 3, height: 4, rotation: 90, elevation: 5, level: null, featureId: 'f1' })).toEqual({
            texture: { src: 'a.png' },
            x: 1,
            y: 2,
            width: 3,
            height: 4,
            rotation: 90,
            elevation: 5,
            flags: { 'zephyrex-cartography': { featureId: 'f1' } },
        });
    });
});
