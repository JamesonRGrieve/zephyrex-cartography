// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Zones: a Scene Region in one of Foundry's own shapes (circle, ellipse,
 * ring, cone, line or rectangle; 14.349–14.356), placed at a point. A zone is
 * an area, so it takes a movement cost, region behaviours and a display like
 * painted ground and rooms, and its region is always there. It may be
 * attached to a token (`attachment.token`, 14.356), whereupon Foundry moves
 * the region with the token and the zone follows it. Sizes are scene px, and
 * `gridBased` has Foundry measure the shape in grid units instead. Pure and
 * unit-tested.
 */
import { localPoint } from '../geometry/rectangle';
import type { Point } from '../geometry/spline';
import { type Affected, parseAreaFields } from './area-effects';
import { NEW_FEATURE, parseFeatureCommon, type FeatureCommon } from './feature-common';
import { isPoint, isRecord, numberOr, stringOrNull } from './guards';
import type { Costed } from './terrain-cost';

/** Foundry's region shape types a zone can take (`BaseShapeData.TYPES`). */
export const ZONE_SHAPES = ['circle', 'ellipse', 'ring', 'cone', 'line', 'rectangle'] as const;

export type ZoneShapeKind = (typeof ZONE_SHAPES)[number];

/** A cone's far edge: an arc, a straight edge, or a half circle (`ConeShapeData` `curvature`). */
export const CONE_CURVATURES = ['round', 'flat', 'semicircle'] as const;

export type ConeCurvature = (typeof CONE_CURVATURES)[number];

/**
 * A zone's shape and size, in scene px. A circle, ellipse or ring is centred
 * on the zone's point; a cone or line starts there and points along its
 * rotation; a rectangle is centred there.
 */
export type ZoneShape =
    | { readonly kind: 'circle'; readonly radius: number }
    | { readonly kind: 'ellipse'; readonly radiusX: number; readonly radiusY: number }
    /** The band runs from `radius - innerWidth` to `radius + outerWidth`. */
    | { readonly kind: 'ring'; readonly radius: number; readonly innerWidth: number; readonly outerWidth: number }
    /** `angle` is the cone's spread, in degrees. */
    | { readonly kind: 'cone'; readonly radius: number; readonly angle: number; readonly curvature: ConeCurvature }
    | { readonly kind: 'line'; readonly length: number; readonly width: number }
    | { readonly kind: 'rectangle'; readonly width: number; readonly height: number };

/** What the zone panel edits. */
export interface ZoneSettings {
    /** The region's name; "" for the module's own. */
    readonly name: string;
    readonly shape: ZoneShape;
    /** Degrees. */
    readonly rotation: number;
    /** Measured in grid units, conforming to the grid, rather than exactly in px. */
    readonly gridBased: boolean;
    /** The token (by id, on this scene) the region moves with; null for none. */
    readonly attachedTo: string | null;
}

/** A zone; its one point is where its shape is placed. */
export interface ZoneFeature extends FeatureCommon, ZoneSettings, Costed, Affected {
    readonly type: 'zone';
}

/** A new zone's size (px): a circle this wide across three grid squares at Foundry's default 100 px grid. */
export const NEW_ZONE_SIZE = 150;

export const NEW_ZONE: ZoneSettings = { name: '', shape: { kind: 'circle', radius: NEW_ZONE_SIZE }, rotation: 0, gridBased: false, attachedTo: null };

/** Degrees in a turn: the widest a round cone spreads. */
export const FULL_TURN = 360;

/** The widest spread a cone of each curvature can have (`ConeShapeData.validateJoint`). */
const MAX_CONE_ANGLE: Readonly<Record<ConeCurvature, number>> = { round: FULL_TURN, flat: 90, semicircle: 180 };

const RING_WIDTH_SHARE = 0.25;
const LINE_WIDTH_SHARE = 0.25;
const CONE_ANGLE = 90;
const HALF = 0.5;

export function makeZone(id: string, at: Point, settings: ZoneSettings = NEW_ZONE): ZoneFeature {
    return { type: 'zone', id, points: [{ x: at.x, y: at.y }], ...settings, ...NEW_FEATURE };
}

