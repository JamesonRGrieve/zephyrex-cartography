// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DEFAULT_AREA_DISPLAY } from './area-effects';
import { areaSettingsOf, isArea } from './areas';
import { LIQUID_LOOKS, makePath } from './path';
import { makeRegion } from './region';
import { makeRoom } from './room';
import { NO_SPAWN } from './spawn';
import { makeStroke } from './stroke';
import { makeZone } from './zone';

const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
];

describe('areas', () => {
    it('are painted ground, rooms and zones, not paths', () => {
        const features = [
            makeRegion('a', 'forest', square, null),
            makeStroke('b', 'sand', square, 20, null),
            makeRoom('c', 'dirt', square),
            makeZone('e', { x: 0, y: 0 }),
            makePath('d', 'road', square, 10, null, LIQUID_LOOKS.water),
        ];
        expect(features.map((f) => (f ? isArea(f) : null))).toEqual([true, true, true, true, false]);
    });

    it('have ordinary ground and no effects until given some', () => {
        const room = makeRoom('c', 'dirt', square);
        expect(room && areaSettingsOf(room)).toEqual({ movementCost: 1, effects: [], display: DEFAULT_AREA_DISPLAY, spawn: NO_SPAWN });
        expect(room && areaSettingsOf({ ...room, movementCost: 2, effects: [{ kind: 'suppressWeather' }] })).toEqual({
            movementCost: 2,
            effects: [{ kind: 'suppressWeather' }],
            display: DEFAULT_AREA_DISPLAY,
            spawn: NO_SPAWN,
        });
    });
});
