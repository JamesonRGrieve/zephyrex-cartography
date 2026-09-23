// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Silhouette tracing: turns a binary coverage mask (an image's opaque pixels)
 * into closed outline loops via marching squares, then simplifies them. Holes
 * are traced too; a courtyard inside a building gets its own loop, which is
 * what occlusion walls want. Pure and unit-tested.
 */
import { simplify, type Point } from './spline';

export interface CoverageMask {
    readonly width: number;
    readonly height: number;
    /** Row-major, one entry per pixel; non-zero = covered. */
    readonly data: ArrayLike<number>;
}

/**
 * Segment endpoints per marching-squares case, as edge ids.
 * Edges: 0 top, 1 right, 2 bottom, 3 left. Corner bits: 8 TL, 4 TR, 2 BR, 1 BL.
 * Every segment keeps the covered side on its right, so segments chain into
 * consistently wound loops. The saddles (5, 10) cut around each covered
 * corner separately (4-connectivity: diagonal pixels are not joined).
 */
const CASES: readonly (readonly [number, number])[][] = [
    [],
    [[3, 2]],
    [[2, 1]],
    [[3, 1]],
    [[1, 0]],
    [
        [3, 2],
        [1, 0],
    ],
    [[2, 0]],
    [[3, 0]],
    [[0, 3]],
    [[0, 2]],
    [
        [0, 3],
        [2, 1],
    ],
    [[0, 1]],
    [[1, 3]],
    [[1, 2]],
    [[2, 3]],
    [],
];

function covered(mask: CoverageMask, x: number, y: number): number {
    if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) {
        return 0;
    }
    return (mask.data[y * mask.width + x] ?? 0) !== 0 ? 1 : 0;
}

/** Edge midpoint of the cell whose top-left corner is pixel (x, y), in pixel-centre coordinates doubled to stay integral. */
function edgePoint(x: number, y: number, edge: number): readonly [number, number] {
    // Pixel centre (i, j) is at doubled coordinates (2i + 1, 2j + 1).
    const cellX = 2 * x + 1;
    const cellY = 2 * y + 1;
    switch (edge) {
        case 0:
            return [cellX + 1, cellY];
        case 1:
            return [cellX + 2, cellY + 1];
        case 2:
            return [cellX + 1, cellY + 2];
        default:
            return [cellX, cellY + 1];
    }
}

function key(p: readonly [number, number]): string {
    return `${p[0]},${p[1]}`;
}

/** Closed outline loops of the covered region, in mask pixels (unsimplified). */
export function traceLoops(mask: CoverageMask): Point[][] {
    const next = new Map<string, readonly [number, number]>();
    for (let y = -1; y < mask.height; y++) {
        for (let x = -1; x < mask.width; x++) {
            const index = (covered(mask, x, y) << 3) | (covered(mask, x + 1, y) << 2) | (covered(mask, x + 1, y + 1) << 1) | covered(mask, x, y + 1);
            for (const [from, to] of CASES[index] ?? []) {
                next.set(key(edgePoint(x, y, from)), edgePoint(x, y, to));
            }
        }
    }
    const loops: Point[][] = [];
    const visited = new Set<string>();
    for (const [startKey] of next) {
        if (visited.has(startKey)) {
            continue;
        }
        const loop: Point[] = [];
        let currentKey = startKey;
        let current = next.get(currentKey);
        while (current && !visited.has(currentKey)) {
            visited.add(currentKey);
            loop.push({ x: current[0] / 2, y: current[1] / 2 });
            currentKey = key(current);
            current = next.get(currentKey);
        }
        if (loop.length >= 3) {
            loops.push(loop);
        }
    }
    return loops;
}

/** Bytes per RGBA pixel, and the alpha channel's offset within it. */
const RGBA_STRIDE = 4;
const ALPHA_OFFSET = 3;

/** A coverage mask from RGBA pixels (e.g. canvas `ImageData`): covered where alpha reaches `threshold` (0..255). */
export function maskFromRgba(rgba: ArrayLike<number>, width: number, height: number, threshold: number): CoverageMask {
    const data = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i++) {
        data[i] = (rgba[i * RGBA_STRIDE + ALPHA_OFFSET] ?? 0) >= threshold ? 1 : 0;
    }
    return { width, height, data };
}

/** Shoelace area of a closed polygon (absolute). */
export function polygonArea(points: readonly Point[]): number {
    let twice = 0;
    points.forEach((p, i) => {
        const q = points[(i + 1) % points.length] ?? p;
        twice += p.x * q.y - q.x * p.y;
    });
    return Math.abs(twice) / 2;
}

export interface TraceOptions {
    /** Simplification tolerance in mask pixels. */
    readonly tolerance: number;
    /** Loops enclosing less than this many mask pixels are noise and are dropped. */
    readonly minArea: number;
}

/**
 * The silhouette as simplified closed loops, normalised to fractions of the
 * mask (0..1), ready to map onto a stamp's footprint.
 */
export function traceSilhouette(mask: CoverageMask, options: TraceOptions): Point[][] {
    if (mask.width <= 0 || mask.height <= 0) {
        return [];
    }
    return traceLoops(mask)
        .filter((loop) => polygonArea(loop) >= options.minArea)
        .map((loop) => {
            // Simplify as an open path from a repeated start point, then drop the duplicate closing point.
            const first = loop[0];
            const ring = first ? [...loop, first] : loop;
            const simplified = simplify(ring, options.tolerance).slice(0, -1);
            return simplified.map((p) => ({ x: p.x / mask.width, y: p.y / mask.height }));
        })
        .filter((loop) => loop.length >= 3);
}
