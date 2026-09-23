// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { NO_DOCS } from './documents';
import { NEW_FEATURE, parseFeatureCommon } from './feature-common';

describe('feature common fields', () => {
    it('start with no documents and no level', () => {
        expect(NEW_FEATURE).toEqual({ docs: NO_DOCS, level: null });
    });

    it('parse documents and level, defaulting what is missing or malformed', () => {
        expect(parseFeatureCommon({ docs: { walls: ['w1'] }, level: 'lv1' })).toEqual({ docs: { ...NO_DOCS, walls: ['w1'] }, level: 'lv1' });
        expect(parseFeatureCommon({})).toEqual({ docs: NO_DOCS, level: null });
        expect(parseFeatureCommon({ docs: 'x', level: 3 })).toEqual({ docs: NO_DOCS, level: null });
    });
});
