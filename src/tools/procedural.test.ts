// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { PATTERN_SIZE, patternOf, patternPixels, proceduralRole } from './procedural';

const RGBA = 4;

function valueAt(pixels: Uint8ClampedArray, x: number, y: number): number {
    return pixels[(y * PATTERN_SIZE + x) * RGBA] ?? -1;
}

describe('procedural textures', () => {
    it('names each pattern as a texture role, and reads it back', () => {
        expect(proceduralRole('ripple')).toBe('procedural.ripple');
        expect(patternOf(proceduralRole('grain'))).toBe('grain');
        expect(['procedural.swirl', 'grain', 'floor.oak'].map(patternOf)).toEqual([null, null, null]);
    });

    it('draws an opaque, near-white greyscale tile with real variation, the same every time', () => {
        for (const pattern of ['ripple', 'grain'] as const) {
            const pixels = patternPixels(pattern);
            expect(pixels).toHaveLength(PATTERN_SIZE * PATTERN_SIZE * RGBA);
            const values = new Set<number>();
            for (let i = 0; i < pixels.length; i += RGBA) {
                expect([pixels[i + 1], pixels[i + 2], pixels[i + 3]]).toEqual([pixels[i], pixels[i], 255]);
                values.add(pixels[i] ?? 0);
            }
            expect(Math.min(...values)).toBeGreaterThanOrEqual(150);
            expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(30);
            expect(patternPixels(pattern)).toEqual(pixels);
        }
    });

    it('tiles seamlessly: each edge runs on into the opposite one', () => {
        const pixels = patternPixels('ripple');
        const last = PATTERN_SIZE - 1;
        for (let i = 0; i < PATTERN_SIZE; i += 1) {
            expect(Math.abs(valueAt(pixels, last, i) - valueAt(pixels, 0, i))).toBeLessThan(40);
            expect(Math.abs(valueAt(pixels, i, last) - valueAt(pixels, i, 0))).toBeLessThan(40);
        }
    });
});
