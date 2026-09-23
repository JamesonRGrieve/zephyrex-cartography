// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Placed stamps: a pack stamp realised on the scene as a native Tile, plus
 * whatever its behaviour generates (walls, lights, doors, transitions). A
 * placed stamp records its resolved image, footprint and behaviour at
 * placement time, so it is fully described by the feature itself. The scene
 * stays intact without the pack, and a generator can place stamps from plain
 * data. Model, placement, variant change, footprint and parser. Pure and
 * unit-tested.
 */
import type { Point } from '../geometry/spline';
import { type CatalogStamp, clampVariantIndex, computeTilePlacement, effectiveProperties, resolveVariant } from '../stamps/catalog';
import { type PlacedBehaviour, placedBehaviourSchema } from '../stamps/schema';
import { NEW_FEATURE, parseFeatureCommon, type FeatureCommon } from './feature-common';
import { isPoint, isRecord, numberOr, stringOrNull } from './guards';
import { parseSubmapLink, type SubmapLink } from './submap';

/** A stamp placement request: everything a human or a generator states to place one. */
export interface StampPlacement {
    /** Catalog key, `<moduleId>:<stamp id>`. */
    readonly stamp: string;
    readonly variant?: number;
    /** World point the stamp is centred on. */
    readonly x: number;
    readonly y: number;
    /** Degrees clockwise. */
    readonly rotation?: number;
    /** Multiplier over the stamp's authored grid footprint. */
    readonly scale?: number;
    readonly elevation?: number;
    /** Snap the footprint's top-left corner to the scene grid. */
    readonly snap?: boolean;
}

/** A placed stamp; its one point is the footprint centre. */
export interface StampFeature extends FeatureCommon {
    readonly type: 'stamp';
    /** Catalog key, `<moduleId>:<stamp id>`. */
    readonly stamp: string;
    /** The stamp's pack name at placement, for its documents' names. */
    readonly name: string;
    readonly variant: number;
    /** Module-served image URL of the current variant. */
    readonly src: string;
    /** Footprint size in scene px. */
    readonly width: number;
    readonly height: number;
    readonly rotation: number;
    readonly scale: number;
    /** Elevation above its level's floor (scene distance units). */
    readonly elevation: number;
    /** Scene px per grid square the stamp was placed at; converts behaviour radii given in grid units. */
    readonly gridSize: number;
    readonly behaviour: PlacedBehaviour;
    /** Traced outline loops as footprint fractions, for `alpha` occlusion; null when not traced. */
    readonly silhouette: Point[][] | null;
    /** The interior scene an enterable stamp leads into, or null. */
    readonly submap: SubmapLink | null;
    /** UUID of the Item Piles container token backing a container stamp, or null. */
    readonly pile: string | null;
}

/** Grid size assumed for a persisted stamp that predates the field. */
const FALLBACK_GRID_SIZE = 100;

const NO_BEHAVIOUR: PlacedBehaviour = {
    light: null,
    occlusion: null,
    physical: null,
    door: null,
    doorState: null,
    transition: null,
    enterable: false,
    container: false,
};

/** The behaviour a stamp carries in one variant (variant overrides applied). */
export function behaviourOf(stamp: CatalogStamp, index: number): PlacedBehaviour {
    const props = effectiveProperties(stamp, index);
    return {
        light: props.light,
        occlusion: props.occlusion ?? null,
        physical: props.physical ?? null,
        door: stamp.door ?? null,
        doorState: props.doorState ?? null,
        transition: stamp.transition ?? null,
        enterable: stamp.enterable,
        container: props.pile !== null,
        pile: props.pile,
        particles: props.particles,
        sound: props.sound,
        tile: props.tile,
        surface: props.surface,
        terrain: props.terrain,
    };
}

/** Place a catalog stamp. The footprint scales from the pack's reference grid to `gridSize`. */
export function makeStamp(id: string, stamp: CatalogStamp, placement: StampPlacement, gridSize: number): StampFeature {
    const variant = clampVariantIndex(stamp, placement.variant ?? stamp.defaultVariant);
    const image = resolveVariant(stamp, variant);
    const scale = placement.scale ?? 1;
    const rect = computeTilePlacement({
        variant: image,
        x: placement.x,
        y: placement.y,
        gridSize,
        referenceGridSize: stamp.referenceGridSize,
        scale,
        snap: placement.snap ?? false,
    });
    return {
        type: 'stamp',
        id,
        stamp: stamp.key,
        name: stamp.name,
        variant,
        src: image.image,
        points: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }],
        width: rect.width,
        height: rect.height,
        rotation: placement.rotation ?? 0,
        scale,
        elevation: placement.elevation ?? 0,
        gridSize,
        behaviour: behaviourOf(stamp, variant),
        silhouette: null,
        submap: null,
        pile: null,
        ...NEW_FEATURE,
    };
}

