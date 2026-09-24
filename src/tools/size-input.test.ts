// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { MAX_SIZE_PX, MIN_SIZE_PX, parseSizePx } from './size-input';

describe('parseSizePx', () => {
    it('accepts a number in range, fractions included', () => {
        expect(parseSizePx('40')).toBe(40);
        expect(parseSizePx(' 12.5 ')).toBe(12.5);
        expect(parseSizePx(String(MIN_SIZE_PX))).toBe(MIN_SIZE_PX);
        expect(parseSizePx(String(MAX_SIZE_PX))).toBe(MAX_SIZE_PX);
    });

    it('refuses blanks, non-numbers and sizes out of range', () => {
        expect(['', '  ', 'wide', 'NaN', 'Infinity', '0', '-5', String(MAX_SIZE_PX + 1)].map(parseSizePx)).toEqual([
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
        ]);
    });
});
