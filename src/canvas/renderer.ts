// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Feature rendering over a keyed {@link DrawSurface} seam. Paths become smoothed,
 * variable-width ribbon polygons; biome regions become smoothed, closed fills.
 * Style is derived from the feature, so the controller just hands over features;
 * the concrete PIXI surface lives at the Foundry boundary, keeping this pure.
 */
import { buildRibbon, ribbonOutline } from '../geometry/ribbon';
import { isRegion, type Feature } from '../tools/feature';
import type { PathKind } from '../tools/path';
import { BIOME_STYLES, regionOutline } from '../tools/region';

/** Samples per Catmull-Rom span when triangulating a ribbon. */
export const RIBBON_SAMPLES = 12;

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
    fill(id: string, polygon: readonly number[], color: number, alpha: number): void;
    remove(id: string): void;
    clear(): void;
}

export interface FeatureRenderer {
    set(id: string, feature: Feature): void;
    preview(feature: Feature): void;
    remove(id: string): void;
    clearPreview(): void;
    clear(): void;
}

interface Filled {
    readonly outline: number[];
    readonly fill: number;
    readonly alpha: number;
}

function outlineAndStyle(feature: Feature): Filled {
    if (isRegion(feature)) {
        const s = BIOME_STYLES[feature.biome];
        return { outline: regionOutline(feature.points), fill: s.fill, alpha: s.alpha };
    }
    const s = STYLES[feature.kind];
    return { outline: ribbonOutline(buildRibbon(feature.points, feature.halfWidths, RIBBON_SAMPLES)), fill: s.fill, alpha: s.alpha };
}

const PREVIEW_ID = '__preview__';

export class GraphicsFeatureRenderer implements FeatureRenderer {
    constructor(private readonly surface: DrawSurface) {}

    set(id: string, feature: Feature): void {
        const { outline, fill, alpha } = outlineAndStyle(feature);
        if (outline.length >= 6) {
            this.surface.fill(id, outline, fill, alpha);
        } else {
            this.surface.remove(id);
        }
    }

    preview(feature: Feature): void {
        const { outline } = outlineAndStyle(feature);
        if (outline.length >= 6) {
            this.surface.fill(PREVIEW_ID, outline, PREVIEW_STYLE.fill, PREVIEW_STYLE.alpha);
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
