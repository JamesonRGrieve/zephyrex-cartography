// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { WallSpec } from '../geometry/wall';
import type { Feature } from '../tools/feature';
import type { CartographyPath } from '../tools/path';
import { CartographyController, type LightEmitter, type SceneStore, type WallEmitter } from './controller';
import type { FeatureRenderer } from './renderer';

class FakeRenderer implements FeatureRenderer {
    readonly setIds: string[] = [];
    readonly removed: string[] = [];
    previews = 0;
    cleared = 0;
    set(id: string, _feature: Feature): void {
        this.setIds.push(id);
    }
    preview(_feature: Feature): void {
        this.previews += 1;
    }
    remove(id: string): void {
        this.removed.push(id);
    }
    clearPreview(): void {}
    clear(): void {
        this.cleared += 1;
    }
}

class FakeStore implements SceneStore {
    data: Feature[] = [];
    readonly saved: Feature[][] = [];
    load(): Feature[] {
        return this.data;
    }
    async save(features: readonly Feature[]): Promise<void> {
        this.saved.push([...features]);
        await Promise.resolve();
    }
}

class FakeWalls implements WallEmitter {
    readonly emitted: string[] = [];
    readonly segmentCalls: number[] = [];
    readonly wallSpecs: WallSpec[][] = [];
    readonly deleted: string[][] = [];
    async emit(path: CartographyPath): Promise<void> {
        this.emitted.push(path.id);
        await Promise.resolve();
    }
    async emitSegments(walls: readonly WallSpec[]): Promise<string[]> {
        this.segmentCalls.push(walls.length);
        this.wallSpecs.push([...walls]);
        await Promise.resolve();
        return walls.map((_, i) => `w${i}`);
    }
    async deleteWalls(ids: readonly string[]): Promise<void> {
        this.deleted.push([...ids]);
        await Promise.resolve();
    }
}

class FakeLights implements LightEmitter {
    readonly lit: { x: number; y: number }[] = [];
    readonly deleted: string[][] = [];
    async emitLight(x: number, y: number): Promise<string | null> {
        this.lit.push({ x, y });
        await Promise.resolve();
        return `L${this.lit.length - 1}`;
    }
    async deleteLights(ids: readonly string[]): Promise<void> {
        this.deleted.push([...ids]);
        await Promise.resolve();
    }
}

function make(): { c: CartographyController; r: FakeRenderer; s: FakeStore; w: FakeWalls; l: FakeLights } {
    const r = new FakeRenderer();
    const s = new FakeStore();
    const w = new FakeWalls();
    const l = new FakeLights();
    let counter = 0;
    const makeId = (): string => {
        counter += 1;
        return `p${counter}`;
    };
    const c = new CartographyController(r, s, w, l, makeId);
    return { c, r, s, w, l };
}