/** The footprint centre. */
export function stampCentre(feature: StampFeature): Point {
    return feature.points[0] ?? { x: 0, y: 0 };
}

/** Switch to another variant, keeping the centre, rotation and scale. */
export function withStampVariant(feature: StampFeature, stamp: CatalogStamp, index: number, gridSize: number): StampFeature {
    const centre = stampCentre(feature);
    const placed = makeStamp(feature.id, stamp, { stamp: stamp.key, variant: index, x: centre.x, y: centre.y, scale: feature.scale }, gridSize);
    return {
        ...placed,
        rotation: feature.rotation,
        elevation: feature.elevation,
        docs: feature.docs,
        level: feature.level,
        submap: feature.submap,
        pile: feature.pile,
    };
}

/** Move, resize or rotate the footprint (e.g. after the GM edits the tile natively). */
export function withStampFrame(
    feature: StampFeature,
    frame: { readonly centre: Point; readonly width: number; readonly height: number; readonly rotation: number },
): StampFeature {
    return { ...feature, points: [{ x: frame.centre.x, y: frame.centre.y }], width: frame.width, height: frame.height, rotation: frame.rotation };
}

/**
 * A point given as fractions of the footprint (0,0 = top-left, 1,1 = bottom-right
 * of the unrotated image) in world coordinates, with the stamp's rotation applied.
 */
export function stampPoint(feature: StampFeature, fraction: Point): Point {
    const c = stampCentre(feature);
    const rad = (feature.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const lx = (fraction.x - 0.5) * feature.width;
    const ly = (fraction.y - 0.5) * feature.height;
    return { x: c.x + lx * cos - ly * sin, y: c.y + lx * sin + ly * cos };
}

/** A door stamp's wall: through the centre along the footprint's long side, so a door image spans its doorway. */
export function stampDoorAxis(feature: StampFeature): { readonly a: Point; readonly b: Point } {
    return feature.width >= feature.height
        ? { a: stampPoint(feature, { x: 0, y: 0.5 }), b: stampPoint(feature, { x: 1, y: 0.5 }) }
        : { a: stampPoint(feature, { x: 0.5, y: 0 }), b: stampPoint(feature, { x: 0.5, y: 1 }) };
}

/** The footprint's four corners, clockwise from top-left, with rotation applied about the centre. */
export function stampCorners(feature: StampFeature): Point[] {
    return [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
    ].map((f) => stampPoint(feature, f));
}

// eslint-disable-next-line no-restricted-syntax -- boundary: validates a persisted behaviour snapshot; an unreadable one degrades to inert rather than dropping the stamp (which would orphan its tile)
function parseBehaviour(v: unknown): PlacedBehaviour {
    const result = placedBehaviourSchema.safeParse(v);
    return result.success ? result.data : NO_BEHAVIOUR;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: validates a persisted silhouette (loops of points); anything unreadable means untraced
function parseSilhouette(v: unknown): Point[][] | null {
    if (!Array.isArray(v)) {
        return null;
    }
    const loops = v.map((loop) => (Array.isArray(loop) ? loop.filter(isPoint).map((p) => ({ x: p.x, y: p.y })) : [])).filter((loop) => loop.length >= 3);
    return loops.length > 0 ? loops : null;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: parses one untyped scene-flag entry, validating shape and returning a narrow StampFeature or null
export function parseStamp(v: unknown): StampFeature | null {
    if (!isRecord(v) || v['type'] !== 'stamp' || typeof v['id'] !== 'string' || typeof v['stamp'] !== 'string' || typeof v['src'] !== 'string') {
        return null;
    }
    const centre = Array.isArray(v['points']) ? v['points'].find(isPoint) : undefined;
    const width = numberOr(v['width'], 0);
    const height = numberOr(v['height'], 0);
    if (!centre || width <= 0 || height <= 0) {
        return null;
    }
    return {
        type: 'stamp',
        id: v['id'],
        stamp: v['stamp'],
        // A stamp saved before names were kept falls back to its id within the pack.
        name: stringOrNull(v['name']) ?? v['stamp'].slice(v['stamp'].indexOf(':') + 1),
        variant: Math.max(0, Math.trunc(numberOr(v['variant'], 0))),
        src: v['src'],
        points: [{ x: centre.x, y: centre.y }],
        width,
        height,
        rotation: numberOr(v['rotation'], 0),
        scale: numberOr(v['scale'], 1),
        elevation: numberOr(v['elevation'], 0),
        gridSize: numberOr(v['gridSize'], FALLBACK_GRID_SIZE),
        behaviour: parseBehaviour(v['behaviour']),
        silhouette: parseSilhouette(v['silhouette']),
        submap: parseSubmapLink(v['submap']),
        pile: stringOrNull(v['pile']),
        ...parseFeatureCommon(v),
    };
}
