// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { Feature } from './feature';
import { featureHit } from './hit';
import { LIQUID_LOOKS, makePath } from './path';
import { makeRegion } from './region';
import { makeRoom } from './room';
import { makeStroke } from './stroke';

describe('featureHit', () => {
    it('hits a region when the point is inside its fill', () => {
        const region = makeRegion('r', 'water', [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
        ]);
        expect(region).not.toBeNull();
        expect(featureHit(region as Feature, { x: 50, y: 50 })).toBe(true);
        expect(featureHit(region as Feature, { x: 200, y: 50 })).toBe(false);
    });

    it('hits a path within its half-width and misses beyond it', () => {
        const road = makePath(
            'p',
            'road',
            [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
            ],
            10,
            false,
            LIQUID_LOOKS.water,
        );
        expect(road).not.toBeNull();
        // 8px off a 10px half-width road: a hit.
        expect(featureHit(road as Feature, { x: 50, y: 8 })).toBe(true);
        // 40px off: a clear miss (beyond half-width + padding).
        expect(featureHit(road as Feature, { x: 50, y: 40 })).toBe(false);
    });

    it('hits a brush stroke within its radius and misses beyond it', () => {
        const stroke = makeStroke(
            's',
            'grassland',
            [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
            ],
            20,
        );
        expect(stroke).not.toBeNull();
        expect(featureHit(stroke as Feature, { x: 50, y: 18 })).toBe(true);
        expect(featureHit(stroke as Feature, { x: 50, y: 60 })).toBe(false);
    });

    it('hits a room when the point is inside its floor', () => {
        const room = makeRoom('rm', 'dirt', [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
        ]);
        expect(room).not.toBeNull();
        expect(featureHit(room as Feature, { x: 50, y: 50 })).toBe(true);
        expect(featureHit(room as Feature, { x: 200, y: 50 })).toBe(false);
    });
});
