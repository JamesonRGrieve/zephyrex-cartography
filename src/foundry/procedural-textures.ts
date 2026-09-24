// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The procedural patterns as images the draw surface can tile: each is drawn
 * once, on a canvas, into a data URL, and kept for the session.
 */
import { PATTERN_SIZE, patternPixels, type Pattern } from '../tools/procedural';

const images = new Map<Pattern, string>();

/** The image of `pattern`, drawn on first use. */
export function patternImage(pattern: Pattern): string {
    const drawn = images.get(pattern);
    if (drawn !== undefined) {
        return drawn;
    }
    const tile = document.createElement('canvas');
    tile.width = PATTERN_SIZE;
    tile.height = PATTERN_SIZE;
    tile.getContext('2d')?.putImageData(new ImageData(patternPixels(pattern), PATTERN_SIZE, PATTERN_SIZE), 0, 0);
    const image = tile.toDataURL();
    images.set(pattern, image);
    return image;
}
