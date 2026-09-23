// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRUSH_RADIUS, makeStroke, parseStroke, withStrokePoints } from './stroke';

const pts = [
    { x: 0, y: 0 },
    { x: 10, y: 5 },
    { x: 20, y: 0 },
];

describe('makeStroke', () => {
    it('builds a stroke from >= 2 points', () => {
        const s = makeStroke('s', 'grassland', pts, 30);
        expect(s?.type).toBe('stroke');
        expect(s?.biome).toBe('grassland');
        expect(s?.radius).toBe(30);
        expect(s?.points).toHaveLength(3);
    });

    it('returns null for fewer than two points', () => {
        expect(makeStroke('s', 'sand', [{ x: 0, y: 0 }], 10)).toBeNull();
    });
});

describe('withStrokePoints', () => {
    it('rebuilds with new points, preserving biome + radius', () => {
        const s = makeStroke('s', 'forest', pts, 15);
        expect(s).not.toBeNull();
        const moved = s
            ? withStrokePoints(s, [
                  { x: 1, y: 1 },
                  { x: 2, y: 2 },
              ])
            : null;
        expect(moved?.points).toHaveLength(2);
        expect(moved?.biome).toBe('forest');
        expect(moved?.radius).toBe(15);
    });
});

describe('parseStroke', () => {
    it('parses a valid stroke and defaults a missing radius', () => {
        const s = parseStroke({ type: 'stroke', id: 'a', biome: 'lava', points: pts });
        expect(s?.biome).toBe('lava');
        expect(s?.radius).toBe(DEFAULT_BRUSH_RADIUS);
    });

    it('rejects non-strokes, unknown biomes, and too-few points', () => {
        expect(parseStroke({ type: 'region', id: 'x' })).toBeNull();
        expect(parseStroke({ type: 'stroke', id: 'y', biome: 'quicksand', points: pts })).toBeNull();
        expect(parseStroke({ type: 'stroke', id: 'z', biome: 'sand', points: [{ x: 0, y: 0 }] })).toBeNull();
    });
});
