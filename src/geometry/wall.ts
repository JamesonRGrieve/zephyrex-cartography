// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Perimeter → wall-segment geometry for structure mapping. A room's boundary
 * polygon becomes the set of edge segments its walls follow (used both to render
 * textured wall ribbons and to emit Foundry WallDocuments). Pure and
 * unit-tested; the closing edge (last → first) is included.
 */
import { distanceToSegment, type Point } from './spline';

export interface Segment {
    readonly a: Point;
    readonly b: Point;
}

/** A wall segment plus whether it is a door (drives WallDocument.door at the boundary). */
export interface WallSpec extends Segment {
    readonly door: boolean;
}

/** Edge segments of a closed polygon (n points → n segments, including the closing edge). */
export function perimeterSegments(points: readonly Point[]): Segment[] {
    const n = points.length;
    if (n < 2) {
        return [];
    }
    const out: Segment[] = [];
    for (let i = 0; i < n; i++) {
        const a = points[i];
        const b = points[(i + 1) % n];
        if (a && b) {
            out.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
        }
    }
    return out;
}

/** Average of a polygon's vertices — a good-enough light-placement centre for a room. */
export function centroid(points: readonly Point[]): Point {
    if (points.length === 0) {
        return { x: 0, y: 0 };
    }
    let sx = 0;
    let sy = 0;
    for (const p of points) {
        sx += p.x;
        sy += p.y;
    }
    return { x: sx / points.length, y: sy / points.length };
}

/** Nearest perimeter segment of a closed polygon to `pt`: its index (−1 if none) and distance. */
export function nearestSegment(pt: Point, points: readonly Point[]): { index: number; distance: number } {
    const segs = perimeterSegments(points);
    let index = -1;
    let min = Number.POSITIVE_INFINITY;
    for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (!s) {
            continue;
        }
        const d = distanceToSegment(pt, s.a, s.b);
        if (d < min) {
            min = d;
            index = i;
        }
    }
    return { index, distance: min };
}
