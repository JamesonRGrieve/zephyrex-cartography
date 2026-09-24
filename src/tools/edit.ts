// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Pure control-point edit operations over a committed feature: move or delete a
 * vertex, returning a NEW feature (features are immutable) or null when the edit
 * would violate the minimum point count (path >= 2, region >= 3). Paths keep
 * their parallel half-width array in step. Unit-tested; the controller applies
 * these and persists.
 */
import type { Point } from '../geometry/spline';
import { isRegion, isRoom, isStamp, isStroke, type Feature } from './feature';
import { withPathGeometry } from './path';
import { withRegionPoints } from './region';
import { withRoomPoints } from './room';
import { withStrokePoints } from './stroke';

/** Move the vertex at `index` to `to`, or null if the index is out of range. */
export function movePoint(feature: Feature, index: number, to: Point): Feature | null {
    if (index < 0 || index >= feature.points.length) {
        return null;
    }
    const points = feature.points.map((p, i) => (i === index ? { x: to.x, y: to.y } : p));
    if (isStamp(feature) || feature.type === 'pin') {
        // A stamp's or a pin's one point is where it stands: moving it moves the whole thing.
        return { ...feature, points };
    }
    if (isRegion(feature)) {
        return withRegionPoints(feature, points);
    }
    if (isRoom(feature)) {
        return withRoomPoints(feature, points);
    }
    if (isStroke(feature)) {
        return withStrokePoints(feature, points);
    }
    return withPathGeometry(feature, points, feature.halfWidths);
}

/** Narrowest half-width (scene px) a path point can be set to, so it stays visible and pickable. */
export const MIN_HALF_WIDTH = 2;

/**
 * Set a path's half-width at control point `index` (clamped to
 * {@link MIN_HALF_WIDTH}), or null if the feature is not a path or the index
 * is out of range. Only paths vary width per point.
 */
export function setHalfWidth(feature: Feature, index: number, halfWidth: number): Feature | null {
    if (feature.type !== 'path' || index < 0 || index >= feature.points.length || !Number.isFinite(halfWidth)) {
        return null;
    }
    const width = Math.max(MIN_HALF_WIDTH, halfWidth);
    return withPathGeometry(
        feature,
        feature.points,
        feature.halfWidths.map((w, i) => (i === index ? width : w)),
    );
}

/** Delete the vertex at `index`, or null if out of range or it would drop below the minimum. */
export function deletePoint(feature: Feature, index: number): Feature | null {
    if (index < 0 || index >= feature.points.length) {
        return null;
    }
    // A stamp or a pin is its one point: it is erased, not thinned.
    if (isStamp(feature) || feature.type === 'pin') {
        return null;
    }
    const points = feature.points.filter((_, i) => i !== index);
    if (isRegion(feature)) {
        return withRegionPoints(feature, points);
    }
    if (isRoom(feature)) {
        return withRoomPoints(feature, points);
    }
    if (isStroke(feature)) {
        return withStrokePoints(feature, points);
    }
    const halfWidths = feature.halfWidths.filter((_, i) => i !== index);
    return withPathGeometry(feature, points, halfWidths);
}
