// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Feature rendering over a keyed {@link DrawSurface} seam. Paths become smoothed,
 * variable-width ribbon polygons; biome regions become smoothed, closed fills.
 * Style is derived from the feature, so the controller just hands over features;
 * the concrete PIXI surface lives at the Foundry boundary, keeping this pure.
 */
import { buildRibbon, RIBBON_SAMPLES, ribbonOutline } from '../geometry/ribbon';
import { perimeterSegments, segmentBand } from '../geometry/wall';
import { BIOME_STYLES, isBiomeKind, type BiomeKind } from '../tools/biome';
import type { Feature } from '../tools/feature';
import type { PathKind } from '../tools/path';
import { regionOutline } from '../tools/region';
import { BIOME_TEXTURE, BIOME_TINT, PATH_TEXTURE, type TextureResolver } from '../tools/texture';

/** Opacity for a textured fill — higher than a flat tint so the tile reads, but still blends. */
const TEXTURE_ALPHA = 0.9;

/** Neutral (no-op) multiply tint for a naturally-coloured texture. */
const NO_TINT = 0xffffff;

interface RibbonStyle {
    readonly fill: number;
    readonly alpha: number;
}

const STYLES: Record<PathKind, RibbonStyle> = {
    road: { fill: 0x6b5a44, alpha: 0.85 },
    river: { fill: 0x2f5d7c, alpha: 0.8 },
};

const PREVIEW_STYLE: RibbonStyle = { fill: 0xff9c00, alpha: 0.4 };

/** Flat colour of a pack floor material the active texture set does not have. */
const ROOM_FLOOR_FALLBACK = 0x6e6457;

/** Flat colour of a wall material the active texture set does not have. */
const WALL_FALLBACK = 0x3a3a3a;

/** Width (scene px) of a room's drawn wall band. */
const WALL_BAND_WIDTH = 8;

/** A keyed 2D fill surface: create-or-update / remove / clear filled polygons. */
export interface DrawSurface {
    fill: (id: string, polygon: readonly number[], color: number, alpha: number, feather: boolean) => void;
    /** Fill the polygon with a tiled texture (by image URL), multiply-tinted. */
    fillTextured: (id: string, polygon: readonly number[], textureUrl: string, tint: number, alpha: number, feather: boolean) => void;
    remove: (id: string) => void;
    clear: () => void;
}

export interface FeatureRenderer {
    set: (id: string, feature: Feature) => void;
    preview: (feature: Feature) => void;
    remove: (id: string) => void;
    clearPreview: () => void;
    clear: () => void;
}

interface Filled {
    readonly outline: number[];
    readonly fill: number;
    readonly alpha: number;
    /** Tiled texture URL, or null for a flat colour fill (water/river, or a role the texture set lacks). */
    readonly texture: string | null;
    /** Multiply tint for the texture (ignored when `texture` is null). */
    readonly tint: number;
    /** Soften the boundary — regions blend into the map (coastline/terrain edge); paths stay crisp. */
    readonly feather: boolean;
}

/** Fill descriptor for a biome area (region, brush stroke, or room floor) — textured, tinted. */
function biomeFilled(biome: BiomeKind, outline: number[], feather: boolean, resolve: TextureResolver): Filled {
    const style = BIOME_STYLES[biome];
    const role = BIOME_TEXTURE[biome];
    const texture = role === null ? null : resolve(role);
    return {
        outline,
        fill: style.fill,
        alpha: texture !== null ? TEXTURE_ALPHA : style.alpha,
        texture,
        tint: BIOME_TINT[biome],
        feather,
    };
}

/** Nothing to draw: the feature is realised entirely as native documents (a stamp is its Tile). */
const NOT_DRAWN: Filled = { outline: [], fill: 0, alpha: 0, texture: null, tint: NO_TINT, feather: false };

