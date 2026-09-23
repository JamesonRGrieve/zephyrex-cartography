// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { Point } from './spline';
import { perimeterSegments } from './wall';

describe('perimeterSegments', () => {
    it('produces one segment per edge of a closed polygon, including the closing edge', () => {
        const square: Point[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
        ];
        const segs = perimeterSegments(square);
        expect(segs).toHaveLength(4);
        expect(segs[0]).toEqual({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });
        // closing edge: last vertex back to the first
        expect(segs[3]).toEqual({ a: { x: 0, y: 10 }, b: { x: 0, y: 0 } });
    });

    it('is empty for degenerate input', () => {
        expect(perimeterSegments([])).toEqual([]);
        expect(perimeterSegments([{ x: 1, y: 1 }])).toEqual([]);
    });
});
