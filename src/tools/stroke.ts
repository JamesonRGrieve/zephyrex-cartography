// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Terrain brush strokes — the Inkarnate-style freehand paint: a biome-filled
 * swath of constant width along a hand-drawn centerline (as opposed to a closed
 * region). Rendered as a ribbon of the biome's texture/colour. Model + defensive
 * parser + edit constructor. Pure and unit-tested.
 */
import type { Point } from '../geometry/spline';
import { NO_DOCS, parseGeneratedDocs, type GeneratedDocs } from './documents';
import { isPoint, isRecord, numberOr } from './guards';
import { isBiomeKind, type BiomeKind } from './region';

/** Default brush radius (scene px) for a freshly painted terrain stroke. */
export const DEFAULT_BRUSH_RADIUS = 25;

export interface StrokeFeature {
    readonly type: 'stroke';
    readonly id: string;
    readonly biome: BiomeKind;
    /** Painted centerline control points. */
    readonly points: Point[];
    /** Half-width (scene px) of the painted swath. */
    readonly radius: number;
    readonly docs: GeneratedDocs;
}

/** Build a committed brush stroke from a painted point stream, or null if too short. */
export function makeStroke(id: string, biome: BiomeKind, points: readonly Point[], radius: number): StrokeFeature | null {
    if (points.length < 2) {
        return null;
    }
    return { type: 'stroke', id, biome, points: points.map((p) => ({ x: p.x, y: p.y })), radius, docs: NO_DOCS };
}

/** Rebuild a stroke with new centerline points (edit ops), or null if < 2. */
export function withStrokePoints(stroke: StrokeFeature, points: readonly Point[]): StrokeFeature | null {
    if (points.length < 2) {
        return null;
    }
    return { ...stroke, points: points.map((p) => ({ x: p.x, y: p.y })) };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: parses one untyped scene-flag entry, validating shape and returning a narrow StrokeFeature or null
export function parseStroke(v: unknown): StrokeFeature | null {
    if (!isRecord(v)) {
        return null;
    }
    if (v['type'] !== 'stroke' || typeof v['id'] !== 'string' || !isBiomeKind(v['biome'])) {
        return null;
    }
    const points = Array.isArray(v['points']) ? v['points'].filter(isPoint) : [];
    const stroke = makeStroke(v['id'], v['biome'], points, numberOr(v['radius'], DEFAULT_BRUSH_RADIUS));
    return stroke && { ...stroke, docs: parseGeneratedDocs(v['docs']) };
}
