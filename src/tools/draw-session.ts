// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * In-progress drawing state: accumulates a click or freehand point stream and
 * finalises it into a committed {@link CartographyPath}. Pure and Foundry-free
 * so the point-capture logic is unit-tested independently of the canvas layer.
 */
import { simplify, type Point } from '../geometry/spline';
import { DEFAULT_HALF_WIDTH, type CartographyPath, type PathKind } from './path';

export type DrawMode = 'click' | 'freehand';

/** RDP epsilon (scene px) applied to a freehand stream before committing. */
const FREEHAND_EPSILON = 4;

export class DrawSession {
    private readonly raw: Point[] = [];

    constructor(public readonly kind: PathKind, public readonly mode: DrawMode) {}

    addPoint(p: Point): void {
        this.raw.push({ x: p.x, y: p.y });
    }

    get pointCount(): number {
        return this.raw.length;
    }

    get points(): readonly Point[] {
        return this.raw;
    }

    /** Commit to a path, or `null` when too short to be meaningful. */
    finalize(id: string, halfWidth: number = DEFAULT_HALF_WIDTH, walls = false): CartographyPath | null {
        const pts = this.mode === 'freehand' ? simplify(this.raw, FREEHAND_EPSILON) : [...this.raw];
        if (pts.length < 2) {
            return null;
        }
        return { id, kind: this.kind, points: pts, halfWidths: pts.map(() => halfWidth), walls };
    }
}
