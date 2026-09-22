// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { Feature } from '../tools/feature';
import type { CartographyPath } from '../tools/path';
import { CartographyController, type SceneStore, type WallEmitter } from './controller';
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
    save(features: readonly Feature[]): Promise<void> {
        this.saved.push([...features]);
        return Promise.resolve();
    }
}

class FakeWalls implements WallEmitter {
    readonly emitted: string[] = [];
    emit(path: CartographyPath): Promise<void> {
        this.emitted.push(path.id);
        return Promise.resolve();
    }
}

function make(): { c: CartographyController; r: FakeRenderer; s: FakeStore; w: FakeWalls } {
    const r = new FakeRenderer();
    const s = new FakeStore();
    const w = new FakeWalls();
    let counter = 0;
    const makeId = (): string => {
        counter += 1;
        return `p${counter}`;
    };
    const c = new CartographyController(r, s, w, makeId);
    return { c, r, s, w };
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
});
