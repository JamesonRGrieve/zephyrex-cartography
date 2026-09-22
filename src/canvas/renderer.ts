// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Ribbon rendering over a keyed {@link DrawSurface} seam. The renderer computes
 * smoothed, variable-width ribbon outlines from paths and hands filled polygons
 * to the surface by id; the concrete PIXI surface lives at the Foundry boundary,
 * so this module stays pure and unit-testable with a fake surface.
 */
import { buildRibbon, ribbonOutline } from '../geometry/ribbon';
import type { Point } from '../geometry/spline';
import type { CartographyPath, PathKind } from '../tools/path';

/** Samples per Catmull-Rom span when triangulating a ribbon. */
export const RIBBON_SAMPLES = 12;

export interface RibbonStyle {
    readonly fill: number;
    readonly alpha: number;
}

export const STYLES: Record<PathKind, RibbonStyle> = {
    road: { fill: 0x6b5a44, alpha: 0.85 },
    river: { fill: 0x2f5d7c, alpha: 0.8 },
};

export const PREVIEW_STYLE: RibbonStyle = { fill: 0xff9c00, alpha: 0.4 };

/** A keyed 2D fill surface: create-or-update / remove / clear filled polygons. */
export interface DrawSurface {
    fill(id: string, polygon: readonly number[], color: number, alpha: number): void;
    remove(id: string): void;
    clear(): void;
}

export interface RibbonRenderer {
    set(id: string, path: CartographyPath, style: RibbonStyle): void;
    setPreview(points: readonly Point[], halfWidth: number, style: RibbonStyle): void;
    remove(id: string): void;
    clearPreview(): void;
    clear(): void;
}

const PREVIEW_ID = '__preview__';

export class GraphicsRibbonRenderer implements RibbonRenderer {
    constructor(private readonly surface: DrawSurface) {}

    private paint(id: string, points: readonly Point[], halfWidths: readonly number[], style: RibbonStyle): void {
        const outline = ribbonOutline(buildRibbon(points, halfWidths, RIBBON_SAMPLES));
        if (outline.length >= 6) {
            this.surface.fill(id, outline, style.fill, style.alpha);
        } else {
            this.surface.remove(id);
        }
    }

    set(id: string, path: CartographyPath, style: RibbonStyle): void {
        this.paint(id, path.points, path.halfWidths, style);
    }

    setPreview(points: readonly Point[], halfWidth: number, style: RibbonStyle): void {
        this.paint(
            PREVIEW_ID,
            points,
            points.map(() => halfWidth),
            style,
        );
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
