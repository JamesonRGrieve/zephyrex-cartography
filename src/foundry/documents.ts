// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The {@link DocumentSink} over the live scene: writes the walls, lights,
 * sounds, tiles and regions features generate, one staged transaction at a
 * time, as a single `modifyBatch` — so an edit, an undo or a whole generated
 * map lands entirely or not at all. Foundry owns the documents from there
 * (vision, doors, lighting, tile rendering, teleports); this is only the
 * write boundary.
 */
import type { DocumentSink } from '../canvas/controller';
import type { DocumentKind, StagedWrite } from '../canvas/staged-changes';
import type { LightSource, RegionDoc } from '../tools/documents';
import type { BatchOperation, EmbeddedCollection, EmbeddedName, FoundryScene, IdentifiedCreateData, ModifyBatch, RegionCreateData } from './boundary';
import { lightCreateData, regionCreateData, soundCreateData, tileCreateData, wallCreateData } from './translate';

export interface SinkOptions {
    /** A new document id; every document is created with an id chosen up front. */
    readonly makeId: () => string;
    /** Applies one transaction of operations. */
    readonly modifyBatch: ModifyBatch;
    /** The display name of a generated region. */
    readonly regionName: (region: RegionDoc) => string;
    /** The display name of a generated light. */
    readonly lightName: (source: LightSource) => string;
    /** The display name of a stamp's sound, from the stamp's name. */
    readonly soundName: (stampName: string) => string;
}

/** Each generated kind's Foundry document name and its collection on a scene. */
const EMBEDDED: readonly [DocumentKind, EmbeddedName, (scene: FoundryScene) => EmbeddedCollection][] = [
    ['walls', 'Wall', (scene) => scene.walls],
    ['lights', 'AmbientLight', (scene) => scene.lights],
    ['sounds', 'AmbientSound', (scene) => scene.sounds],
    ['tiles', 'Tile', (scene) => scene.tiles],
    ['regions', 'Region', (scene) => scene.regions],
];

export class FoundryDocumentSink implements DocumentSink {
    constructor(private readonly getScene: () => FoundryScene | null, private readonly options: SinkOptions) {}

    newId(_kind: DocumentKind): string {
        return this.options.makeId();
    }

    async write(write: StagedWrite): Promise<void> {
        const scene = this.getScene();
        const sceneId = scene?.id;
        if (!scene || sceneId === null || sceneId === undefined) {
            return;
        }
        // A GM may have deleted a document by hand, and updating a missing one fails the whole batch: a missing tile is
        // left to its feature's next sync, a missing kept-id region is created afresh.
        const tileUpdates = write.tileUpdates.filter(({ id }) => scene.tiles.has(id)).map(({ id, doc }) => ({ _id: id, ...tileCreateData(doc) }));
        const replaced = write.regionUpdates.flatMap(({ id, doc }) => regionCreateData([doc], [id], sceneId, this.options.regionName));
        const regionUpdates = replaced.filter((region) => scene.regions.has(region._id)).map(({ behaviors: _behaviors, ...region }) => region);
        const recreated = replaced.filter((region) => !scene.regions.has(region._id));
        const operations = [...deleteOperations(scene, write), ...this.createOperations(scene, sceneId, write, recreated)];
        if (tileUpdates.length > 0) {
            operations.push({ action: 'update', documentName: 'Tile', parent: scene, updates: tileUpdates });
        }
        if (regionUpdates.length > 0) {
            operations.push({ action: 'update', documentName: 'Region', parent: scene, updates: regionUpdates });
        }
        if (operations.length > 0) {
            await this.options.modifyBatch(operations);
        }
    }

    private createOperations(scene: FoundryScene, sceneId: string, write: StagedWrite, recreated: readonly RegionCreateData[]): BatchOperation[] {
        const { grid } = scene;
        const regions = [
            ...write.regions.flatMap((group) =>
                regionCreateData(group.regions, group.ids, sceneId, this.options.regionName).filter((region) => !group.cancelled.includes(region._id)),
            ),
            ...recreated,
        ];
        const creates: [EmbeddedName, readonly IdentifiedCreateData[]][] = [
            ['Wall', write.walls.map(({ id, doc }) => ({ _id: id, ...wallCreateData(doc, grid) }))],
            ['AmbientLight', write.lights.map(({ id, doc }) => ({ _id: id, ...lightCreateData(doc, grid, this.options.lightName(doc.source)) }))],
            ['AmbientSound', write.sounds.map(({ id, doc }) => ({ _id: id, ...soundCreateData(doc, grid, this.options.soundName(doc.name)) }))],
            ['Tile', write.tiles.map(({ id, doc }) => ({ _id: id, ...tileCreateData(doc) }))],
            ['Region', regions],
        ];
        return creates
            .filter(([, data]) => data.length > 0)
            .map(([documentName, data]) => ({ action: 'create', documentName, parent: scene, data, keepId: true }));
    }
}

/** Deletes of what is still on the scene: a GM may already have deleted some by hand, and deleting a missing id makes Foundry throw. */
function deleteOperations(scene: FoundryScene, write: StagedWrite): BatchOperation[] {
    const operations: BatchOperation[] = [];
    for (const [kind, documentName, collectionOf] of EMBEDDED) {
        const collection = collectionOf(scene);
        const ids = write.deletes[kind].filter((id) => collection.has(id));
        if (ids.length > 0) {
            operations.push({ action: 'delete', documentName, parent: scene, ids });
        }
    }
    return operations;
}
