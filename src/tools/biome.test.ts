// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { BIOMES, BIOME_STYLES, isBiomeKind } from './biome';

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

describe('isBiomeKind', () => {
    it('accepts every biome and rejects anything else', () => {
        for (const biome of BIOMES) {
            expect(isBiomeKind(biome)).toBe(true);
        }
        expect(isBiomeKind('quicksand')).toBe(false);
        expect(isBiomeKind(3)).toBe(false);
        expect(isBiomeKind(null)).toBe(false);
    });
});