/** Where the zone is placed. */
export function zonePoint(zone: ZoneFeature): Point {
    return zone.points[0] ?? { x: 0, y: 0 };
}

/** What the zone panel edits of `zone`. */
export function zoneSettingsOf(zone: ZoneFeature): ZoneSettings {
    return { name: zone.name, shape: zone.shape, rotation: zone.rotation, gridBased: zone.gridBased, attachedTo: zone.attachedTo };
}

/** The same zone with other settings, or null when its shape is not one Foundry takes. */
export function withZoneSettings(zone: ZoneFeature, settings: ZoneSettings): ZoneFeature | null {
    return validZoneShape(settings.shape) && Number.isFinite(settings.rotation) ? { ...zone, ...settings } : null;
}

/** The zone placed at `at`, turned to `rotation` (the way its attached token has moved it). */
export function withZonePlace(zone: ZoneFeature, at: Point, rotation: number): ZoneFeature {
    return { ...zone, points: [{ x: at.x, y: at.y }], rotation };
}

/** Whether Foundry takes `shape`: every size finite and positive, a ring's band inside its centre, a cone's spread within its curvature's. */
export function validZoneShape(shape: ZoneShape): boolean {
    const sizes = Object.values(shapeSizes(shape));
    if (!sizes.every((size) => Number.isFinite(size) && size > 0)) {
        return false;
    }
    if (shape.kind === 'ring') {
        return shape.innerWidth <= shape.radius;
    }
    if (shape.kind === 'cone') {
        return shape.angle <= MAX_CONE_ANGLE[shape.curvature];
    }
    return true;
}

/** `shape` with its size `field` set to `value`, or null if it has no such size or Foundry would not take it. */
export function withShapeSize(shape: ZoneShape, field: string, value: number): ZoneShape | null {
    if (!(field in shapeSizes(shape))) {
        return null;
    }
    const next = { ...shape, [field]: value };
    return validZoneShape(next) ? next : null;
}

/** `shape` with every length times `factor` (a cone's angle is no length). */
export function scaledZoneShape(shape: ZoneShape, factor: number): ZoneShape {
    const s = (size: number): number => size * factor;
    switch (shape.kind) {
        case 'circle':
            return { ...shape, radius: s(shape.radius) };
        case 'ellipse':
            return { ...shape, radiusX: s(shape.radiusX), radiusY: s(shape.radiusY) };
        case 'ring':
            return { ...shape, radius: s(shape.radius), innerWidth: s(shape.innerWidth), outerWidth: s(shape.outerWidth) };
        case 'cone':
            return { ...shape, radius: s(shape.radius) };
        case 'line':
            return { ...shape, length: s(shape.length), width: s(shape.width) };
        case 'rectangle':
            break;
    }
    return { ...shape, width: s(shape.width), height: s(shape.height) };
}

/** A cone with another curvature, its spread narrowed to what that curvature allows. */
export function withCurvature(cone: Extract<ZoneShape, { kind: 'cone' }>, curvature: ConeCurvature): ZoneShape {
    return { ...cone, curvature, angle: Math.min(cone.angle, MAX_CONE_ANGLE[curvature]) };
}

/** A shape's sizes by name (px, or degrees for a cone's angle). */
export function shapeSizes(shape: ZoneShape): Readonly<Record<string, number>> {
    const { kind: _kind, ...rest } = shape;
    const sizes: Record<string, number> = {};
    for (const [field, value] of Object.entries(rest)) {
        if (typeof value === 'number') {
            sizes[field] = value;
        }
    }
    return sizes;
}

/** Its reach: the radius, half the diagonal, or the length, that a new shape keeps when the GM picks another kind. */
function reach(shape: ZoneShape): number {
    switch (shape.kind) {
        case 'ellipse':
            return Math.max(shape.radiusX, shape.radiusY);
        case 'line':
            return shape.length * HALF;
        case 'rectangle':
            return Math.max(shape.width, shape.height) * HALF;
        case 'circle':
        case 'ring':
        case 'cone':
            break;
    }
    return shape.radius;
}

