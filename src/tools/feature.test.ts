// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { isRegion, isRoom, isStroke, parseFeatures } from './feature';

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
            {
                type: 'stroke',
                id: 's',
                biome: 'grassland',
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 5 },
                ],
            },
            {
                type: 'room',
                id: 'rm',
                floor: 'dirt',
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                    { x: 10, y: 10 },
                ],
            },
            42,
            null,
            { id: 'bad', kind: 'nope' },
        ];
        const features = parseFeatures(raw);
        expect(features).toHaveLength(4);
        expect(features.filter(isRegion)).toHaveLength(1);
        expect(features.filter(isStroke)).toHaveLength(1);
        expect(features.filter(isRoom)).toHaveLength(1);
    });

    it('returns [] for non-array input', () => {
        expect(parseFeatures(null)).toEqual([]);
        expect(parseFeatures({})).toEqual([]);
    });
});
