// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Door stamps and room walls. A door stamp's axis is an opening: room walls
 * collinear with it are cut around it, and the stamp supplies the door wall
 * itself. Placing a door stamp near a room wall snaps it onto that wall and
 * turns it to match, so the axis lies exactly on the wall line. Pure and
 * unit-tested.
 */
import { distance, type Point } from '../geometry/spline';
import { perimeterSegments, type Segment } from '../geometry/wall';
import type { DoorState } from './documents';
import { isStamp, type Feature } from './feature';
import { stampCentre, stampDoorAxis, type StampFeature } from './stamp';

/** How far (px) an opening may sit off a wall line and still cut it. */
export const OPENING_TOLERANCE = 2;

const FULL_TURN = 360;
const HALF_TURN = 180;
const QUARTER_TURN = 90;

export function isDoorStamp(feature: Feature): feature is StampFeature {
    return isStamp(feature) && feature.behaviour.door !== null;
}

/** Every door stamp's axis: the openings door stamps cut into room walls. */
export function doorOpenings(features: readonly Feature[]): Segment[] {
    return features.filter(isDoorStamp).map(stampDoorAxis);
}

/** The door state a door stamp's current variant shows (closed when the variant does not say). */
export function stampDoorState(stamp: StampFeature): DoorState {
    return stamp.behaviour.doorState ?? 'closed';
}

function projectOnto(seg: Segment, p: Point): Point {
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / lengthSq));
    return { x: seg.a.x + dx * t, y: seg.a.y + dy * t };
}

function normalise(degrees: number): number {
    return ((degrees % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

/** Of the two rotations that lay the door along `angle`, the one nearest `current`. */
function alignedRotation(stamp: StampFeature, angle: number): number {
    const along = stamp.width >= stamp.height ? angle : angle - QUARTER_TURN;
    const options = [normalise(along), normalise(along + HALF_TURN)];
    const turn = (r: number): number => Math.min(normalise(r - stamp.rotation), normalise(stamp.rotation - r));
    return options.reduce((best, r) => (turn(r) < turn(best) ? r : best));
}

/**
 * Snap a door stamp onto the nearest room wall within `maxDistance` of its
 * centre: centre projected onto the wall, rotation laid along it. A stamp
 * that is not a door, or has no wall close enough, is returned unchanged.
 */
export function snapDoorToRooms(stamp: StampFeature, features: readonly Feature[], maxDistance: number): StampFeature {
    if (stamp.behaviour.door === null) {
        return stamp;
    }
    const centre = stampCentre(stamp);
    let best: { readonly at: Point; readonly seg: Segment; readonly d: number } | null = null;
    for (const feature of features) {
        if (feature.type !== 'room') {
            continue;
        }
        for (const seg of perimeterSegments(feature.points)) {
            const at = projectOnto(seg, centre);
            const d = distance(at, centre);
            if (d <= maxDistance && (!best || d < best.d)) {
                best = { at, seg, d };
            }
        }
    }
    if (!best) {
        return stamp;
    }
    const angle = (Math.atan2(best.seg.b.y - best.seg.a.y, best.seg.b.x - best.seg.a.x) * HALF_TURN) / Math.PI;
    return { ...stamp, points: [best.at], rotation: alignedRotation(stamp, angle) };
}
