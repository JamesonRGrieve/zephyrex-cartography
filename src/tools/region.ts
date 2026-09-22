// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Biome/terrain regions — the Inkarnate-style landscaping feature: a closed,
 * smoothed, filled area of a single biome (water, grassland, forest, …). Model
 * + defensive parser + the smoothed fill outline. Pure and unit-tested.
 */
import { closedSpline, type Point } from '../geometry/spline';
import { isPoint } from './path';

export type BiomeKind = 'water' | 'grassland' | 'forest' | 'sand' | 'rock' | 'snow' | 'dirt';

export const BIOMES: readonly BiomeKind[] = ['water', 'grassland', 'forest', 'sand', 'rock', 'snow', 'dirt'];

export interface BiomeStyle {
    readonly fill: number;
    readonly alpha: number;
}

/** Base biome fill colours; alpha leaves the base map partly visible for blending. */
export const BIOME_STYLES: Record<BiomeKind, BiomeStyle> = {
    water: { fill: 0x2f5d7c, alpha: 0.55 },
    grassland: { fill: 0x5a7b3c, alpha: 0.5 },
    forest: { fill: 0x2f4a24, alpha: 0.55 },
    sand: { fill: 0xc2a866, alpha: 0.5 },
    rock: { fill: 0x6b6b6b, alpha: 0.5 },
    snow: { fill: 0xdfe8ee, alpha: 0.55 },
    dirt: { fill: 0x6b4f34, alpha: 0.5 },
};

/** Default half-count of samples per region-boundary span. */
const REGION_SAMPLES = 10;

export interface RegionFeature {
    readonly type: 'region';
    readonly id: string;
    readonly biome: BiomeKind;
    /** Closed boundary control points (>= 3). */
    readonly points: Point[];
}

export function isBiomeKind(v: unknown): v is BiomeKind {
    return typeof v === 'string' && (BIOMES as readonly string[]).includes(v);
}

/** Build a committed region from a boundary point stream, or null if too small. */
export function makeRegion(id: string, biome: BiomeKind, points: readonly Point[]): RegionFeature | null {
    if (points.length < 3) {
        return null;
    }
    return { type: 'region', id, biome, points: points.map((p) => ({ x: p.x, y: p.y })) };
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
export function parseRegion(v: unknown): RegionFeature | null {
    if (typeof v !== 'object' || v === null) {
        return null;
    }
    const o = v as Record<string, unknown>;
    if (o['type'] !== 'region' || typeof o['id'] !== 'string' || !isBiomeKind(o['biome'])) {
        return null;
    }
    const points = Array.isArray(o['points']) ? o['points'].filter(isPoint) : [];
    return makeRegion(o['id'], o['biome'], points);
}
