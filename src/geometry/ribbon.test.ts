// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { brushOutline, buildRibbon } from './ribbon';
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

    it('ends square across the path at full width, a river as a road', () => {
        const line: Point[] = [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 100, y: 0 },
        ];
        const g = buildRibbon(line, [10, 10, 10], 8);
        const pairs = g.positions.length / 4;
        expect([g.positions[0], g.positions[1], g.positions[2], g.positions[3]]).toEqual([0, 10, 0, -10]);
        const last = (pairs - 1) * 4;
        expect([g.positions[last], g.positions[last + 1], g.positions[last + 2], g.positions[last + 3]]).toEqual([100, 10, 100, -10]);
    });
});

describe('brushOutline', () => {
    const line: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
    ];
    const pointsOf = (outline: readonly number[]): Point[] =>
        Array.from({ length: outline.length / 2 }, (_, i) => ({ x: outline[i * 2] ?? 0, y: outline[i * 2 + 1] ?? 0 }));

    it('is what a round brush leaves: rounded past both ends by its radius, never wider than it', () => {
        const points = pointsOf(brushOutline(line, 10, 4));
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        expect(Math.min(...xs)).toBeCloseTo(-10);
        expect(Math.max(...xs)).toBeCloseTo(110);
        expect(Math.max(...ys.map(Math.abs))).toBeCloseTo(10);
        // Every cap point lies on its end's circle.
        const caps = points.filter((p) => p.x < 0 || p.x > 100);
        expect(caps.length).toBeGreaterThan(0);
        for (const p of caps) {
            expect(Math.hypot(p.x - (p.x < 0 ? 0 : 100), p.y)).toBeCloseTo(10);
        }
    });

    it('rounds the far end from the left rail and the near end back to it, so the outline closes without crossing', () => {
        const points = pointsOf(brushOutline(line, 10, 4));
        // Left rail first (y = +10, going right), the far cap, the right rail back (y = −10), the near cap.
        expect(points[0]).toEqual({ x: 0, y: 10 });
        const tip = points.findIndex((p) => p.x > 109);
        const back = points.findIndex((p) => p.x < -9);
        expect(tip).toBeGreaterThan(0);
        expect(back).toBeGreaterThan(tip);
    });

    it('rounds no end that faces no way (a stroke that never moved)', () => {
        const still: Point[] = [
            { x: 5, y: 5 },
            { x: 5, y: 5 },
        ];
        // No direction means no cap arc: nothing reaches out to the brush's radius.
        expect(pointsOf(brushOutline(still, 10, 4)).every((p) => p.x === 5 && p.y === 5)).toBe(true);
    });

    it('leaves nothing for fewer than two points', () => {
        expect(brushOutline([{ x: 0, y: 0 }], 10, 4)).toEqual([]);
    });
});
