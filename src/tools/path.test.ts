// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DEFAULT_HALF_WIDTH, parsePaths } from './path';

describe('parsePaths', () => {
    it('returns [] for non-array input', () => {
        expect(parsePaths(null)).toEqual([]);
        expect(parsePaths({})).toEqual([]);
        expect(parsePaths(undefined)).toEqual([]);
    });

    it('parses a valid path and normalises widths + walls', () => {
        const raw = [
            {
                id: 'a',
                kind: 'road',
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                ],
                walls: true,
            },
        ];
        const [p] = parsePaths(raw);
        expect(p?.id).toBe('a');
        expect(p?.kind).toBe('road');
        expect(p?.walls).toBe(true);
        expect(p?.halfWidths).toEqual([DEFAULT_HALF_WIDTH, DEFAULT_HALF_WIDTH]);
    });

    it('drops malformed entries (bad kind, too few points, non-objects)', () => {
        const raw = [
            {
                id: 'x',
                kind: 'bad',
                points: [
                    { x: 0, y: 0 },
                    { x: 1, y: 1 },
                ],
            },
            { id: 'y', kind: 'river', points: [{ x: 0, y: 0 }] },
            42,
        ];
        expect(parsePaths(raw)).toEqual([]);
    });

    it('carries explicit per-point widths', () => {
        const raw = [
            {
                id: 'w',
                kind: 'river',
                points: [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 2, y: 0 },
                ],
                halfWidths: [5, 10, 15],
            },
        ];
        expect(parsePaths(raw)[0]?.halfWidths).toEqual([5, 10, 15]);
    });
});
