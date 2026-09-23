// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildRibbon } from './ribbon';
import type { Point } from './spline';

describe('buildRibbon', () => {
    it('is empty for fewer than two points', () => {
        expect(buildRibbon([{ x: 0, y: 0 }], [10], 4)).toEqual({ positions: [], uvs: [], indices: [] });
    });

    it('produces symmetric left/right rails for a straight horizontal line', () => {
        const line: Point[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
        ];
        const g = buildRibbon(line, [2, 2], 1);
        // vertex 0 = left rail (y = +2), vertex 1 = right rail (y = -2)
        expect(g.positions[1]).toBeCloseTo(2);
        expect(g.positions[3]).toBeCloseTo(-2);
        // uv v alternates 0 (left) / 1 (right)
        expect(g.uvs[1]).toBe(0);
        expect(g.uvs[3]).toBe(1);
    });

    it('emits six indices per quad', () => {
        const g = buildRibbon(
            [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
                { x: 20, y: 0 },
            ],
            [2, 2, 2],
            2,
        );
        const pairs = g.positions.length / 4;
        expect(g.indices.length).toBe((pairs - 1) * 6);
    });

    it('tapers both ends to a point while keeping full width in the middle', () => {
        const line: Point[] = [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 100, y: 0 },
        ];
        const tapered = buildRibbon(line, [10, 10, 10], 8, true);
        const pairs = tapered.positions.length / 4;
        // End rails collapse onto the centerline (near-zero half-width)...
        const startHalf = Math.abs(tapered.positions[1] ?? 0);
        const endHalf = Math.abs(tapered.positions[(pairs - 1) * 4 + 1] ?? 0);
        expect(startHalf).toBeLessThan(1);
        expect(endHalf).toBeLessThan(1);
        // ...while the mid sample retains (close to) the authored half-width.
        const mid = Math.floor(pairs / 2);
        expect(Math.abs(tapered.positions[mid * 4 + 1] ?? 0)).toBeCloseTo(10, 1);
    });

    it('leaves width uniform when taper is off (default)', () => {
        const line: Point[] = [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
        ];
        const flat = buildRibbon(line, [10, 10], 8);
        expect(Math.abs(flat.positions[1] ?? 0)).toBeCloseTo(10);
    });
});
