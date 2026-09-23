// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Feature-level hit test: does a scene point fall on a given feature? Regions
 * hit when the point is inside their smoothed fill; paths hit when the point is
 * within the widest half-width of their centerline. Pure — used by the
 * controller for click-to-select and the eraser.
 */
import { distanceToPolyline, pointInPolygon } from '../geometry/hit';
import type { Point } from '../geometry/spline';
import { isRegion, isRoom, isStroke, type Feature } from './feature';
import { regionOutline } from './region';

/** Extra tolerance (scene px) so thin paths/strokes are still comfortably clickable. */
const PATH_HIT_PADDING = 4;

export function featureHit(feature: Feature, pt: Point): boolean {
    if (isRegion(feature) || isRoom(feature)) {
        return pointInPolygon(pt, regionOutline(feature.points));
    }
    if (isStroke(feature)) {
        return distanceToPolyline(pt, feature.points) <= feature.radius + PATH_HIT_PADDING;
    }
    const maxHalf = feature.halfWidths.reduce((m, w) => Math.max(m, w), 0);
    return distanceToPolyline(pt, feature.points) <= maxHalf + PATH_HIT_PADDING;
}
