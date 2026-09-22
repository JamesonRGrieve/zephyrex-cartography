// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DEFAULT_HALF_WIDTH, makePath, parsePath } from './path';

describe('parsePath', () => {
    it('returns null for non-path input', () => {
        expect(parsePath(null)).toBeNull();
        expect(parsePath(42)).toBeNull();
        expect(
            parsePath({
                id: 'x',
                kind: 'bad',
                points: [
                    { x: 0, y: 0 },
                    { x: 1, y: 1 },
                ],
            }),
        ).toBeNull();
        expect(parsePath({ id: 'y', kind: 'river', points: [{ x: 0, y: 0 }] })).toBeNull();
    });

    it('parses a valid path with the type tag + normalised widths', () => {
        const p = parsePath({
            id: 'a',
            kind: 'road',
            points: [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
            ],
            walls: true,
        });
        expect(p?.type).toBe('path');
        expect(p?.kind).toBe('road');
        expect(p?.walls).toBe(true);
        expect(p?.halfWidths).toEqual([DEFAULT_HALF_WIDTH, DEFAULT_HALF_WIDTH]);
    });

    it('carries explicit per-point widths', () => {
        const p = parsePath({
            id: 'w',
            kind: 'river',
            points: [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 2, y: 0 },
            ],
            halfWidths: [5, 10, 15],
        });
        expect(p?.halfWidths).toEqual([5, 10, 15]);
    });
});

describe('makePath', () => {
    it('builds a path from a point stream with uniform width', () => {
        const p = makePath(
            'id',
            'road',
            [
                { x: 0, y: 0 },
                { x: 5, y: 5 },
            ],
            8,
            true,
        );
        expect(p?.type).toBe('path');
        expect(p?.halfWidths).toEqual([8, 8]);
        expect(p?.walls).toBe(true);
    });

    it('returns null for fewer than two points', () => {
        expect(makePath('id', 'road', [{ x: 0, y: 0 }], 8, false)).toBeNull();
    });
});
