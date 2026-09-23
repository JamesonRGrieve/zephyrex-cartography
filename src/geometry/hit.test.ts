// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { distanceToPolyline, nearestVertex, pointInPolygon } from './hit';
import type { Point } from './spline';

// A unit square 0,0 → 10,0 → 10,10 → 0,10 as a flat outline.
const SQUARE = [0, 0, 10, 0, 10, 10, 0, 10];

describe('pointInPolygon', () => {
    it('is true for a point inside the polygon', () => {
        expect(pointInPolygon({ x: 5, y: 5 }, SQUARE)).toBe(true);
    });

    it('is false for a point outside the polygon', () => {
        expect(pointInPolygon({ x: 15, y: 5 }, SQUARE)).toBe(false);
        expect(pointInPolygon({ x: -1, y: 5 }, SQUARE)).toBe(false);
        expect(pointInPolygon({ x: 5, y: 20 }, SQUARE)).toBe(false);
    });

    it('handles a concave polygon (point in the notch is outside)', () => {
        // An L / notch shape: the cell at (8, 8) sits in the carved-out corner.
        const ell = [0, 0, 10, 0, 10, 5, 5, 5, 5, 10, 0, 10];
        expect(pointInPolygon({ x: 2, y: 2 }, ell)).toBe(true);
        expect(pointInPolygon({ x: 8, y: 8 }, ell)).toBe(false);
    });

    it('is false for degenerate polygons (< 3 vertices)', () => {
        expect(pointInPolygon({ x: 0, y: 0 }, [0, 0, 1, 1])).toBe(false);
        expect(pointInPolygon({ x: 0, y: 0 }, [])).toBe(false);
    });
});

describe('distanceToPolyline', () => {
    const line: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
    ];

    it('is zero on the line', () => {
        expect(distanceToPolyline({ x: 5, y: 0 }, line)).toBe(0);
    });

    it('measures perpendicular distance off the line', () => {
        expect(distanceToPolyline({ x: 5, y: 4 }, line)).toBe(4);
    });

    it('clamps to the nearest endpoint past the ends', () => {
        expect(distanceToPolyline({ x: -3, y: 0 }, line)).toBe(3);
    });

    it('takes the minimum across all segments', () => {
        const bent: Point[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
        ];
        expect(distanceToPolyline({ x: 12, y: 5 }, bent)).toBe(2);
    });

    it('is a point distance for a single-point line and ∞ for empty', () => {
        expect(distanceToPolyline({ x: 3, y: 4 }, [{ x: 0, y: 0 }])).toBe(5);
        expect(distanceToPolyline({ x: 0, y: 0 }, [])).toBe(Number.POSITIVE_INFINITY);
    });
});

describe('nearestVertex', () => {
    const pts: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
    ];

    it('finds the closest control point and its distance', () => {
        expect(nearestVertex({ x: 11, y: 0 }, pts)).toEqual({ index: 1, distance: 1 });
        expect(nearestVertex({ x: 19, y: 3 }, pts).index).toBe(2);
    });

    it('returns index −1 and ∞ for no points', () => {
        expect(nearestVertex({ x: 0, y: 0 }, [])).toEqual({ index: -1, distance: Number.POSITIVE_INFINITY });
    });
});