function outlineAndStyle(feature: Feature, resolve: TextureResolver): Filled {
    if (feature.type === 'stamp') {
        return NOT_DRAWN;
    }
    if (feature.type === 'region') {
        return biomeFilled(feature.biome, regionOutline(feature.points), true, resolve);
    }
    if (feature.type === 'stroke') {
        const halfWidths = feature.points.map(() => feature.radius);
        return biomeFilled(feature.biome, ribbonOutline(buildRibbon(feature.points, halfWidths, RIBBON_SAMPLES, false)), true, resolve);
    }
    if (feature.type === 'room') {
        // The exact polygon with a crisp edge: a room's walls are straight and cover its boundary.
        const outline = feature.points.flatMap((p) => [p.x, p.y]);
        if (isBiomeKind(feature.floor)) {
            return biomeFilled(feature.floor, outline, false, resolve);
        }
        const texture = resolve(feature.floor);
        return { outline, fill: ROOM_FLOOR_FALLBACK, alpha: TEXTURE_ALPHA, texture, tint: NO_TINT, feather: false };
    }
    const pathStyle = STYLES[feature.kind];
    const pathRole = PATH_TEXTURE[feature.kind];
    const pathTexture = pathRole === null ? null : resolve(pathRole);
    // Rivers taper to a point at each end; roads keep a constant carriageway.
    const taperEnds = feature.kind === 'river';
    return {
        outline: ribbonOutline(buildRibbon(feature.points, feature.halfWidths, RIBBON_SAMPLES, taperEnds)),
        fill: pathStyle.fill,
        alpha: pathTexture !== null ? TEXTURE_ALPHA : pathStyle.alpha,
        texture: pathTexture,
        tint: NO_TINT,
        feather: false,
    };
}

const PREVIEW_ID = '__preview__';

/** The drawn wall bands of a room: one band per perimeter segment, in its wall material. */
function wallBands(feature: Feature, resolve: TextureResolver): Filled[] {
    if (feature.type !== 'room' || feature.wall === null) {
        return [];
    }
    const texture = resolve(feature.wall);
    return perimeterSegments(feature.points).map((seg) => ({
        outline: segmentBand(seg, WALL_BAND_WIDTH),
        fill: WALL_FALLBACK,
        alpha: 1,
        texture,
        tint: NO_TINT,
        feather: false,
    }));
}

export class GraphicsFeatureRenderer implements FeatureRenderer {
    /** Surface ids of the wall bands drawn for each feature, so they go with it. */
    private readonly bands = new Map<string, string[]>();

    constructor(private readonly surface: DrawSurface, private readonly resolve: TextureResolver) {}

    set(id: string, feature: Feature): void {
        this.draw(id, outlineAndStyle(feature, this.resolve));
        this.removeBands(id);
        const bandIds = wallBands(feature, this.resolve).map((band, i) => {
            const bandId = `${id}:wall:${i}`;
            this.draw(bandId, band);
            return bandId;
        });
        if (bandIds.length > 0) {
            this.bands.set(id, bandIds);
        }
    }

    private draw(id: string, { outline, fill, alpha, texture, tint, feather }: Filled): void {
        if (outline.length < 6) {
            this.surface.remove(id);
        } else if (texture !== null) {
            this.surface.fillTextured(id, outline, texture, tint, alpha, feather);
        } else {
            this.surface.fill(id, outline, fill, alpha, feather);
        }
    }

    private removeBands(id: string): void {
        for (const bandId of this.bands.get(id) ?? []) {
            this.surface.remove(bandId);
        }
        this.bands.delete(id);
    }

    preview(feature: Feature): void {
        const { outline } = outlineAndStyle(feature, this.resolve);
        if (outline.length >= 6) {
            this.surface.fill(PREVIEW_ID, outline, PREVIEW_STYLE.fill, PREVIEW_STYLE.alpha, false);
        } else {
            this.surface.remove(PREVIEW_ID);
        }
    }

    remove(id: string): void {
        this.surface.remove(id);
        this.removeBands(id);
    }

    clearPreview(): void {
        this.surface.remove(PREVIEW_ID);
    }

    clear(): void {
        this.surface.clear();
        this.bands.clear();
    }
}
