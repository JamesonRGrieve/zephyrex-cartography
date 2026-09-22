// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { CartographyPath } from '../tools/path';
import { CartographyController, type SceneStore, type WallEmitter } from './controller';
import type { RibbonRenderer, RibbonStyle } from './renderer';

class FakeRenderer implements RibbonRenderer {
    readonly setIds: string[] = [];
    readonly removed: string[] = [];
    previews = 0;
    cleared = 0;
    set(id: string, _path: CartographyPath, _style: RibbonStyle): void {
        this.setIds.push(id);
    }
    setPreview(): void {
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
    data: CartographyPath[] = [];
    readonly saved: CartographyPath[][] = [];
    load(): CartographyPath[] {
        return this.data;
    }
    save(paths: readonly CartographyPath[]): Promise<void> {
        this.saved.push([...paths]);
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
    it('commits a drawn path: renders, persists, no walls by default', async () => {
        const { c, r, s, w } = make();
        c.begin('road', 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 0 });
        expect(c.drawing).toBe(true);
        expect(r.previews).toBe(1);
        await c.commit();
        expect(c.drawing).toBe(false);
        expect(r.setIds).toEqual(['p1']);
        expect(s.saved).toHaveLength(1);
        expect(w.emitted).toEqual([]);
    });

    it('emits walls when enabled', async () => {
        const { c, w } = make();
        c.emitWalls = true;
        c.begin('river', 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 10 });
        await c.commit();
        expect(w.emitted).toEqual(['p1']);
    });

    it('does not commit a one-point path', async () => {
        const { c, s } = make();
        c.begin('road', 'click');
        c.addPoint({ x: 0, y: 0 });
        await c.commit();
        expect(s.saved).toEqual([]);
        expect(c.drawing).toBe(false);
    });

    it('loads and renders existing paths', () => {
        const { c, r, s } = make();
        s.data = [
            {
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

    it('removes a path and persists', async () => {
        const { c, r, s } = make();
        s.data = [
            {
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
        await c.remove('a');
        expect(r.removed).toContain('a');
        expect(s.saved).toHaveLength(1);
    });
});
