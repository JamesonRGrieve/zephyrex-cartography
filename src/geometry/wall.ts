// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Perimeter → wall-segment geometry for structure mapping. A room's boundary
 * polygon becomes the set of edge segments its walls follow (used both to render
 * textured wall ribbons and to emit Foundry WallDocuments). Pure and
 * unit-tested; the closing edge (last → first) is included.
 */
import type { Point } from './spline';

export interface Segment {
    readonly a: Point;
    readonly b: Point;
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
