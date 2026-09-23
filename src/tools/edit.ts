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
    if (isStamp(feature)) {
        // A stamp's one point is its centre: moving it moves the whole stamp.
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

/** Delete the vertex at `index`, or null if out of range or it would drop below the minimum. */
export function deletePoint(feature: Feature, index: number): Feature | null {
    if (index < 0 || index >= feature.points.length) {
        return null;
    }
    if (isStamp(feature)) {
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
