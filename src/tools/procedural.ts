// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Procedural textures: what the renderer draws when the active texture set
 * has no texture for a fill, so nothing is ever a flat colour. Each pattern is
 * a seamless, near-white greyscale tile, meant to be multiply-tinted by the
 * fill's colour: ripples for liquids, grain for land and materials. They are
 * texture roles like any other (`procedural.<pattern>`), which the Foundry
 * boundary always resolves, whatever the set. Pure and unit-tested; the
 * boundary turns the pixels into an image.
 */

export type Pattern = 'ripple' | 'grain';

const PATTERNS: readonly Pattern[] = ['ripple', 'grain'];

const PROCEDURAL_PREFIX = 'procedural.';

/** Edge length of a pattern tile, px. */
export const PATTERN_SIZE = 128;

/** Lattice periods of the noise octaves (each divides the tile, so the tile wraps seamlessly), with their weights. */
const OCTAVES: readonly { readonly cells: number; readonly weight: number }[] = [
    { cells: 4, weight: 0.5 },
    { cells: 8, weight: 0.3 },
    { cells: 16, weight: 0.2 },
];

/** Ripple bands per unit of noise: how many caustic lines cross the tile. */
const RIPPLE_BANDS = 5;

/** Sharpness of a ripple's bright line. */
const RIPPLE_SHARPNESS = 4;

/** Darkest and brightest a pattern gets (0–1): near-white, so a tint shows as itself with texture. */
const PATTERN_FLOOR: Readonly<Record<Pattern, number>> = { ripple: 0.62, grain: 0.6 };

const CHANNEL_MAX = 255;
const RGBA = 4;

/** The texture role naming a pattern. */
export function proceduralRole(pattern: Pattern): string {
    return `${PROCEDURAL_PREFIX}${pattern}`;
}

/** The pattern a role names, or null for a pack role. */
export function patternOf(role: string): Pattern | null {
    const named = role.startsWith(PROCEDURAL_PREFIX) ? role.slice(PROCEDURAL_PREFIX.length) : '';
    return PATTERNS.find((pattern) => pattern === named) ?? null;
}

/** A repeatable 0–1 value for lattice point (x, y) of an octave. */
function lattice(x: number, y: number, octave: number): number {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(octave, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function smooth(t: number): number {
    return t * t * (3 - 2 * t);
}

/** Tileable value noise at tile position (u, v) in [0, 1), 0–1. */
function noise(u: number, v: number): number {
    return OCTAVES.reduce((sum, { cells, weight }, octave) => {
        const x = u * cells;
        const y = v * cells;
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const tx = smooth(x - x0);
        const ty = smooth(y - y0);
        // Lattice points wrap at the tile edge, so the tile repeats seamlessly.
        const at = (dx: number, dy: number): number => lattice((x0 + dx) % cells, (y0 + dy) % cells, octave);
        const upper = at(0, 0) + (at(1, 0) - at(0, 0)) * tx;
        const lower = at(0, 1) + (at(1, 1) - at(0, 1)) * tx;
        return sum + weight * (upper + (lower - upper) * ty);
    }, 0);
}

/** How light a pattern is at tile position (u, v), 0–1. */
function lightness(pattern: Pattern, u: number, v: number): number {
    const n = noise(u, v);
    const shape = pattern === 'ripple' ? 0.5 * n + 0.5 * (1 - Math.abs(Math.sin(n * Math.PI * RIPPLE_BANDS))) ** RIPPLE_SHARPNESS : n;
    const floor = PATTERN_FLOOR[pattern];
    return floor + (1 - floor) * shape;
}

/** A pattern's tile as RGBA pixels, row by row, `PATTERN_SIZE` square and opaque. */
export function patternPixels(pattern: Pattern): Uint8ClampedArray<ArrayBuffer> {
    const pixels = new Uint8ClampedArray(PATTERN_SIZE * PATTERN_SIZE * RGBA);
    for (let y = 0; y < PATTERN_SIZE; y += 1) {
        for (let x = 0; x < PATTERN_SIZE; x += 1) {
            const value = Math.round(lightness(pattern, x / PATTERN_SIZE, y / PATTERN_SIZE) * CHANNEL_MAX);
            const at = (y * PATTERN_SIZE + x) * RGBA;
            pixels[at] = value;
            pixels[at + 1] = value;
            pixels[at + 2] = value;
            pixels[at + 3] = CHANNEL_MAX;
        }
    }
    return pixels;
}
