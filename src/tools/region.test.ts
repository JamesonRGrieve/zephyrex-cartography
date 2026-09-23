// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { BIOMES, BIOME_STYLES, makeRegion, parseRegion, regionOutline } from './region';

describe('makeRegion', () => {
    it('builds a region from >= 3 points', () => {
        const r = makeRegion('id', 'water', [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 5, y: 10 },
        ]);
        expect(r?.type).toBe('region');
        expect(r?.biome).toBe('water');
        expect(r?.points).toHaveLength(3);
    });

    it('returns null for fewer than three points', () => {
        expect(
            makeRegion('id', 'water', [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
            ]),
        ).toBeNull();
    });
});

describe('parseRegion', () => {
    it('parses a valid region', () => {
        const r = parseRegion({
            type: 'region',
            id: 'a',
            biome: 'forest',
            points: [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 0, y: 1 },
            ],
        });
        expect(r?.biome).toBe('forest');
    });

    it('rejects non-regions and unknown biomes', () => {
        expect(parseRegion({ type: 'path', id: 'x' })).toBeNull();
        expect(
            parseRegion({
                type: 'region',
                id: 'y',
                biome: 'quicksand',
                points: [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 0, y: 1 },
                ],
            }),
        ).toBeNull();
    });
});

describe('regionOutline', () => {
    it('produces a closed fill polygon (even-length, >= 6)', () => {
        const o = regionOutline([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
        ]);
        expect(o.length).toBeGreaterThanOrEqual(6);
        expect(o.length % 2).toBe(0);
    });

    it('exposes a fill colour per biome', () => {
        expect(BIOME_STYLES.water.fill).toBeTypeOf('number');
        expect(BIOME_STYLES.snow.fill).toBeTypeOf('number');
    });
});

describe('BIOMES', () => {
    it('every biome has a fill+alpha style (the maps stay in lockstep)', () => {
        for (const biome of BIOMES) {
            expect(BIOME_STYLES[biome].fill).toBeTypeOf('number');
            expect(BIOME_STYLES[biome].alpha).toBeGreaterThan(0);
        }
    });

    it('includes the extended terrain set', () => {
        for (const biome of ['lava', 'marsh', 'ice', 'ash', 'tundra', 'ocean'] as const) {
            expect(BIOMES).toContain(biome);
        }
    });
});
