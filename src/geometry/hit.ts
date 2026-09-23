// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Pure point-vs-shape hit tests: is a cursor inside a filled polygon, and how
 * far is it from a polyline. These drive click-to-select and the eraser tool.
 * No Foundry / PIXI dependency — unit-tested like the rest of the geometry core.
 */
import { distance, distanceToSegment, type Point } from './spline';

/**
 * Even-odd ray-cast: is `pt` inside the closed polygon given as a flat
 * `[x0, y0, x1, y1, …]` array (the shape {@link ribbonOutline} / region outline
 * produce)? Polygons of fewer than 3 vertices are never hit.
 */
export function pointInPolygon(pt: Point, polygon: readonly number[]): boolean {
    const n = Math.floor(polygon.length / 2);
    if (n < 3) {
        return false;
    }
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
        const xi = polygon[i * 2] ?? 0;
        const yi = polygon[i * 2 + 1] ?? 0;
        const xj = polygon[j * 2] ?? 0;
        const yj = polygon[j * 2 + 1] ?? 0;
        // The (yi > y) !== (yj > y) guard ensures yj − yi ≠ 0 before the divide.
        const crosses = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
        if (crosses) {
            inside = !inside;
        }
    }
    return inside;
}

/** Nearest control point in `points` to `pt`: its index (−1 if none) and distance. */
export function nearestVertex(pt: Point, points: readonly Point[]): { index: number; distance: number } {
    let index = -1;
    let min = Number.POSITIVE_INFINITY;
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (!p) {
            continue;
        }
        const d = distance(pt, p);
        if (d < min) {
            min = d;
            index = i;
        }
    }
    return { index, distance: min };
}

/** Shortest distance from `pt` to the polyline through `points` (∞ if empty). */
export function distanceToPolyline(pt: Point, points: readonly Point[]): number {
    if (points.length === 0) {
        return Number.POSITIVE_INFINITY;
    }
    const only = points[0];
    if (points.length === 1 && only) {
        return distance(pt, only);
    }
    let min = Number.POSITIVE_INFINITY;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (!a || !b) {
            continue;
        }
        min = Math.min(min, distanceToSegment(pt, a, b));
    }
    return min;
}