/** A shape of `kind` about as big as `from`, for when the GM picks another kind. */
export function reshapedZone(kind: ZoneShapeKind, from: ZoneShape): ZoneShape {
    const size = reach(from);
    switch (kind) {
        case 'ellipse':
            return { kind, radiusX: size, radiusY: size * HALF };
        case 'ring':
            return { kind, radius: size, innerWidth: size * RING_WIDTH_SHARE, outerWidth: size * RING_WIDTH_SHARE };
        case 'cone':
            return { kind, radius: size, angle: CONE_ANGLE, curvature: 'round' };
        case 'line':
            return { kind, length: size * 2, width: size * LINE_WIDTH_SHARE };
        case 'rectangle':
            return { kind, width: size * 2, height: size * 2 };
        case 'circle':
            break;
    }
    return { kind: 'circle', radius: size };
}

/** Whether `pt` falls in the zone, by its exact shape (grid-based shapes by their px shape). */
export function zoneHit(zone: ZoneFeature, pt: Point): boolean {
    const { x, y } = localPoint(zonePoint(zone), zone.rotation, pt);
    const shape = zone.shape;
    const d = Math.hypot(x, y);
    switch (shape.kind) {
        case 'circle':
            return d <= shape.radius;
        case 'ellipse':
            return (x / shape.radiusX) ** 2 + (y / shape.radiusY) ** 2 <= 1;
        case 'ring':
            return d >= shape.radius - shape.innerWidth && d <= shape.radius + shape.outerWidth;
        case 'cone': {
            const off = Math.abs((Math.atan2(y, x) * (FULL_TURN / 2)) / Math.PI);
            return d <= shape.radius && off <= shape.angle * HALF;
        }
        case 'line':
            return x >= 0 && x <= shape.length && Math.abs(y) <= shape.width * HALF;
        case 'rectangle':
            break;
    }
    return Math.abs(x) <= shape.width * HALF && Math.abs(y) <= shape.height * HALF;
}

/** A persisted zone shape, or null when it is not one Foundry takes. */
// eslint-disable-next-line no-restricted-syntax -- boundary: parses a persisted zone shape from scene-flag or setting JSON
export function parseZoneShape(v: unknown): ZoneShape | null {
    if (!isRecord(v)) {
        return null;
    }
    const kind = ZONE_SHAPES.find((k) => k === v['kind']);
    if (kind === undefined) {
        return null;
    }
    const size = (field: string): number => numberOr(v[field], Number.NaN);
    const shapes: Readonly<Record<ZoneShapeKind, () => ZoneShape>> = {
        circle: () => ({ kind: 'circle', radius: size('radius') }),
        ellipse: () => ({ kind: 'ellipse', radiusX: size('radiusX'), radiusY: size('radiusY') }),
        ring: () => ({ kind: 'ring', radius: size('radius'), innerWidth: size('innerWidth'), outerWidth: size('outerWidth') }),
        cone: () => ({
            kind: 'cone',
            radius: size('radius'),
            angle: size('angle'),
            curvature: CONE_CURVATURES.find((c) => c === v['curvature']) ?? 'round',
        }),
        line: () => ({ kind: 'line', length: size('length'), width: size('width') }),
        rectangle: () => ({ kind: 'rectangle', width: size('width'), height: size('height') }),
    };
    const shape = shapes[kind]();
    return validZoneShape(shape) ? shape : null;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: parses one untyped scene-flag entry, validating shape and returning a narrow ZoneFeature or null
export function parseZone(v: unknown): ZoneFeature | null {
    if (!isRecord(v) || v['type'] !== 'zone' || typeof v['id'] !== 'string' || !Array.isArray(v['points'])) {
        return null;
    }
    const [at] = v['points'].filter(isPoint);
    const shape = parseZoneShape(v['shape']);
    if (at === undefined || shape === null) {
        return null;
    }
    const zone = makeZone(v['id'], at, {
        name: typeof v['name'] === 'string' ? v['name'] : '',
        shape,
        rotation: numberOr(v['rotation'], 0),
        gridBased: v['gridBased'] === true,
        attachedTo: stringOrNull(v['attachedTo']),
    });
    return { ...zone, ...parseAreaFields(v), ...parseFeatureCommon(v) };
}
