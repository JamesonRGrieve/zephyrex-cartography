// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Feature rendering over a keyed {@link DrawSurface} seam. Paths become smoothed,
 * variable-width ribbon polygons; biome regions become smoothed, closed fills.
 * Style is derived from the feature, so the controller just hands over features;
 * the concrete PIXI surface lives at the Foundry boundary, keeping this pure.
 */
import { buildRibbon, RIBBON_SAMPLES, ribbonOutline } from '../geometry/ribbon';
import type { Feature } from '../tools/feature';
import type { PathKind } from '../tools/path';
import { BIOME_STYLES, regionOutline, type BiomeKind } from '../tools/region';
import { BIOME_TEXTURE, BIOME_TINT, PATH_TEXTURE } from '../tools/texture';

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

/** A keyed 2D fill surface: create-or-update / remove / clear filled polygons. */
export interface DrawSurface {
    fill: (id: string, polygon: readonly number[], color: number, alpha: number, feather: boolean) => void;
    /** Fill the polygon with a tiled texture (by filename), multiply-tinted. */
    fillTextured: (id: string, polygon: readonly number[], textureFile: string, tint: number, alpha: number, feather: boolean) => void;
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
    /** Tiled texture filename, or null for a flat colour fill (water/river). */
    readonly texture: string | null;
    /** Multiply tint for the texture (ignored when `texture` is null). */
    readonly tint: number;
    /** Soften the boundary — regions blend into the map (coastline/terrain edge); paths stay crisp. */
    readonly feather: boolean;
}

/** Fill descriptor for a biome area (region, brush stroke, or room floor) — textured, tinted. */
function biomeFilled(biome: BiomeKind, outline: number[], feather: boolean): Filled {
    const style = BIOME_STYLES[biome];
    const texture = BIOME_TEXTURE[biome];
    return {
        outline,
        fill: style.fill,
        alpha: texture !== null ? TEXTURE_ALPHA : style.alpha,
        texture,
        tint: BIOME_TINT[biome],
        feather,
    };
}

function outlineAndStyle(feature: Feature): Filled {
    if (feature.type === 'region') {
        return biomeFilled(feature.biome, regionOutline(feature.points), true);
    }
    if (feature.type === 'stroke') {
        const halfWidths = feature.points.map(() => feature.radius);
        return biomeFilled(feature.biome, ribbonOutline(buildRibbon(feature.points, halfWidths, RIBBON_SAMPLES, false)), true);
    }
    if (feature.type === 'room') {
        // Crisp floor edge — walls (a later phase) cover the boundary.
        return biomeFilled(feature.floor, regionOutline(feature.points), false);
    }
    const pathStyle = STYLES[feature.kind];
    const pathTexture = PATH_TEXTURE[feature.kind];
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

export class GraphicsFeatureRenderer implements FeatureRenderer {
    constructor(private readonly surface: DrawSurface) {}

    set(id: string, feature: Feature): void {
        const { outline, fill, alpha, texture, tint, feather } = outlineAndStyle(feature);
        if (outline.length < 6) {
            this.surface.remove(id);
            return;
        }
        if (texture !== null) {
            this.surface.fillTextured(id, outline, texture, tint, alpha, feather);
        } else {
            this.surface.fill(id, outline, fill, alpha, feather);
        }
    }

    preview(feature: Feature): void {
        const { outline } = outlineAndStyle(feature);
        if (outline.length >= 6) {
            this.surface.fill(PREVIEW_ID, outline, PREVIEW_STYLE.fill, PREVIEW_STYLE.alpha, false);
        } else {
            this.surface.remove(PREVIEW_ID);
        }
    }

    remove(id: string): void {
        this.surface.remove(id);
    }

    clearPreview(): void {
        this.surface.remove(PREVIEW_ID);
    }

    clear(): void {
        this.surface.clear();
    }
}
