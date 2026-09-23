// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Pure triangulation of a smoothed, variable-width ribbon from a path centerline.
 * Produces flat vertex / uv / index arrays a PIXI mesh uploads verbatim — the
 * "textured road/river" geometry, with per-control-point width and arc-length
 * U coordinates so a tiling texture flows along the path.
 */
import { catmullRom, type Point } from './spline';

export interface RibbonGeometry {
    /** Interleaved [x, y, …] — vertex 2j is the left rail, 2j+1 the right. */
    readonly positions: number[];
    /** Interleaved [u, v, …]; u = arc-length fraction, v ∈ {0 (left), 1 (right)}. */
    readonly uvs: number[];
    /** Triangle-list indices into the vertex array. */
    readonly indices: number[];
}

const EMPTY: RibbonGeometry = { positions: [], uvs: [], indices: [] };

/** Fraction of the arc over which a tapered end ramps from a point to full width. */
const TAPER_FRACTION = 0.18;

/**
 * Smooth 0→1→0 width multiplier along the ribbon: for a tapered feature the two
 * ends narrow to a point (a river's source/mouth) while the middle keeps its
 * authored width. `j` is the sample index, `n` the sample count.
 */
function taperFactor(j: number, n: number): number {
    const t = n > 1 ? j / (n - 1) : 0.5;
    const ramp = Math.min(t, 1 - t) / TAPER_FRACTION;
    const c = Math.min(1, Math.max(0, ramp));
    return c * c * (3 - 2 * c); // smoothstep
}

/** Half-width at densified sample `j`, interpolated across the control widths. */
function widthAt(halfWidths: readonly number[], j: number, samples: number): number {
    if (halfWidths.length === 0) {
        return 0;
    }
    if (samples <= 1 || halfWidths.length === 1) {
        return halfWidths[0] ?? 0;
    }
    const t = (j / (samples - 1)) * (halfWidths.length - 1);
    const lo = Math.min(Math.floor(t), halfWidths.length - 2);
    const frac = t - lo;
    const a = halfWidths[lo] ?? 0;
    const b = halfWidths[lo + 1] ?? a;
    return a + (b - a) * frac;
}

/**
 * Build the ribbon for `centerline` control points with `halfWidths` (parallel
 * array), smoothing with `samplesPerSegment` samples per span. Degenerate input
 * (< 2 points) yields empty arrays.
 */
export function buildRibbon(centerline: readonly Point[], halfWidths: readonly number[], samplesPerSegment: number, taperEnds = false): RibbonGeometry {
    if (centerline.length < 2) {
        return EMPTY;
    }
    const spine = catmullRom(centerline, Math.max(1, samplesPerSegment));
    const n = spine.length;
    if (n < 2) {
        return EMPTY;
    }

    // Cumulative arc length for the U coordinate.
    const cumulative: number[] = new Array<number>(n).fill(0);
    for (let j = 1; j < n; j++) {
        const a = spine[j - 1];
        const b = spine[j];
        cumulative[j] = (cumulative[j - 1] ?? 0) + (a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0);
    }
    const total = cumulative[n - 1] ?? 0;
    const invTotal = total > 0 ? 1 / total : 0;

    const positions: number[] = [];
    const uvs: number[] = [];
    for (let j = 0; j < n; j++) {
        const cur = spine[j];
        const prev = spine[j - 1] ?? cur;
        const next = spine[j + 1] ?? cur;
        if (!cur || !prev || !next) {
            continue;
        }
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const hw = widthAt(halfWidths, j, n) * (taperEnds ? taperFactor(j, n) : 1);
        const u = (cumulative[j] ?? 0) * invTotal;
        positions.push(cur.x + nx * hw, cur.y + ny * hw); // left rail
        positions.push(cur.x - nx * hw, cur.y - ny * hw); // right rail
        uvs.push(u, 0, u, 1);
    }

    const indices: number[] = [];
    const quads = positions.length / 4 - 1; // vertex pairs minus one
    for (let q = 0; q < quads; q++) {
        const l0 = q * 2;
        const r0 = l0 + 1;
        const l1 = l0 + 2;
        const r1 = l0 + 3;
        indices.push(l0, r0, l1, r0, r1, l1);
    }

    return { positions, uvs, indices };
}

/**
 * Closed outline polygon `[x, y, …]` for a filled ribbon render: the left rail
 * forward, then the right rail reversed. Used by the colour-fill renderer (the
 * textured-mesh path reuses `positions`/`uvs`/`indices` directly).
 */
export function ribbonOutline(geo: RibbonGeometry): number[] {
    const p = geo.positions;
    const pairs = Math.floor(p.length / 4);
    const left: number[] = [];
    const right: number[] = [];
    for (let j = 0; j < pairs; j++) {
        left.push(p[j * 4] ?? 0, p[j * 4 + 1] ?? 0);
        right.push(p[j * 4 + 2] ?? 0, p[j * 4 + 3] ?? 0);
    }
    const out = [...left];
    for (let j = pairs - 1; j >= 0; j--) {
        out.push(right[j * 2] ?? 0, right[j * 2 + 1] ?? 0);
    }
    return out;
}
