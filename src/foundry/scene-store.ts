// SPDX-License-Identifier: AGPL-3.0-or-later
/** Persists features on the active scene via its flags. */
import type { SceneStore } from '../canvas/controller';
import { FLAG_KEY, FLAG_SCOPE, parsePaths, type CartographyPath } from '../tools/path';
import type { FoundryScene } from './boundary';

export class FoundrySceneStore implements SceneStore {
    constructor(private readonly getScene: () => FoundryScene | null) {}

    load(): CartographyPath[] {
        const scene = this.getScene();
        return scene ? parsePaths(scene.getFlag(FLAG_SCOPE, FLAG_KEY)) : [];
    }

    async save(paths: readonly CartographyPath[]): Promise<void> {
        const scene = this.getScene();
        if (scene) {
            await scene.setFlag(FLAG_SCOPE, FLAG_KEY, paths);
        }
    }
}
