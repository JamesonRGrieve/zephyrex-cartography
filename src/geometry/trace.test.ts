// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { maskFromRgba, polygonArea, traceLoops, traceSilhouette, type CoverageMask } from './trace';

/** Build a mask from rows of '#' (covered) and '.' (empty). */
function mask(rows: readonly string[]): CoverageMask {
    const width = rows[0]?.length ?? 0;
    return {
        width,
        height: rows.length,
        data: rows
            .join('')
            .split('')
            .map((c) => (c === '#' ? 1 : 0)),
    };
}

const OPTIONS = { tolerance: 0.5, minArea: 0.5 };

describe('traceLoops', () => {
    it('outlines a single pixel as a diamond through its edge midpoints', () => {
        const loops = traceLoops(mask(['#']));
        expect(loops).toHaveLength(1);
        expect(loops[0]).toHaveLength(4);
        expect(polygonArea(loops[0] ?? [])).toBeCloseTo(0.5);
    });

    it('traces an empty mask to nothing', () => {
        expect(traceLoops(mask(['...', '...']))).toEqual([]);
    });

    it('keeps diagonal pixels as separate loops (4-connectivity)', () => {
        expect(traceLoops(mask(['#.', '.#']))).toHaveLength(2);
        expect(traceLoops(mask(['.#', '#.']))).toHaveLength(2);
    });

    it('traces the outer boundary and a hole', () => {
        const ring = mask(['#####', '#...#', '#...#', '#...#', '#####']);
        const areas = traceLoops(ring)
            .map(polygonArea)
            .sort((a, b) => b - a);
        expect(areas).toHaveLength(2);
        expect(areas[0]).toBeGreaterThan(areas[1] ?? 0);
    });
});

describe('maskFromRgba', () => {
    it('covers pixels whose alpha reaches the threshold', () => {
        const rgba = [0, 0, 0, 255, 9, 9, 9, 10, 1, 2, 3, 128, 0, 0, 0, 0];
        expect(Array.from(maskFromRgba(rgba, 2, 2, 128).data)).toEqual([1, 0, 1, 0]);
    });
});

describe('traceSilhouette', () => {
    it('simplifies a solid block to its four corners, normalised to the mask', () => {
        const [loop] = traceSilhouette(mask(['####', '####', '####', '####']), OPTIONS);
        expect(loop).toHaveLength(4);
        for (const p of loop ?? []) {
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.x).toBeLessThanOrEqual(1);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeLessThanOrEqual(1);
        }
    });

    it('follows an L shape with six corners', () => {
        const [loop] = traceSilhouette(mask(['##....', '##....', '##....', '######', '######']), OPTIONS);
        expect(loop).toHaveLength(6);
    });

    it('drops specks below the minimum area and handles an empty mask', () => {
        expect(traceSilhouette(mask(['#.....', '......', '....##', '....##']), { tolerance: 0.5, minArea: 2 })).toHaveLength(1);
        expect(traceSilhouette({ width: 0, height: 0, data: [] }, OPTIONS)).toEqual([]);
    });
});
