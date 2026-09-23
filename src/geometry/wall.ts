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

/** Where point `p` projects onto the line through `seg`, as a parameter (0 = a, 1 = b), and how far it is from that line. */
function project(seg: Segment, p: Point): { t: number; offset: number } {
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const span = Math.hypot(dx, dy);
    if (span === 0) {
        return { t: 0, offset: Math.hypot(p.x - seg.a.x, p.y - seg.a.y) };
    }
    const t = ((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / (span * span);
    const offset = Math.abs((p.x - seg.a.x) * dy - (p.y - seg.a.y) * dx) / span;
    return { t, offset };
}

function pointAt(seg: Segment, t: number): Point {
    return { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t };
}

/**
 * `seg` with every collinear cut removed: each cut whose endpoints both lie
 * within `tolerance` of the segment's line is an opening. The pieces of the
 * segment outside every opening are returned in order. Cuts that are not
 * collinear leave the segment whole.
 */
export function cutSegment(seg: Segment, cuts: readonly Segment[], tolerance: number): Segment[] {
    const openings: [number, number][] = [];
    for (const cut of cuts) {
        const a = project(seg, cut.a);
        const b = project(seg, cut.b);
        if (a.offset > tolerance || b.offset > tolerance) {
            continue;
        }
        const from = Math.max(0, Math.min(a.t, b.t));
        const to = Math.min(1, Math.max(a.t, b.t));
        if (to > from) {
            openings.push([from, to]);
        }
    }
    openings.sort((p, q) => p[0] - q[0]);
    const pieces: Segment[] = [];
    let cursor = 0;
    for (const [from, to] of openings) {
        if (from > cursor) {
            pieces.push({ a: pointAt(seg, cursor), b: pointAt(seg, from) });
        }
        cursor = Math.max(cursor, to);
    }
    if (cursor < 1) {
        pieces.push({ a: pointAt(seg, cursor), b: pointAt(seg, 1) });
    }
    return pieces;
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
