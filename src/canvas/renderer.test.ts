// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { NO_DOCS } from '../tools/documents';
import type { Feature } from '../tools/feature';
import type { CartographyPath } from '../tools/path';
import type { RegionFeature } from '../tools/region';
import { GraphicsFeatureRenderer, type DrawSurface } from './renderer';

class FakeSurface implements DrawSurface {
    readonly filled: { id: string; n: number; color: number; feather: boolean }[] = [];
    readonly textured: { id: string; n: number; textureFile: string; tint: number; feather: boolean }[] = [];
    readonly removed: string[] = [];
    cleared = 0;
    fill(id: string, polygon: readonly number[], color: number, _alpha: number, feather: boolean): void {
        this.filled.push({ id, n: polygon.length, color, feather });
    }
    fillTextured(id: string, polygon: readonly number[], textureFile: string, tint: number, _alpha: number, feather: boolean): void {
        this.textured.push({ id, n: polygon.length, textureFile, tint, feather });
    }
    remove(id: string): void {
        this.removed.push(id);
    }
    clear(): void {
        this.cleared += 1;
    }
}

const road: CartographyPath = {
    type: 'path',
    id: 'a',
    kind: 'road',
    points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
    ],
    halfWidths: [5, 5],
    walls: false,
    docs: NO_DOCS,
};
const river: Feature = { ...road, id: 'r', kind: 'river' };
const lake: RegionFeature = {
    type: 'region',
    id: 'b',
    biome: 'water',
    points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
    ],
    docs: NO_DOCS,
};
const meadow: Feature = { ...lake, id: 'm', biome: 'grassland' };
const swath: Feature = {
    type: 'stroke',
    id: 'sw',
    biome: 'forest',
    points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
    ],
    radius: 15,
    docs: NO_DOCS,
};
const room: Feature = {
    type: 'room',
    id: 'rm',
    floor: 'dirt',
    points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
    ],
    doors: [],
    docs: NO_DOCS,
};

describe('GraphicsFeatureRenderer', () => {
    it('textures a road ribbon (bundled tile)', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s).set('a', road);
        expect(s.textured).toHaveLength(1);
        expect(s.textured[0]?.textureFile).toBe('road.jpg');
        expect(s.textured[0]?.n ?? 0).toBeGreaterThanOrEqual(6);
    });

    it('renders a river as a flat translucent fill (water is untextured)', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s).set('r', river);
        expect(s.filled).toHaveLength(1);
        expect(s.textured).toHaveLength(0);
    });

    it('textures a land biome region and recolours nothing (white tint)', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s).set('m', meadow);
        expect(s.textured).toHaveLength(1);
        expect(s.textured[0]?.textureFile).toBe('grassland.jpg');
        expect(s.textured[0]?.tint).toBe(0xffffff);
    });

    it('fills a water region with a flat colour (untextured)', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s).set('b', lake);
        expect(s.filled).toHaveLength(1);
        expect(s.textured).toHaveLength(0);
        expect(s.filled[0]?.n ?? 0).toBeGreaterThanOrEqual(6);
    });

    it('textures a brush stroke as a feathered biome swath', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s).set('sw', swath);
        expect(s.textured).toHaveLength(1);
        expect(s.textured[0]?.textureFile).toBe('forest.jpg');
        expect(s.textured[0]?.feather).toBe(true);
    });

    it('renders a room floor textured with a crisp (unfeathered) edge', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s).set('rm', room);
        expect(s.textured).toHaveLength(1);
        expect(s.textured[0]?.textureFile).toBe('dirt.jpg');
        expect(s.textured[0]?.feather).toBe(false);
    });

    it('feathers region edges but keeps paths crisp', () => {
        const s = new FakeSurface();
        const gr = new GraphicsFeatureRenderer(s);
        gr.set('m', meadow); // textured land region
        gr.set('b', lake); // flat water region
        gr.set('a', road); // textured path
        expect(s.textured.find((t) => t.id === 'm')?.feather).toBe(true);
        expect(s.filled.find((f) => f.id === 'b')?.feather).toBe(true);
        expect(s.textured.find((t) => t.id === 'a')?.feather).toBe(false);
    });

    it('clears the surface', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s).clear();
        expect(s.cleared).toBe(1);
    });
});
