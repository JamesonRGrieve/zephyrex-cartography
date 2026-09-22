// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { CartographyPath } from '../tools/path';
import { GraphicsRibbonRenderer, STYLES, type DrawSurface } from './renderer';

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

const road: CartographyPath = {
    id: 'a',
    kind: 'road',
    points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
    ],
    halfWidths: [5, 5],
    walls: false,
};

describe('GraphicsRibbonRenderer', () => {
    it('fills a ribbon polygon for a path with the style colour', () => {
        const s = new FakeSurface();
        new GraphicsRibbonRenderer(s).set('a', road, STYLES.road);
        expect(s.filled).toHaveLength(1);
        expect(s.filled[0]?.color).toBe(STYLES.road.fill);
        expect(s.filled[0]?.n ?? 0).toBeGreaterThanOrEqual(6);
    });

    it('removes rather than fills a degenerate (single-point) preview', () => {
        const s = new FakeSurface();
        new GraphicsRibbonRenderer(s).setPreview([{ x: 0, y: 0 }], 5, STYLES.river);
        expect(s.removed.length).toBeGreaterThanOrEqual(1);
        expect(s.filled).toHaveLength(0);
    });

    it('clears the surface', () => {
        const s = new FakeSurface();
        new GraphicsRibbonRenderer(s).clear();
        expect(s.cleared).toBe(1);
    });
});
