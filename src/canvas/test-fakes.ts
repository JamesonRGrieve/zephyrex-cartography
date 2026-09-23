// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * In-memory fakes for the controller's injected ports, shared by the canvas
 * tests. They record every call so tests assert on the declarative effects
 * (what was rendered, persisted, created, deleted) with no Foundry runtime.
 */
import type { Point } from '../geometry/spline';
import { type CatalogStamp, loadPacks } from '../stamps/catalog';
import type { GeneratedDocs, LightDoc, TileDoc, WallDoc } from '../tools/documents';
import type { Feature } from '../tools/feature';
import { CartographyController, type DocumentSink, type SceneStore, type TileUpdate } from './controller';
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
    /** The most recently persisted feature list. */
    last(): readonly Feature[] {
        return this.saved[this.saved.length - 1] ?? [];
    }
}

/** Issues ids `<prefix><n>` from one counter per document type, like a real scene. */
class FakeSink implements DocumentSink {
    readonly walls: WallDoc[][] = [];
    readonly lights: LightDoc[][] = [];
    readonly tiles: TileDoc[][] = [];
    readonly tileUpdates: TileUpdate[][] = [];
    readonly deleted: GeneratedDocs[] = [];
    private readonly counters = { w: 0, L: 0, t: 0 };

    private issue(prefix: 'w' | 'L' | 't', count: number): string[] {
        return Array.from({ length: count }, () => {
            const id = `${prefix}${this.counters[prefix]}`;
            this.counters[prefix] += 1;
            return id;
        });
    }

    async createWalls(walls: readonly WallDoc[]): Promise<string[]> {
        this.walls.push([...walls]);
        await Promise.resolve();
        return this.issue('w', walls.length);
    }
    async createLights(lights: readonly LightDoc[]): Promise<string[]> {
        this.lights.push([...lights]);
        await Promise.resolve();
        return this.issue('L', lights.length);
    }
    async createTiles(tiles: readonly TileDoc[]): Promise<string[]> {
        this.tiles.push([...tiles]);
        await Promise.resolve();
        return this.issue('t', tiles.length);
    }
    async updateTiles(updates: readonly TileUpdate[]): Promise<void> {
        this.tileUpdates.push([...updates]);
        await Promise.resolve();
    }
    async deleteDocuments(docs: GeneratedDocs): Promise<void> {
        this.deleted.push(docs);
        await Promise.resolve();
    }
    /** Every id deleted so far, flattened across document types. */
    deletedIds(): string[] {
        return this.deleted.flatMap((d) => [...d.walls, ...d.lights, ...d.tiles, ...d.regions]);
    }
}

export interface Harness {
    readonly c: CartographyController;
    readonly r: FakeRenderer;
    readonly s: FakeStore;
    readonly d: FakeSink;
}

/** A unit square traced from any image: the silhouette every fake stamp gets. */
export const FAKE_SILHOUETTE: Point[][] = [
    [
        { x: 0.25, y: 0.25 },
        { x: 0.75, y: 0.25 },
        { x: 0.75, y: 0.75 },
        { x: 0.25, y: 0.75 },
    ],
];

/** A controller over fresh fakes and the given catalog stamps, issuing feature ids p1, p2, … */
export function makeHarness(stamps: readonly CatalogStamp[] = [], traced: Point[][] | null = FAKE_SILHOUETTE): Harness {
    const r = new FakeRenderer();
    const s = new FakeStore();
    const d = new FakeSink();
    let counter = 0;
    const c = new CartographyController({
        renderer: r,
        store: s,
        sink: d,
        catalog: { get: (key) => stamps.find((stamp) => stamp.key === key) ?? null },
        silhouettes: { trace: async () => Promise.resolve(traced) },
        makeId: () => {
            counter += 1;
            return `p${counter}`;
        },
    });
    return { c, r, s, d };
}

/** One catalog stamp per definition, loaded through the real pack parser from module `pack`. */
export function catalogStamps(definitions: readonly object[]): readonly CatalogStamp[] {
    const loaded = loadPacks([{ moduleId: 'pack', manifest: { schemaVersion: 1, id: 'pack', name: 'Pack', stamps: definitions } }]);
    if (loaded.errors.length > 0) {
        throw new Error(`invalid test stamps: ${JSON.stringify(loaded.errors)}`);
    }
    return loaded.stamps;
}
