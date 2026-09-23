// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * In-memory fakes for the controller's injected ports, shared by the canvas
 * tests. They record every call so tests assert on the declarative effects
 * (what was rendered, persisted, created, deleted) with no Foundry runtime.
 */
import type { Point } from '../geometry/spline';
import { type CatalogStamp, loadPacks } from '../stamps/catalog';
import type { GeneratedDocs, LightDoc, RegionDoc, TileDoc, WallDoc } from '../tools/documents';
import type { Feature } from '../tools/feature';
import type { Level } from '../tools/levels';
import type { SceneFrame } from '../tools/submap';
import { CartographyController, type DocumentSink, type LevelStore, type SceneStore, type TileUpdate, type WorldScenes } from './controller';
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
    readonly regions: RegionDoc[][] = [];
    readonly deleted: GeneratedDocs[] = [];
    private readonly counters = { w: 0, L: 0, t: 0, r: 0 };

    private issue(prefix: 'w' | 'L' | 't' | 'r', count: number): string[] {
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
    async createRegions(regions: readonly RegionDoc[]): Promise<string[]> {
        this.regions.push([...regions]);
        await Promise.resolve();
        return this.issue('r', regions.length);
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

/** Levels held in memory, issuing ids `lv1`, `lv2`, … */
class FakeLevels implements LevelStore {
    levels: Level[] = [];
    private counter = 0;
    load(): Level[] {
        return [...this.levels];
    }
    async create(level: Omit<Level, 'id'>): Promise<string> {
        this.counter += 1;
        const id = `lv${this.counter}`;
        this.levels.push({ id, ...level });
        await Promise.resolve();
        return id;
    }
    async update(id: string, patch: Partial<Omit<Level, 'id'>>): Promise<void> {
        this.levels = this.levels.map((level) => (level.id === id ? { ...level, ...patch } : level));
        await Promise.resolve();
    }
    async remove(id: string): Promise<void> {
        this.levels = this.levels.filter((level) => level.id !== id);
        await Promise.resolve();
    }
}

/** A world of scenes in memory: the current one is `here` ("Town"); created interiors are `sc1`, `sc2`, … */
class FakeScenes implements WorldScenes {
    readonly names = new Map<string, string>([
        ['here', 'Town'],
        ['vault', 'Vault'],
    ]);
    readonly regions: { scene: string; region: RegionDoc }[] = [];
    readonly deleted: { scene: string; region: string }[] = [];
    private counter = 0;
    current(): { id: string; name: string } {
        return { id: 'here', name: 'Town' };
    }
    name(sceneId: string): string | null {
        return this.names.get(sceneId) ?? null;
    }
    frame(sceneId: string): SceneFrame | null {
        return this.names.has(sceneId) ? { x: 0, y: 0, width: 1000, height: 800, gridSize: 100 } : null;
    }
    async createScene(sceneName: string): Promise<string> {
        this.counter += 1;
        const id = `sc${this.counter}`;
        this.names.set(id, sceneName);
        await Promise.resolve();
        return id;
    }
    async createRegion(sceneId: string, region: RegionDoc): Promise<boolean> {
        this.regions.push({ scene: sceneId, region });
        await Promise.resolve();
        return this.names.has(sceneId);
    }
    async deleteRegion(sceneId: string, regionId: string): Promise<void> {
        this.deleted.push({ scene: sceneId, region: regionId });
        await Promise.resolve();
    }
}

export interface Harness {
    readonly c: CartographyController;
    readonly r: FakeRenderer;
    readonly s: FakeStore;
    readonly d: FakeSink;
    readonly l: FakeLevels;
    readonly w: FakeScenes;
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
    const l = new FakeLevels();
    const w = new FakeScenes();
    let counter = 0;
    const c = new CartographyController({
        renderer: r,
        store: s,
        sink: d,
        levels: l,
        scenes: w,
        catalog: { get: (key) => stamps.find((stamp) => stamp.key === key) ?? null },
        silhouettes: { trace: async () => Promise.resolve(traced) },
        makeId: () => {
            counter += 1;
            return `p${counter}`;
        },
    });
    return { c, r, s, d, l, w };
}

/** One catalog stamp per definition, loaded through the real pack parser from module `pack`. */
export function catalogStamps(definitions: readonly object[]): readonly CatalogStamp[] {
    const loaded = loadPacks([{ moduleId: 'pack', manifest: { schemaVersion: 1, id: 'pack', name: 'Pack', stamps: definitions } }]);
    if (loaded.errors.length > 0) {
        throw new Error(`invalid test stamps: ${JSON.stringify(loaded.errors)}`);
    }
    return loaded.stamps;
}
