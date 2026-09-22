// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { isRegion, parseFeatures } from './feature';

describe('parseFeatures', () => {
    it('parses a mixed blob of paths and regions, dropping junk', () => {
        const raw = [
            {
                id: 'p',
                kind: 'road',
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                ],
            },
            {
                type: 'region',
                id: 'r',
                biome: 'water',
                points: [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 0, y: 1 },
                ],
            },
            42,
            null,
            { id: 'bad', kind: 'nope' },
        ];
        const features = parseFeatures(raw);
        expect(features).toHaveLength(2);
        expect(features.filter(isRegion)).toHaveLength(1);
    });

    it('returns [] for non-array input', () => {
        expect(parseFeatures(null)).toEqual([]);
        expect(parseFeatures({})).toEqual([]);
    });
});
