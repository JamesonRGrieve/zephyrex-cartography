// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { Point } from './spline';
import { centroid, cutSegment, nearestSegment, perimeterSegments, splitSegment } from './wall';

describe('splitSegment', () => {
    it('splits into covered and uncovered stretches in order, merging overlaps', () => {
        const seg = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
        const pieces = splitSegment(
            seg,
            [
                { a: { x: 20, y: 0 }, b: { x: 40, y: 0 } },
                { a: { x: 30, y: 0 }, b: { x: 50, y: 0 } },
            ],
            1,
        );
        expect(pieces.map((p) => [p.a.x, p.b.x, p.covered])).toEqual([
            [0, 20, false],
            [20, 50, true],
            [50, 100, false],
        ]);
    });

    it('covers the whole segment when an overlay spans it', () => {
        const seg = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
        expect(splitSegment(seg, [{ a: { x: -1, y: 0 }, b: { x: 20, y: 0 } }], 1)).toEqual([{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, covered: true }]);
    });
});

describe('cutSegment', () => {
    const seg = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };

    it('leaves the segment whole with no collinear cuts', () => {
        expect(cutSegment(seg, [], 2)).toEqual([seg]);
        expect(cutSegment(seg, [{ a: { x: 40, y: -20 }, b: { x: 60, y: 20 } }], 2)).toEqual([seg]);
    });

    it('opens a gap where a collinear cut lies, in either direction and within tolerance', () => {
        expect(cutSegment(seg, [{ a: { x: 60, y: 1 }, b: { x: 40, y: -1 } }], 2)).toEqual([
            { a: { x: 0, y: 0 }, b: { x: 40, y: 0 } },
            { a: { x: 60, y: 0 }, b: { x: 100, y: 0 } },
        ]);
    });

    it('merges overlapping cuts and clips cuts past the ends', () => {
        const cuts = [
            { a: { x: 10, y: 0 }, b: { x: 30, y: 0 } },
            { a: { x: 20, y: 0 }, b: { x: 40, y: 0 } },
            { a: { x: 90, y: 0 }, b: { x: 150, y: 0 } },
        ];
        expect(cutSegment(seg, cuts, 1)).toEqual([
            { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
            { a: { x: 40, y: 0 }, b: { x: 90, y: 0 } },
        ]);
    });

    it('removes a segment covered entirely, and ignores a degenerate target', () => {
        expect(cutSegment(seg, [{ a: { x: -5, y: 0 }, b: { x: 105, y: 0 } }], 1)).toEqual([]);
        const point = { a: { x: 5, y: 5 }, b: { x: 5, y: 5 } };
        expect(cutSegment(point, [{ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }], 1)).toEqual([point]);
    });
});

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

describe('centroid', () => {
    it('averages the vertices', () => {
        expect(
            centroid([
                { x: 0, y: 0 },
                { x: 10, y: 0 },
                { x: 10, y: 10 },
                { x: 0, y: 10 },
            ]),
        ).toEqual({ x: 5, y: 5 });
    });

    it('is the origin for no points', () => {
        expect(centroid([])).toEqual({ x: 0, y: 0 });
    });
});
