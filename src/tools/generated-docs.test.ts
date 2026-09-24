// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { allDocIds, hasDocs, NO_DOCS, parseGeneratedDocs } from './generated-docs';

describe('generated docs', () => {
    it('parses a persisted record, dropping junk ids', () => {
        expect(parseGeneratedDocs({ walls: ['a', 3], lights: ['b'], tiles: 'x' })).toEqual({ ...NO_DOCS, walls: ['a'], lights: ['b'] });
        expect(parseGeneratedDocs({ notes: ['n0', 7] }).notes).toEqual(['n0']);
        expect(parseGeneratedDocs(null)).toEqual(NO_DOCS);
    });

    it('reports whether any documents are owned', () => {
        expect(hasDocs(NO_DOCS)).toBe(false);
        expect(hasDocs({ ...NO_DOCS, regions: ['r'] })).toBe(true);
        expect(hasDocs({ ...NO_DOCS, sounds: ['s'] })).toBe(true);
    });

    it('reads recorded sounds', () => {
        expect(parseGeneratedDocs({ sounds: ['s0', 7] }).sounds).toEqual(['s0']);
    });

    it('lists every id, whatever its document type', () => {
        expect(allDocIds({ ...NO_DOCS, walls: ['w'], drawings: ['d'], notes: ['n'] })).toEqual(['w', 'n', 'd']);
    });
});
