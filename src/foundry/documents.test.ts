// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { StagedWrite } from '../canvas/staged-changes';
import { BLOCKS_ALL, NO_DOCS, type RegionDoc, type TileDoc, type WallDoc } from '../tools/documents';
import type { BatchOperation, FoundryScene } from './boundary';
import { FoundryDocumentSink } from './documents';

const WALL: WallDoc = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, door: 'none', doorState: 'closed', blocks: BLOCKS_ALL, level: null };
const TILE: TileDoc = { name: 'Crate', src: 'crate.webp', x: 0, y: 0, width: 100, height: 100, rotation: 0, elevation: 0, level: null, featureId: 'p1' };
const REGION: RegionDoc = {
    id: null,
    label: { kind: 'terrain', biome: 'forest' },
    polygon: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
    ],
    bottom: null,
    top: null,
    level: null,
    teleport: null,
};

const NOTHING: StagedWrite = { deletes: NO_DOCS, walls: [], lights: [], tiles: [], sounds: [], regions: [], tileUpdates: [], regionUpdates: [] };

/** A scene holding the given ids, with every embedded write unused (the sink writes only through modifyBatch). */
function scene(present: readonly string[], id: string | null = 'sc'): FoundryScene {
    const collection = { has: (docId: string) => present.includes(docId) };
    const unused = async (): Promise<never> => Promise.reject(new Error('the sink writes only through modifyBatch'));
    return {
        id,
        name: 'Town',
        dimensions: { sceneX: 0, sceneY: 0, sceneWidth: 1000, sceneHeight: 1000, size: 100 },
        initialLevel: null,
        grid: { size: 100, distance: 5 },
        walls: collection,
        lights: collection,
        sounds: collection,
        tiles: collection,
        regions: collection,
        levels: { contents: [], size: 0 },
        getFlag: () => null,
        setFlag: unused,
        createEmbeddedDocuments: unused,
        updateEmbeddedDocuments: unused,
        deleteEmbeddedDocuments: unused,
    };
}

function sink(target: FoundryScene | null): { sink: FoundryDocumentSink; batches: BatchOperation[][] } {
    const batches: BatchOperation[][] = [];
    let counter = 0;
    return {
        batches,
        sink: new FoundryDocumentSink(() => target, {
            makeId: () => {
                counter += 1;
                return `id${counter}`;
            },
            modifyBatch: async (operations) => {
                batches.push([...operations]);
                await Promise.resolve();
            },
            regionName: () => 'Region',
            lightName: () => 'Light',
            soundName: (stampName) => stampName,
        }),
    };
}

describe('FoundryDocumentSink', () => {
    it('issues ids from its id source for every kind', () => {
        const { sink: s } = sink(scene([]));
        expect([s.newId('walls'), s.newId('regions')]).toEqual(['id1', 'id2']);
    });

    it('writes a whole transaction as one batch: deletes, then creates with their ids, then tile updates', async () => {
        const target = scene(['w1', 't1', 't3']);
        const { sink: s, batches } = sink(target);
        await s.write({
            ...NOTHING,
            deletes: { ...NO_DOCS, walls: ['w1', 'w-missing'], tiles: ['t1'] },
            walls: [{ id: 'w2', doc: WALL }],
            tiles: [{ id: 't2', doc: TILE }],
            tileUpdates: [
                { id: 't3', doc: TILE },
                { id: 't-deleted-by-hand', doc: TILE },
            ],
        });
        expect(batches).toHaveLength(1);
        const [batch] = batches;
        expect(batch?.map((op) => [op.action, op.documentName])).toEqual([
            ['delete', 'Wall'],
            ['delete', 'Tile'],
            ['create', 'Wall'],
            ['create', 'Tile'],
            ['update', 'Tile'],
        ]);
        expect(batch?.[0]).toEqual({ action: 'delete', documentName: 'Wall', parent: target, ids: ['w1'] });
        expect(batch?.[2]).toMatchObject({ action: 'create', parent: target, keepId: true, data: [{ _id: 'w2', c: [0, 0, 100, 0] }] });
        expect(batch?.[4]).toMatchObject({ action: 'update', updates: [{ _id: 't3', name: 'Crate' }] });
        expect(batch?.[4]).toHaveProperty('updates.length', 1);
    });

    it('redraws a kept-id region in place without touching its behaviours, and recreates one deleted by hand', async () => {
        const { sink: s, batches } = sink(scene(['kept']));
        await s.write({
            ...NOTHING,
            regionUpdates: [
                { id: 'kept', doc: { ...REGION, id: 'kept' } },
                { id: 'gone', doc: { ...REGION, id: 'gone' } },
            ],
        });
        const [batch] = batches;
        expect(batch?.map((op) => [op.action, op.documentName])).toEqual([
            ['create', 'Region'],
            ['update', 'Region'],
        ]);
        expect(batch?.[0]).toMatchObject({ data: [{ _id: 'gone', behaviors: [] }] });
        expect(batch?.[1]).toMatchObject({ updates: [{ _id: 'kept', shapes: [{ type: 'polygon' }] }] });
        expect(batch?.[1]).not.toHaveProperty('updates.0.behaviors');
    });

    it('creates staged regions under their ids, leaving out cancelled ones', async () => {
        const { sink: s, batches } = sink(scene([]));
        await s.write({ ...NOTHING, regions: [{ ids: ['r1', 'r2'], regions: [REGION, REGION], cancelled: ['r1'] }] });
        expect(batches[0]).toEqual([expect.objectContaining({ action: 'create', documentName: 'Region', data: [expect.objectContaining({ _id: 'r2' })] })]);
    });

    it('writes nothing for an empty transaction, a transaction of missing ids, or no scene', async () => {
        const empty = sink(scene([]));
        await empty.sink.write(NOTHING);
        await empty.sink.write({ ...NOTHING, deletes: { ...NO_DOCS, lights: ['L1'] } });
        const unsaved = sink(scene([], null));
        await unsaved.sink.write({ ...NOTHING, walls: [{ id: 'w', doc: WALL }] });
        const none = sink(null);
        await none.sink.write({ ...NOTHING, walls: [{ id: 'w', doc: WALL }] });
        expect([...empty.batches, ...unsaved.batches, ...none.batches]).toEqual([]);
    });
});
