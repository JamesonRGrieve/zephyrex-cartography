// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The unified persisted feature model: roads/rivers (paths), biome regions
 * (closed fills), and biome brush strokes (freehand swaths), discriminated by
 * `type`. `parseFeatures` validates the mixed scene-flag blob.
 */
import { parsePath, type CartographyPath } from './path';
import { parseRegion, type RegionFeature } from './region';
import { parseRoom, type RoomFeature } from './room';
import { parseStroke, type StrokeFeature } from './stroke';

export type Feature = CartographyPath | RegionFeature | StrokeFeature | RoomFeature;

export function isRegion(f: Feature): f is RegionFeature {
    return f.type === 'region';
}

export function isStroke(f: Feature): f is StrokeFeature {
    return f.type === 'stroke';
}

export function isRoom(f: Feature): f is RoomFeature {
    return f.type === 'room';
}

/** Parse the mixed scene-flag blob into validated features (paths + regions + strokes). */
// eslint-disable-next-line no-restricted-syntax -- boundary: the scene-flag blob is untyped JSON; this is the single entry that validates it and narrows to Feature[]
export function parseFeatures(raw: unknown): Feature[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const out: Feature[] = [];
    for (const entry of raw) {
        const feature = parsePath(entry) ?? parseRegion(entry) ?? parseStroke(entry) ?? parseRoom(entry);
        if (feature) {
            out.push(feature);
        }
    }
    return out;
}
