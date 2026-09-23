// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { BLOCKS_ALL, hasDocs, NO_DOCS, parseGeneratedDocs, wallDocFromSpec } from './documents';

describe('generated docs', () => {
    it('parses a persisted record, dropping junk ids', () => {
        expect(parseGeneratedDocs({ walls: ['a', 3], lights: ['b'], tiles: 'x' })).toEqual({ walls: ['a'], lights: ['b'], tiles: [], regions: [] });
        expect(parseGeneratedDocs(null)).toEqual(NO_DOCS);
    });

    it('reports whether any documents are owned', () => {
        expect(hasDocs(NO_DOCS)).toBe(false);
        expect(hasDocs({ ...NO_DOCS, regions: ['r'] })).toBe(true);
    });
});

describe('wallDocFromSpec', () => {
    it('maps a door flag to a closed door wall blocking every sense', () => {
        expect(wallDocFromSpec({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, door: true })).toEqual({
            a: { x: 0, y: 0 },
            b: { x: 1, y: 0 },
            door: 'door',
            doorState: 'closed',
            blocks: BLOCKS_ALL,
            level: null,
        });
        expect(wallDocFromSpec({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, door: false }, 'L1').door).toBe('none');
        expect(wallDocFromSpec({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, door: false }, 'L1').level).toBe('L1');
    });
});
