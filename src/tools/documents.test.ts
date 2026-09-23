// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { hasDocs, NO_DOCS, parseGeneratedDocs } from './documents';

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
