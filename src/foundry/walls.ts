// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Emits native Foundry walls — along a path centerline (opt-in per path) and
 * along room perimeters (returning the created document ids so the controller
 * can delete them when the room is removed). Foundry owns the walls, doors, and
 * vision; this is only the create/delete boundary.
 */
import type { WallEmitter } from '../canvas/controller';
import { RIBBON_SAMPLES } from '../canvas/renderer';
import { catmullRom } from '../geometry/spline';
import type { WallSpec } from '../geometry/wall';
import { isRecord, type CartographyPath } from '../tools/path';
import type { FoundryScene, WallCreateData } from './boundary';

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

export class FoundryWallEmitter implements WallEmitter {
    constructor(private readonly getScene: () => FoundryScene | null) {}

    async emit(path: CartographyPath): Promise<void> {
        const scene = this.getScene();
        if (!scene) {
            return;
        }
        const spine = catmullRom(path.points, RIBBON_SAMPLES);
        const data: WallCreateData[] = [];
        for (let i = 1; i < spine.length; i++) {
            const a = spine[i - 1];
            const b = spine[i];
            if (a && b) {
                data.push({ c: [a.x, a.y, b.x, b.y] });
            }
        }
        if (data.length > 0) {
            await scene.createEmbeddedDocuments('Wall', data);
        }
    }

    async emitSegments(walls: readonly WallSpec[]): Promise<string[]> {
        const scene = this.getScene();
        if (!scene) {
            return [];
        }
        const data: WallCreateData[] = walls.map((w) => (w.door ? { c: [w.a.x, w.a.y, w.b.x, w.b.y], door: 1 } : { c: [w.a.x, w.a.y, w.b.x, w.b.y] }));
        if (data.length === 0) {
            return [];
        }
        return extractIds(await scene.createEmbeddedDocuments('Wall', data));
    }

    async deleteWalls(ids: readonly string[]): Promise<void> {
        const scene = this.getScene();
        if (!scene || ids.length === 0) {
            return;
        }
        await scene.deleteEmbeddedDocuments('Wall', [...ids]);
    }
}