describe('CartographyController', () => {
    it('commits a road path: renders, persists, no walls by default', async () => {
        const { c, r, s, w } = make();
        c.begin({ type: 'path', kind: 'road' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 0 });
        expect(r.previews).toBeGreaterThanOrEqual(1);
        await c.commit();
        expect(r.setIds).toEqual(['p1']);
        expect(s.saved).toHaveLength(1);
        expect(w.emitted).toEqual([]);
    });

    it('commits a freehand brush stroke', async () => {
        const { c, r, s } = make();
        c.begin({ type: 'stroke', biome: 'grassland' }, 'freehand');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 2 });
        c.addPoint({ x: 20, y: 0 });
        await c.commit();
        expect(r.setIds).toEqual(['p1']);
        expect(s.saved).toHaveLength(1);
        expect(s.saved[0]?.[0]?.type).toBe('stroke');
    });

    it('commits a grid-snapped room', async () => {
        const { c, s } = make();
        c.grid = { size: 100, originX: 0, originY: 0 };
        c.begin({ type: 'room', floor: 'dirt' }, 'click');
        c.addPoint({ x: 12, y: 8 });
        c.addPoint({ x: 105, y: 3 });
        c.addPoint({ x: 98, y: 96 });
        await c.commit();
        const saved = s.saved[s.saved.length - 1]?.[0];
        expect(saved?.type).toBe('room');
        expect(saved?.points[0]).toEqual({ x: 0, y: 0 });
        expect(saved?.points[1]).toEqual({ x: 100, y: 0 });
        expect(saved?.points[2]).toEqual({ x: 100, y: 100 });
    });

    it('generates native Foundry walls + a light for a room and cleans them up on removal', async () => {
        const { c, w, l } = make();
        c.begin({ type: 'room', floor: 'dirt' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 100, y: 0 });
        c.addPoint({ x: 100, y: 100 });
        await c.commit(); // p1 — a 3-point room => 3 perimeter segments + 1 centre light
        expect(w.segmentCalls).toEqual([3]);
        expect(l.lit).toHaveLength(1);
        const room = c.getFeature('p1');
        const wallCount = room?.type === 'room' ? room.wallIds.length : -1;
        const lightCount = room?.type === 'room' ? room.lightIds.length : -1;
        expect(wallCount).toBe(3);
        expect(lightCount).toBe(1);
        await c.remove('p1');
        expect(w.deleted).toEqual([['w0', 'w1', 'w2']]);
        expect(l.deleted).toEqual([['L0']]);
    });

    it('re-syncs native walls when a room vertex moves', async () => {
        const { c, w } = make();
        c.begin({ type: 'room', floor: 'dirt' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 100, y: 0 });
        c.addPoint({ x: 100, y: 100 });
        await c.commit(); // p1 — 3 walls
        await c.moveVertex('p1', 1, { x: 120, y: 0 });
        expect(w.deleted).toEqual([['w0', 'w1', 'w2']]); // old walls dropped
        expect(w.segmentCalls).toEqual([3, 3]); // emitted on commit, then re-emitted on edit
    });

    it('toggles a room wall segment into a Foundry door and back', async () => {
        const { c, w } = make();
        c.begin({ type: 'room', floor: 'dirt' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 100, y: 0 });
        c.addPoint({ x: 100, y: 100 });
        await c.commit(); // p1
        expect(c.pickWallSegment({ x: 50, y: 1 }, 8)).toEqual({ id: 'p1', index: 0 });
        await c.toggleDoor('p1', 0);
        const lastSpecs = w.wallSpecs[w.wallSpecs.length - 1];
        expect(lastSpecs?.[0]?.door).toBe(true);
        expect(lastSpecs?.[1]?.door).toBe(false);
        await c.toggleDoor('p1', 0);
        const room = c.getFeature('p1');
        const doorCount = room?.type === 'room' ? room.doors.length : -1;
        expect(doorCount).toBe(0);
    });

    it('commits a biome region', async () => {
        const { c, r, s } = make();
        c.begin({ type: 'region', biome: 'water' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 0 });
        c.addPoint({ x: 5, y: 10 });
        await c.commit();
        expect(r.setIds).toEqual(['p1']);
        expect(s.saved).toHaveLength(1);
    });

    it('emits walls for a path when enabled', async () => {
        const { c, w } = make();
        c.emitWalls = true;
        c.begin({ type: 'path', kind: 'river' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 10 });
        await c.commit();
        expect(w.emitted).toEqual(['p1']);
    });

    it('does not commit a region with too few points', async () => {
        const { c, s } = make();
        c.begin({ type: 'region', biome: 'forest' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 0 });
        await c.commit();
        expect(s.saved).toEqual([]);
        expect(c.drawing).toBe(false);
    });

    it('loads and renders existing features', () => {
        const { c, r, s } = make();
        s.data = [
            {
                type: 'path',
                id: 'a',
                kind: 'road',
                points: [
                    { x: 0, y: 0 },
                    { x: 5, y: 5 },
                ],
                halfWidths: [10, 10],
                walls: false,
            },
        ];
        c.load();
        expect(r.cleared).toBe(1);
        expect(r.setIds).toEqual(['a']);
    });

    it('removes a feature and persists', async () => {
        const { c, r, s } = make();
        s.data = [
            {
                type: 'region',
                id: 'a',
                biome: 'sand',
                points: [
                    { x: 0, y: 0 },
                    { x: 5, y: 0 },
                    { x: 5, y: 5 },
                ],
            },
        ];
        c.load();
        await c.remove('a');
        expect(r.removed).toContain('a');
        expect(s.saved).toHaveLength(1);
    });

    it('undoes and redoes a commit', async () => {
        const { c, s } = make();
        c.begin({ type: 'region', biome: 'water' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 0 });
        c.addPoint({ x: 5, y: 10 });
        await c.commit();
        await c.undo();
        expect(s.saved[s.saved.length - 1]).toEqual([]);
        await c.redo();
        expect(s.saved[s.saved.length - 1]?.map((f) => f.id)).toEqual(['p1']);
    });

    it('reorders features (z-order) and persists the new order', async () => {
        const { c, s } = make();
        c.begin({ type: 'path', kind: 'road' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 0 });
        await c.commit(); // p1
        c.begin({ type: 'path', kind: 'river' }, 'click');
        c.addPoint({ x: 0, y: 20 });
        c.addPoint({ x: 10, y: 20 });
        await c.commit(); // p2, on top
        await c.toBack('p2');
        expect(s.saved[s.saved.length - 1]?.map((f) => f.id)).toEqual(['p2', 'p1']);
        await c.raise('p2');
        expect(s.saved[s.saved.length - 1]?.map((f) => f.id)).toEqual(['p1', 'p2']);
    });

    it('hit-tests and erases the topmost feature under a point', async () => {
        const { c, r } = make();
        c.begin({ type: 'region', biome: 'grassland' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 100, y: 0 });
        c.addPoint({ x: 100, y: 100 });
        c.addPoint({ x: 0, y: 100 });
        await c.commit(); // p1
        expect(c.hitTest({ x: 50, y: 50 })).toBe('p1');
        expect(c.hitTest({ x: 500, y: 500 })).toBeNull();
        expect(await c.erase({ x: 500, y: 500 })).toBe(false);
        expect(await c.erase({ x: 50, y: 50 })).toBe(true);
        expect(r.removed).toContain('p1');
    });

    it('undo restores an erased feature', async () => {
        const { c, s } = make();
        c.begin({ type: 'path', kind: 'road' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 100, y: 0 });
        await c.commit(); // p1
        await c.erase({ x: 50, y: 0 });
        expect(s.saved[s.saved.length - 1]).toEqual([]);
        await c.undo();
        expect(s.saved[s.saved.length - 1]?.map((f) => f.id)).toEqual(['p1']);
    });

    it('picks and moves a control point, persisting the edit', async () => {
        const { c, r, s } = make();
        c.begin({ type: 'path', kind: 'road' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 100, y: 0 });
        await c.commit(); // p1
        expect(c.pickVertex({ x: 2, y: 1 }, 5)).toEqual({ id: 'p1', index: 0 });
        expect(c.pickVertex({ x: 500, y: 500 }, 5)).toBeNull();
        const setsBefore = r.setIds.length;
        expect(await c.moveVertex('p1', 0, { x: 5, y: 5 })).toBe(true);
        expect(c.getFeature('p1')?.points[0]).toEqual({ x: 5, y: 5 });
        expect(r.setIds.length).toBeGreaterThan(setsBefore);
        expect(s.saved[s.saved.length - 1]?.[0]?.points[0]).toEqual({ x: 5, y: 5 });
    });

    it('deletes a control point and undoes the deletion', async () => {
        const { c, s } = make();
        c.begin({ type: 'region', biome: 'sand' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 0 });
        c.addPoint({ x: 10, y: 10 });
        c.addPoint({ x: 0, y: 10 });
        await c.commit(); // p1, 4 points
        expect(await c.deleteVertex('p1', 0)).toBe(true);
        expect(c.getFeature('p1')?.points).toHaveLength(3);
        // A 3-point region cannot lose another vertex.
        expect(await c.deleteVertex('p1', 0)).toBe(false);
        await c.undo();
        expect(c.getFeature('p1')?.points).toHaveLength(4);
        expect(s.saved.length).toBeGreaterThan(0);
    });
});
