// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { Feature } from '../tools/feature';
import { NEW_FEATURE } from '../tools/feature-common';
import type { CartographyPath } from '../tools/path';
import type { RegionFeature } from '../tools/region';
import type { RoomFeature } from '../tools/room';
import type { TextureResolver } from '../tools/texture';
import { GraphicsFeatureRenderer, type DrawSurface } from './renderer';

/** A texture set providing every role as `<role>.jpg`. */
const RESOLVE: TextureResolver = (role) => `${role}.jpg`;

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
    ...NEW_FEATURE,
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
    ...NEW_FEATURE,
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
    ...NEW_FEATURE,
};
const room: RoomFeature = {
    type: 'room',
    id: 'rm',
    floor: 'dirt',
    wall: null,
    wallKind: 'solid',
    points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
    ],
    doors: [],
    ...NEW_FEATURE,
};

describe('GraphicsFeatureRenderer', () => {
    it('textures a road ribbon (bundled tile)', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s, RESOLVE).set('a', road);
        expect(s.textured).toHaveLength(1);
        expect(s.textured[0]?.textureFile).toBe('road.jpg');
        expect(s.textured[0]?.n ?? 0).toBeGreaterThanOrEqual(6);
    });

    it('renders a river as a flat translucent fill (water is untextured)', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s, RESOLVE).set('r', river);
        expect(s.filled).toHaveLength(1);
        expect(s.textured).toHaveLength(0);
    });

    it('textures a land biome region and recolours nothing (white tint)', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s, RESOLVE).set('m', meadow);
        expect(s.textured).toHaveLength(1);
        expect(s.textured[0]?.textureFile).toBe('grassland.jpg');
        expect(s.textured[0]?.tint).toBe(0xffffff);
    });

    it('fills a water region with a flat colour (untextured)', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s, RESOLVE).set('b', lake);
        expect(s.filled).toHaveLength(1);
        expect(s.textured).toHaveLength(0);
        expect(s.filled[0]?.n ?? 0).toBeGreaterThanOrEqual(6);
    });

    it('textures a brush stroke as a feathered biome swath', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s, RESOLVE).set('sw', swath);
        expect(s.textured).toHaveLength(1);
        expect(s.textured[0]?.textureFile).toBe('forest.jpg');
        expect(s.textured[0]?.feather).toBe(true);
    });

    it('renders a room floor textured with a crisp (unfeathered) edge on its exact polygon', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s, RESOLVE).set('rm', room);
        expect(s.textured).toHaveLength(1);
        expect(s.textured[0]?.textureFile).toBe('dirt.jpg');
        expect(s.textured[0]?.feather).toBe(false);
        expect(s.textured[0]?.n).toBe(8);
    });

    it('fills a pack floor material by role, or a flat colour when the set lacks it', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s, (role) => (role === 'floor.oak' ? 'oak.jpg' : null)).set('rm', { ...room, floor: 'floor.oak' });
        expect(s.textured[0]?.textureFile).toBe('oak.jpg');
        const flat = new FakeSurface();
        new GraphicsFeatureRenderer(flat, () => null).set('rm', { ...room, floor: 'floor.oak' });
        expect(flat.filled).toHaveLength(1);
    });

    it('draws one wall band per perimeter segment in the wall material, and removes them with the room', () => {
        const s = new FakeSurface();
        const gr = new GraphicsFeatureRenderer(s, (role) => (role === 'wall.brick' ? 'brick.jpg' : null));
        gr.set('rm', { ...room, wall: 'wall.brick' });
        const bands = s.textured.filter((t) => t.id.startsWith('rm:wall:'));
        expect(bands.map((b) => b.textureFile)).toEqual(['brick.jpg', 'brick.jpg', 'brick.jpg', 'brick.jpg']);
        gr.set('rm', room); // walls no longer drawn
        expect(s.removed.filter((id) => id.startsWith('rm:wall:'))).toHaveLength(4);
        gr.set('rm', { ...room, wall: 'wall.missing' });
        expect(s.filled.filter((f) => f.id.startsWith('rm:wall:'))).toHaveLength(4);
        gr.remove('rm');
        expect(s.removed.filter((id) => id.startsWith('rm:wall:'))).toHaveLength(8);
    });

    it('feathers region edges but keeps paths crisp', () => {
        const s = new FakeSurface();
        const gr = new GraphicsFeatureRenderer(s, RESOLVE);
        gr.set('m', meadow); // textured land region
        gr.set('b', lake); // flat water region
        gr.set('a', road); // textured path
        expect(s.textured.find((t) => t.id === 'm')?.feather).toBe(true);
        expect(s.filled.find((f) => f.id === 'b')?.feather).toBe(true);
        expect(s.textured.find((t) => t.id === 'a')?.feather).toBe(false);
    });

    it('falls back to the flat biome colour for a role the texture set lacks', () => {
        const s = new FakeSurface();
        const gr = new GraphicsFeatureRenderer(s, (role) => (role === 'road' ? 'road.png' : null));
        gr.set('m', meadow);
        gr.set('a', road);
        expect(s.filled.map((f) => f.id)).toEqual(['m']);
        expect(s.textured.map((t) => t.textureFile)).toEqual(['road.png']);
    });

    it('clears the surface', () => {
        const s = new FakeSurface();
        new GraphicsFeatureRenderer(s, RESOLVE).clear();
        expect(s.cleared).toBe(1);
    });
});
