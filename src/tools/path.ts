// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The persisted cartography path model (roads / rivers) and its defensive
 * parser. Paths are stored on the scene as a flag; scene flags are untyped
 * JSON, so `parsePaths` validates the shape and drops anything malformed rather
 * than trusting the blob.
 */
import type { Point } from '../geometry/spline';

export const FLAG_SCOPE = 'dh-cartography-draw';
export const FLAG_KEY = 'features';

export type PathKind = 'road' | 'river';

export interface CartographyPath {
    readonly type: 'path';
    readonly id: string;
    readonly kind: PathKind;
    /** Authored (simplified) control points, in scene pixels. */
    readonly points: Point[];
    /** Half-width in scene pixels at each control point (parallel to `points`). */
    readonly halfWidths: number[];
    /** Emit Foundry walls along the centerline when true. */
    readonly walls: boolean;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: a persisted path kind arrives as untyped scene-flag JSON; this guard is the validation that narrows it to PathKind
function isPathKind(v: unknown): v is PathKind {
    return v === 'road' || v === 'river';
}

// eslint-disable-next-line no-restricted-syntax -- boundary: narrows an untyped scene-flag value to an indexable record so downstream field reads need no unchecked cast
export function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: array elements from a scene-flag blob are unknown; this guard narrows each to Point
export function isPoint(v: unknown): v is Point {
    if (!isRecord(v)) {
        return false;
    }
    return typeof v['x'] === 'number' && typeof v['y'] === 'number';
}

// eslint-disable-next-line no-restricted-syntax -- boundary: a persisted width list is untyped scene-flag JSON; this validates and narrows it to number[]
function toNumberArray(v: unknown): number[] {
    return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
}

// eslint-disable-next-line no-restricted-syntax -- boundary: parses one untyped scene-flag entry, validating the shape and returning a narrow CartographyPath or null
export function parsePath(v: unknown): CartographyPath | null {
    if (!isRecord(v)) {
        return null;
    }
    if (typeof v['id'] !== 'string' || !isPathKind(v['kind'])) {
        return null;
    }
    const points = Array.isArray(v['points']) ? v['points'].filter(isPoint) : [];
    if (points.length < 2) {
        return null;
    }
    // A missing/short width list is normalised to a uniform default per point.
    const rawWidths = toNumberArray(v['halfWidths']);
    const halfWidths = points.map((_, i) => rawWidths[i] ?? rawWidths[0] ?? DEFAULT_HALF_WIDTH);
    return { type: 'path', id: v['id'], kind: v['kind'], points, halfWidths, walls: v['walls'] === true };
}

/** Default half-width (scene px) for a freshly drawn path. */
export const DEFAULT_HALF_WIDTH = 20;

/** Build a committed path from a point stream + uniform half-width, or null if too short. */
export function makePath(id: string, kind: PathKind, points: readonly Point[], halfWidth: number, walls: boolean): CartographyPath | null {
    if (points.length < 2) {
        return null;
    }
    return {
        type: 'path',
        id,
        kind,
        points: points.map((p) => ({ x: p.x, y: p.y })),
        halfWidths: points.map(() => halfWidth),
        walls,
    };
}

/** Rebuild a path with new geometry (edit ops), preserving id/kind/walls, or null if invalid. */
export function withPathGeometry(path: CartographyPath, points: readonly Point[], halfWidths: readonly number[]): CartographyPath | null {
    if (points.length < 2 || points.length !== halfWidths.length) {
        return null;
    }
    return { ...path, points: points.map((p) => ({ x: p.x, y: p.y })), halfWidths: [...halfWidths] };
}
