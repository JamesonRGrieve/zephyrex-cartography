// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The {@link DocumentSink} over the live scene: creates, updates and deletes the
 * walls, lights and tiles features generate. Foundry owns the documents from
 * there (vision, doors, lighting, tile rendering); this is only the
 * create/update/delete boundary.
 */
import type { DocumentSink, TileUpdate } from '../canvas/controller';
import type { GeneratedDocs, LightDoc, TileDoc, WallDoc } from '../tools/documents';
import { isRecord } from '../tools/guards';
import type { EmbeddedCollection, EmbeddedName, FoundryScene } from './boundary';
import { lightCreateData, tileCreateData, wallCreateData } from './translate';

// eslint-disable-next-line no-restricted-syntax -- boundary: parses Foundry's createEmbeddedDocuments result (an array of created documents) to collect their ids
function extractIds(created: unknown): string[] {
    if (!Array.isArray(created)) {
        return [];
    }
    const ids: string[] = [];
    for (const doc of created) {
        if (isRecord(doc) && typeof doc['id'] === 'string') {
            ids.push(doc['id']);
        }
    }
    return ids;
}

export class FoundryDocumentSink implements DocumentSink {
    constructor(private readonly getScene: () => FoundryScene | null) {}

    async createWalls(walls: readonly WallDoc[]): Promise<string[]> {
        const scene = this.getScene();
        return scene ? extractIds(await scene.createEmbeddedDocuments('Wall', walls.map(wallCreateData))) : [];
    }

    async createLights(lights: readonly LightDoc[]): Promise<string[]> {
        const scene = this.getScene();
        return scene
            ? extractIds(
                  await scene.createEmbeddedDocuments(
                      'AmbientLight',
                      lights.map((l) => lightCreateData(l, scene.grid)),
                  ),
              )
            : [];
    }

    async createTiles(tiles: readonly TileDoc[]): Promise<string[]> {
        const scene = this.getScene();
        return scene ? extractIds(await scene.createEmbeddedDocuments('Tile', tiles.map(tileCreateData))) : [];
    }

    async updateTiles(updates: readonly TileUpdate[]): Promise<void> {
        const scene = this.getScene();
        if (scene && updates.length > 0) {
            await scene.updateEmbeddedDocuments(
                'Tile',
                updates.map(({ id, tile }) => ({ _id: id, ...tileCreateData(tile) })),
            );
        }
    }

    async deleteDocuments(docs: GeneratedDocs): Promise<void> {
        const scene = this.getScene();
        if (!scene) {
            return;
        }
        // A GM may already have deleted some by hand; deleting a missing id makes Foundry throw.
        const batches: [EmbeddedName, EmbeddedCollection, readonly string[]][] = [
            ['Wall', scene.walls, docs.walls],
            ['AmbientLight', scene.lights, docs.lights],
            ['Tile', scene.tiles, docs.tiles],
        ];
        await Promise.all(
            batches.map(async ([embeddedName, collection, ids]) => {
                const present = ids.filter((id) => collection.has(id));
                if (present.length > 0) {
                    await scene.deleteEmbeddedDocuments(embeddedName, present);
                }
            }),
        );
    }
}
