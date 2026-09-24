// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Recognising a polygon that is a rectangle, axis-aligned or rotated, so it
 * can be handed to Foundry as a native rectangle shape instead of a polygon.
 * Collinear and repeated vertices (a room edge split for a door) are ignored.
 * Pure and unit-tested.
 */
import type { Point } from './spline';

/** A rectangle by its centre, size and rotation (degrees clockwise, the first edge's direction). */
export interface OrientedRectangle {
    readonly centre: Point;
    readonly width: number;
    readonly height: number;
    readonly rotation: number;
}

/**
 * A point of a box given as fractions of its size (0,0 its top-left, 1,1 its
 * bottom-right, unrotated), in scene terms with the box's rotation about its
 * centre applied.
 */
export function boxPoint(box: OrientedRectangle, fraction: Point): Point {
    const rad = (box.rotation * Math.PI) / DEGREES_PER_HALF_TURN;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const lx = (fraction.x - HALF) * box.width;
    const ly = (fraction.y - HALF) * box.height;
    return { x: box.centre.x + lx * cos - ly * sin, y: box.centre.y + lx * sin + ly * cos };
}

/** A box's four corners, clockwise from top-left, turned about its centre. */
export function boxCorners(box: OrientedRectangle): Point[] {
    return [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
    ].map((fraction) => boxPoint(box, fraction));
}

const HALF = 0.5;
const DEGREES_PER_HALF_TURN = 180;

/** How far from exact a right angle or an equal side may be, relative to the sides' lengths. */
const TOLERANCE = 1e-6;

const DEGREES_PER_RADIAN = DEGREES_PER_HALF_TURN / Math.PI;

function cross(o: Point, a: Point, b: Point): number {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** The polygon's corners: its vertices less repeats and those lying on a straight run. */
export function corners(points: readonly Point[]): Point[] {
    const distinct = points.filter((p, i) => {
        const prev = points[(i - 1 + points.length) % points.length];
        return p.x !== prev?.x || p.y !== prev.y;
    });
    return distinct.filter((p, i) => {
        const prev = distinct[(i - 1 + distinct.length) % distinct.length];
        const next = distinct[(i + 1) % distinct.length];
        if (!prev || !next) {
            return true;
        }
        const scale = Math.hypot(p.x - prev.x, p.y - prev.y) * Math.hypot(next.x - p.x, next.y - p.y);
        return Math.abs(cross(prev, p, next)) > TOLERANCE * scale;
    });
}

/** `points` as an oriented rectangle, or null when they are not one. */
export function rectangleOf(points: readonly Point[]): OrientedRectangle | null {
    const found = corners(points);
    const [a, b, c, d] = found;
    if (found.length !== 4 || a === undefined || b === undefined || c === undefined || d === undefined) {
        return null;
    }
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const bc = { x: c.x - b.x, y: c.y - b.y };
    const width = Math.hypot(ab.x, ab.y);
    const height = Math.hypot(bc.x, bc.y);
    const square = width * height;
    // A parallelogram whose first corner is square is a rectangle.
    const parallelogram = Math.abs(a.x + c.x - b.x - d.x) <= TOLERANCE * (width + height) && Math.abs(a.y + c.y - b.y - d.y) <= TOLERANCE * (width + height);
    if (square === 0 || !parallelogram || Math.abs(ab.x * bc.x + ab.y * bc.y) > TOLERANCE * square) {
        return null;
    }
    return {
        centre: { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 },
        width,
        height,
        rotation: Math.atan2(ab.y, ab.x) * DEGREES_PER_RADIAN,
    };
}
