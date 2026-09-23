// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Biome/terrain regions — the Inkarnate-style landscaping feature: a closed,
 * smoothed, filled area of a single biome (water, grassland, forest, …). Model
 * + defensive parser + the smoothed fill outline. Pure and unit-tested.
 */
import { closedSpline, type Point } from '../geometry/spline';
import { isBiomeKind, type BiomeKind } from './biome';
import { NEW_FEATURE, parseFeatureCommon, type FeatureCommon } from './feature-common';
import { isPoint, isRecord } from './guards';

/** Default half-count of samples per region-boundary span. */
const REGION_SAMPLES = 10;

/** A closed biome area; its `points` are the boundary control points (>= 3). */
export interface RegionFeature extends FeatureCommon {
    readonly type: 'region';
    readonly biome: BiomeKind;
}

/** Build a committed region from a boundary point stream, or null if too small. */
export function makeRegion(id: string, biome: BiomeKind, points: readonly Point[]): RegionFeature | null {
    if (points.length < 3) {
        return null;
    }
    return { type: 'region', id, biome, points: points.map((p) => ({ x: p.x, y: p.y })), ...NEW_FEATURE };
}

/** Rebuild a region with new boundary points (edit ops), preserving id/biome, or null if < 3. */
export function withRegionPoints(region: RegionFeature, points: readonly Point[]): RegionFeature | null {
    if (points.length < 3) {
        return null;
    }
    return { ...region, points: points.map((p) => ({ x: p.x, y: p.y })) };
}

/** Smoothed, closed fill polygon `[x, y, …]` for a region boundary. */
export function regionOutline(points: readonly Point[]): number[] {
    const boundary = closedSpline(points, REGION_SAMPLES);
    const flat: number[] = [];
    for (const p of boundary) {
        flat.push(p.x, p.y);
    }
    return flat;
}

/** Defensive parser for a persisted region (scene-flag JSON is untyped). */
// eslint-disable-next-line no-restricted-syntax -- boundary: parses one untyped scene-flag entry, validating the shape and returning a narrow RegionFeature or null
export function parseRegion(v: unknown): RegionFeature | null {
    if (!isRecord(v)) {
        return null;
    }
    if (v['type'] !== 'region' || typeof v['id'] !== 'string' || !isBiomeKind(v['biome'])) {
        return null;
    }
    const points = Array.isArray(v['points']) ? v['points'].filter(isPoint) : [];
    const region = makeRegion(v['id'], v['biome'], points);
    return region && { ...region, ...parseFeatureCommon(v) };
}
