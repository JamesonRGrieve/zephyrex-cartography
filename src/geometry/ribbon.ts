// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Pure triangulation of a smoothed, variable-width ribbon from a path centerline.
 * Produces flat vertex / uv / index arrays a PIXI mesh uploads verbatim — the
 * "textured road/river" geometry, with per-control-point width and arc-length
 * U coordinates so a tiling texture flows along the path.
 */
import { catmullRom, type Point } from './spline';

/** Samples per Catmull-Rom span when smoothing a path (ribbon rendering and centerline walls). */
export const RIBBON_SAMPLES = 12;

export interface RibbonGeometry {
    /** Interleaved [x, y, …] — vertex 2j is the left rail, 2j+1 the right. */
    readonly positions: number[];
    /** Interleaved [u, v, …]; u = arc-length fraction, v ∈ {0 (left), 1 (right)}. */
    readonly uvs: number[];
    /** Triangle-list indices into the vertex array. */
    readonly indices: number[];
}

const EMPTY: RibbonGeometry = { positions: [], uvs: [], indices: [] };

/** Points on each half-circle end cap of a round-brush outline. */
const CAP_SEGMENTS = 12;

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
 * (< 2 points) yields empty arrays. The ends are cut square across the path,
 * at full width.
 */
export function buildRibbon(centerline: readonly Point[], halfWidths: readonly number[], samplesPerSegment: number): RibbonGeometry {
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
        const hw = widthAt(halfWidths, j, n);
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

/**
 * The half circle closing a round-brush outline at `centre`, from its left
 * rail round through `forward` to its right rail, `forward` being the unit
 * direction the stroke leaves in there; excludes both rail points, which the
 * rails give.
 */
function capArc(centre: Point, forward: Point, radius: number): number[] {
    const left = { x: -forward.y, y: forward.x };
    const arc: number[] = [];
    for (let k = 1; k < CAP_SEGMENTS; k++) {
        const phi = (Math.PI * k) / CAP_SEGMENTS;
        arc.push(
            centre.x + radius * (left.x * Math.cos(phi) + forward.x * Math.sin(phi)),
            centre.y + radius * (left.y * Math.cos(phi) + forward.y * Math.sin(phi)),
        );
    }
    return arc;
}

/** The unit direction from `from` to `to`, or none when they coincide. */
function unit(from: Point | undefined, to: Point | undefined): Point | null {
    if (!from || !to) {
        return null;
    }
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    return len > 0 ? { x: (to.x - from.x) / len, y: (to.y - from.y) / len } : null;
}

/**
 * The closed outline `[x, y, …]` a round brush of `radius` leaves dragged along
 * `centerline` (smoothed as a ribbon): the ribbon, rounded off by a half
 * circle at each end. Fewer than two points leave nothing.
 */
export function brushOutline(centerline: readonly Point[], radius: number, samplesPerSegment: number): number[] {
    const geo = buildRibbon(
        centerline,
        centerline.map(() => radius),
        samplesPerSegment,
    );
    const pairs = Math.floor(geo.positions.length / 4);
    if (pairs < 2) {
        return [];
    }
    const spine = catmullRom(centerline, Math.max(1, samplesPerSegment));
    const endDir = unit(spine[spine.length - 2], spine[spine.length - 1]);
    const startDir = unit(spine[1], spine[0]);
    const first = spine[0];
    const last = spine[spine.length - 1];
    const p = geo.positions;
    const out: number[] = [];
    for (let j = 0; j < pairs; j++) {
        out.push(p[j * 4] ?? 0, p[j * 4 + 1] ?? 0);
    }
    // Round the far end off from the left rail to the right, then walk the right rail back.
    if (endDir && last) {
        out.push(...capArc(last, endDir, radius));
    }
    for (let j = pairs - 1; j >= 0; j--) {
        out.push(p[j * 4 + 2] ?? 0, p[j * 4 + 3] ?? 0);
    }
    // The near end, walked backwards: from the right rail round to the left.
    if (startDir && first) {
        out.push(...capArc(first, startDir, radius));
    }
    return out;
}
