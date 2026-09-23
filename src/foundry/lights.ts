// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Emits native Foundry ambient lights for rooms (one at the room centre) and
 * deletes them by id. Foundry's lighting layer renders and enforces them
 * automatically — this is only the create/delete boundary.
 */
import type { LightEmitter } from '../canvas/controller';
import { isRecord } from '../tools/path';
import type { FoundryScene, LightCreateData } from './boundary';

/** Default dim / bright radii (scene px) for an auto-placed room light. */
const DEFAULT_DIM = 300;
const DEFAULT_BRIGHT = 150;

// eslint-disable-next-line no-restricted-syntax -- boundary: reads the id of the first created document from Foundry's createEmbeddedDocuments result
function firstId(created: unknown): string | null {
    if (!Array.isArray(created)) {
        return null;
    }
    const doc = created[0];
    return isRecord(doc) && typeof doc['id'] === 'string' ? doc['id'] : null;
}

export class FoundryLightEmitter implements LightEmitter {
    constructor(private readonly getScene: () => FoundryScene | null) {}

    async emitLight(x: number, y: number): Promise<string | null> {
        const scene = this.getScene();
        if (!scene) {
            return null;
        }
        const data: LightCreateData[] = [{ x, y, config: { dim: DEFAULT_DIM, bright: DEFAULT_BRIGHT } }];
        return firstId(await scene.createEmbeddedDocuments('AmbientLight', data));
    }

    async deleteLights(ids: readonly string[]): Promise<void> {
        const scene = this.getScene();
        if (!scene || ids.length === 0) {
            return;
        }
        await scene.deleteEmbeddedDocuments('AmbientLight', [...ids]);
    }
}
