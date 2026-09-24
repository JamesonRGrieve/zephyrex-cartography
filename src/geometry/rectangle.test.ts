// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { corners, rectangleOf } from './rectangle';

const room = [
    { x: 100, y: 100 },
    { x: 400, y: 100 },
    { x: 400, y: 300 },
    { x: 100, y: 300 },
];

describe('rectangleOf', () => {
    it('reads an axis-aligned rectangle, either way round', () => {
        expect(rectangleOf(room)).toEqual({ centre: { x: 250, y: 200 }, width: 300, height: 200, rotation: 0 });
        // Reversed, the first edge runs from the bottom-left corner to the bottom-right.
        expect(rectangleOf([...room].reverse())).toEqual({ centre: { x: 250, y: 200 }, width: 300, height: 200, rotation: 0 });
    });

    it('ignores a door’s split points and repeated vertices', () => {
        const split = [room[0], { x: 200, y: 100 }, { x: 300, y: 100 }, room[1], room[2], room[2], room[3]].filter((p) => p !== undefined);
        expect(rectangleOf(split)).toEqual(rectangleOf(room));
        expect(corners(split)).toEqual(room);
    });

    it('reads a rotated rectangle, its rotation the first edge’s direction', () => {
        const turned = rectangleOf([
            { x: 0, y: 0 },
            { x: 30, y: 40 },
            { x: -10, y: 70 },
            { x: -40, y: 30 },
        ]);
        expect(turned?.width).toBeCloseTo(50);
        expect(turned?.height).toBeCloseTo(50);
        expect(turned?.rotation).toBeCloseTo(53.13, 1);
        expect(turned?.centre.x).toBeCloseTo(-5);
        expect(turned?.centre.y).toBeCloseTo(35);
    });

    it('is null for anything else: a triangle, an L, a rhombus, a trapezium, a sliver', () => {
        expect(rectangleOf(room.slice(0, 3))).toBeNull();
        expect(
            rectangleOf([
                { x: 0, y: 0 },
                { x: 200, y: 0 },
                { x: 200, y: 100 },
                { x: 100, y: 100 },
                { x: 100, y: 200 },
                { x: 0, y: 200 },
            ]),
        ).toBeNull();
        expect(
            rectangleOf([
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 150, y: 100 },
                { x: 50, y: 100 },
            ]),
        ).toBeNull();
        expect(
            rectangleOf([
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 80, y: 100 },
                { x: 20, y: 100 },
            ]),
        ).toBeNull();
        expect(
            rectangleOf([
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 0 },
                { x: 0, y: 0 },
            ]),
        ).toBeNull();
    });
});
