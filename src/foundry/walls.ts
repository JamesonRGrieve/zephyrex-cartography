// SPDX-License-Identifier: AGPL-3.0-or-later
/** Emits Foundry walls along a path centerline (opt-in per path). */
import type { WallEmitter } from '../canvas/controller';
import { RIBBON_SAMPLES } from '../canvas/renderer';
import { catmullRom } from '../geometry/spline';
import type { CartographyPath } from '../tools/path';
import type { FoundryScene, WallCreateData } from './boundary';

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
}
