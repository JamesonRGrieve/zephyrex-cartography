// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { planDocuments } from './plan';
import { makeRegion } from './region';
import { movementCostOf, NORMAL_COST, parseCostInput, parseMovementCost, storedCost, validCost } from './terrain-cost';

const SQUARE = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
];

describe('terrain movement cost', () => {
    it('keeps only a valid cost other than ordinary ground', () => {
        expect([parseMovementCost(2), parseMovementCost(1), parseMovementCost(6), parseMovementCost('2'), parseMovementCost(undefined)]).toEqual([
            2,
            undefined,
            undefined,
            undefined,
            undefined,
        ]);
        expect([validCost(0), validCost(5), validCost(-1), validCost(Number.NaN)]).toEqual([0, 5, null, null]);
        expect([storedCost(NORMAL_COST), storedCost(3)]).toEqual([undefined, 3]);
        expect([movementCostOf({}), movementCostOf({ movementCost: 2 })]).toEqual([1, 2]);
        expect(['2.5', ' 1 ', '', 'mud', '9'].map(parseCostInput)).toEqual([2.5, 1, null, null, null]);
    });

    it('mirrors difficult ground as a Modify Movement Cost region even when terrain is not mirrored', () => {
        const region = makeRegion('r', 'marsh', SQUARE);
        const muddy = region && { ...region, movementCost: 2 };
        expect(muddy ? planDocuments(muddy).regions : []).toEqual([expect.objectContaining({ behaviour: { kind: 'terrain', difficulties: { walk: 2 } } })]);
        expect(region ? planDocuments(region).regions : ['x']).toEqual([]);
    });
});
