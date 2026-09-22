// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { Feature } from '../tools/feature';
import { GraphicsFeatureRenderer, type DrawSurface } from './renderer';

class FakeSurface implements DrawSurface {
    readonly filled: { id: string; n: number; color: number }[] = [];
    readonly removed: string[] = [];
    cleared = 0;
    fill(id: string, polygon: readonly number[], color: number, _alpha: number): void {
        this.filled.push({ id, n: polygon.length, color });
    }
    remove(id: string): void {
        this.removed.push(id);
    }
    clear(): void {
        this.cleared += 1;
    }
}

const road: Feature = {
    type: 'path',
    id: 'a',
    kind: 'road',
    points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
    ],
    halfWidths: [5, 5],
    walls: false,
};
const lake: Feature = {
    type: 'region',
    id: 'b',
    biome: 'water',
    points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
    ],
};

describe('GraphicsFeatureRenderer', () => {
    it('fills a ribbon polygon for a path', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s).set('a', road);
        expect(s.filled).toHaveLength(1);
        expect(s.filled[0]?.n ?? 0).toBeGreaterThanOrEqual(6);
    });

    it('fills a closed polygon for a biome region', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s).set('b', lake);
        expect(s.filled).toHaveLength(1);
        expect(s.filled[0]?.n ?? 0).toBeGreaterThanOrEqual(6);
    });

    it('clears the surface', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s).clear();
        expect(s.cleared).toBe(1);
    });
});
