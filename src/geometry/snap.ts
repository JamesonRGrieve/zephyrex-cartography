// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Grid snapping for structure authoring — rooms align to the scene grid so walls
 * meet cleanly. Pure and unit-tested; the entry reads the live `canvas.grid` and
 * hands the size/origin in. Square grids only here; hex/gridless fall back to
 * Foundry's own `getSnappedPoint` at the boundary.
 */
import type { Point } from './spline';

/** A square grid: `size` px per cell, grid lines originating at (originX, originY). */
export interface Grid {
    readonly size: number;
    readonly originX: number;
    readonly originY: number;
}

/** Snap a point to the nearest grid intersection; a non-positive size is a no-op. */
export function snapToGrid(p: Point, grid: Grid): Point {
    if (grid.size <= 0) {
        return { x: p.x, y: p.y };
    }
    return {
        x: grid.originX + Math.round((p.x - grid.originX) / grid.size) * grid.size,
        y: grid.originY + Math.round((p.y - grid.originY) / grid.size) * grid.size,
    };
}
