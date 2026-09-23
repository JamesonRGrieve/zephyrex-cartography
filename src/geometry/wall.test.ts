// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { Point } from './spline';
import { nearestSegment, perimeterSegments } from './wall';

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

describe('nearestSegment', () => {
    const square: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
    ];

    it('finds the closest perimeter edge to a point', () => {
        // Just inside the top edge (segment 0: (0,0)→(10,0)).
        expect(nearestSegment({ x: 5, y: 1 }, square).index).toBe(0);
        // Near the right edge (segment 1: (10,0)→(10,10)).
        expect(nearestSegment({ x: 9, y: 5 }, square).index).toBe(1);
    });

    it('returns index −1 for no segments', () => {
        expect(nearestSegment({ x: 0, y: 0 }, [])).toEqual({ index: -1, distance: Number.POSITIVE_INFINITY });
    });
});
