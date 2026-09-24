// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DEFAULT_FLOOR_PLAN } from './floor-plan';
import { DEFAULT_GENERATOR_FORM, floorPlanOptions, newSeed, withGeneratorField } from './form';

describe('withGeneratorField', () => {
    it('accepts whole numbers that keep the plan buildable', () => {
        expect(withGeneratorField(DEFAULT_GENERATOR_FORM, 'width', '30')?.width).toBe(30);
        expect(withGeneratorField(DEFAULT_GENERATOR_FORM, 'seed', ' 12345 ')?.seed).toBe(12345);
        expect(withGeneratorField(DEFAULT_GENERATOR_FORM, 'maxRoom', '3')?.maxRoom).toBe(3);
    });

    it('rejects blanks, fractions, out-of-range values and contradictions', () => {
        for (const [field, typed] of [
            ['width', ''],
            ['width', '2.5'],
            ['width', '0'],
            ['width', '201'],
            ['seed', '-1'],
            ['seed', 'abc'],
            ['maxRoom', '2'], // below minRoom 3
            ['minRoom', '17'], // wider than the 16-square height
        ] as const) {
            expect(withGeneratorField(DEFAULT_GENERATOR_FORM, field, typed)).toBeNull();
        }
    });
});

describe('newSeed and floorPlanOptions', () => {
    it('scales a uniform number to a 32-bit seed', () => {
        expect(newSeed(() => 0)).toBe(0);
        expect(newSeed(() => 0.5)).toBe(Math.floor(0.5 * 0xffffffff));
    });

    it('combines the form with the room materials', () => {
        expect(floorPlanOptions(DEFAULT_GENERATOR_FORM, { floor: 'floor.oak', wall: 'wall.brick', wallKind: 'window', ceiling: false })).toEqual({
            ...DEFAULT_FLOOR_PLAN,
            floor: 'floor.oak',
            wall: 'wall.brick',
            wallKind: 'window',
            ceiling: false,
        });
    });
});
