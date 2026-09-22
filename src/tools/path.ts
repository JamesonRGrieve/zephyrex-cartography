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

function isPathKind(v: unknown): v is PathKind {
    return v === 'road' || v === 'river';
}

export function isPoint(v: unknown): v is Point {
    if (typeof v !== 'object' || v === null) {
        return false;
    }
    const o = v as Record<string, unknown>;
    return typeof o['x'] === 'number' && typeof o['y'] === 'number';
}

function toNumberArray(v: unknown): number[] {
    return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
}

export function parsePath(v: unknown): CartographyPath | null {
    if (typeof v !== 'object' || v === null) {
        return null;
    }
    const o = v as Record<string, unknown>;
    if (typeof o['id'] !== 'string' || !isPathKind(o['kind'])) {
        return null;
    }
    const points = Array.isArray(o['points']) ? o['points'].filter(isPoint) : [];
    if (points.length < 2) {
        return null;
    }
    // A missing/short width list is normalised to a uniform default per point.
    const rawWidths = toNumberArray(o['halfWidths']);
    const halfWidths = points.map((_, i) => rawWidths[i] ?? rawWidths[0] ?? DEFAULT_HALF_WIDTH);
    return { type: 'path', id: o['id'], kind: o['kind'], points, halfWidths, walls: o['walls'] === true };
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
