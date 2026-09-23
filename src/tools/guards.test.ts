// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { isPoint, isRecord, numberArray, numberOr, stringArray, stringOrNull } from './guards';

describe('guards', () => {
    it('narrows records and points', () => {
        expect(isRecord({})).toBe(true);
        expect(isRecord(null)).toBe(false);
        expect(isPoint({ x: 1, y: 2 })).toBe(true);
        expect(isPoint({ x: 1 })).toBe(false);
        expect(isPoint(3)).toBe(false);
    });

    it('filters typed arrays', () => {
        expect(numberArray([1, 'a', 2])).toEqual([1, 2]);
        expect(stringArray(['a', 1, 'b'])).toEqual(['a', 'b']);
        expect(numberArray('x')).toEqual([]);
        expect(stringArray(undefined)).toEqual([]);
    });

    it('reads optional scalars with fallbacks', () => {
        expect(numberOr(4, 1)).toBe(4);
        expect(numberOr(Number.NaN, 1)).toBe(1);
        expect(numberOr('4', 1)).toBe(1);
        expect(stringOrNull('a')).toBe('a');
        expect(stringOrNull(1)).toBeNull();
    });
});
