// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The browser side of silhouette tracing: loads a stamp image, rasterises it
 * small onto a canvas, and hands the alpha to the pure tracer. The result is
 * cached per image URL, since every placement of a stamp variant shares its
 * silhouette. Tracing failures (a CORS-tainted canvas, a missing image) yield
 * null, and the plan then falls back to the rectangular footprint.
 */
import type { SilhouetteSource } from '../canvas/controller';
import type { Point } from '../geometry/spline';
import { maskFromRgba, traceSilhouette } from '../geometry/trace';

/** Longest side of the rasterised mask; enough for wall outlines, cheap to trace. */
const MASK_SIZE = 96;
/** Alpha (0..255) at which a pixel counts as solid. */
const ALPHA_THRESHOLD = 128;
/** Outline simplification tolerance and speck floor, in mask pixels. */
const TRACE_OPTIONS = { tolerance: 1, minArea: 4 } as const;

async function traceImage(src: string): Promise<Point[][] | null> {
    try {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = src;
        await image.decode();
        const scale = MASK_SIZE / Math.max(image.naturalWidth, image.naturalHeight, 1);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvasEl = document.createElement('canvas');
        canvasEl.width = width;
        canvasEl.height = height;
        const context = canvasEl.getContext('2d', { willReadFrequently: true });
        if (!context) {
            return null;
        }
        context.drawImage(image, 0, 0, width, height);
        const loops = traceSilhouette(maskFromRgba(context.getImageData(0, 0, width, height).data, width, height, ALPHA_THRESHOLD), TRACE_OPTIONS);
        return loops.length > 0 ? loops : null;
    } catch {
        return null;
    }
}

export function createSilhouetteSource(): SilhouetteSource {
    const cache = new Map<string, Promise<Point[][] | null>>();
    return {
        trace: async (src) => {
            let traced = cache.get(src);
            if (!traced) {
                traced = traceImage(src);
                cache.set(src, traced);
            }
            return traced;
        },
    };
}
