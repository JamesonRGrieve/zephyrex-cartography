// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The unified persisted feature model: roads/rivers (paths) and biome regions,
 * discriminated by `type`. `parseFeatures` validates the mixed scene-flag blob.
 */
import { parsePath, type CartographyPath } from './path';
import { parseRegion, type RegionFeature } from './region';

export type Feature = CartographyPath | RegionFeature;

export function isRegion(f: Feature): f is RegionFeature {
    return f.type === 'region';
}

/** Parse the mixed scene-flag blob into validated features (paths + regions). */
export function parseFeatures(raw: unknown): Feature[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const out: Feature[] = [];
    for (const entry of raw) {
        const feature = parsePath(entry) ?? parseRegion(entry);
        if (feature) {
            out.push(feature);
        }
    }
    return out;
}
