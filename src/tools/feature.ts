// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The unified persisted feature model: roads/rivers (paths), biome regions
 * (closed fills), biome brush strokes (freehand swaths), rooms, stamps and
 * map pins, discriminated by `type`. `parseFeatures` validates the mixed
 * scene-flag blob.
 */
import type { GeneratedDocs } from './documents';
import { parsePath, type CartographyPath } from './path';
import { parsePin, type PinFeature } from './pin';
import { parseRegion, type RegionFeature } from './region';
import { parseRoom, type RoomFeature } from './room';
import { parseStamp, type StampFeature } from './stamp';
import { parseStroke, type StrokeFeature } from './stroke';

export type Feature = CartographyPath | RegionFeature | StrokeFeature | RoomFeature | StampFeature | PinFeature;

export function isRegion(f: Feature): f is RegionFeature {
    return f.type === 'region';
}

export function isStroke(f: Feature): f is StrokeFeature {
    return f.type === 'stroke';
}

export function isRoom(f: Feature): f is RoomFeature {
    return f.type === 'room';
}

export function isStamp(f: Feature): f is StampFeature {
    return f.type === 'stamp';
}

/** The same feature, recording the native documents it now owns. */
export function withDocs<F extends Feature>(feature: F, docs: GeneratedDocs): F {
    return { ...feature, docs };
}

/** Parse the mixed scene-flag blob into validated features. */
// eslint-disable-next-line no-restricted-syntax -- boundary: the scene-flag blob is untyped JSON; this is the single entry that validates it and narrows to Feature[]
export function parseFeatures(raw: unknown): Feature[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const out: Feature[] = [];
    for (const entry of raw) {
        const feature = parseStamp(entry) ?? parsePath(entry) ?? parseRegion(entry) ?? parseStroke(entry) ?? parseRoom(entry) ?? parsePin(entry);
        if (feature) {
            out.push(feature);
        }
    }
    return out;
}
