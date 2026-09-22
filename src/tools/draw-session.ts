// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * In-progress drawing state: accumulates a click or freehand point stream and
 * exposes the simplified control points. Brush-agnostic (paths and regions
 * share it); the controller turns the points into the committed feature.
 */
import { simplify, type Point } from '../geometry/spline';

export type DrawMode = 'click' | 'freehand';

/** RDP epsilon (scene px) applied to a freehand stream before committing. */
const FREEHAND_EPSILON = 4;

export class DrawSession {
    private readonly raw: Point[] = [];

    constructor(public readonly mode: DrawMode) {}

    addPoint(p: Point): void {
        this.raw.push({ x: p.x, y: p.y });
    }

    get pointCount(): number {
        return this.raw.length;
    }

    get points(): readonly Point[] {
        return this.raw;
    }

    /** RDP-simplified for freehand; verbatim for click. */
    simplified(): Point[] {
        return this.mode === 'freehand' ? simplify(this.raw, FREEHAND_EPSILON) : [...this.raw];
    }
}
