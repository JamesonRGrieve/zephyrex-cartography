// SPDX-License-Identifier: AGPL-3.0-or-later
/** Persists features (paths + regions) on the active scene via its flags. */
import type { SceneStore } from '../canvas/controller';
import { parseFeatures, type Feature } from '../tools/feature';
import { FLAG_KEY, FLAG_SCOPE } from '../tools/path';
import type { FoundryScene } from './boundary';

export class FoundrySceneStore implements SceneStore {
    constructor(private readonly getScene: () => FoundryScene | null) {}

    load(): Feature[] {
        const scene = this.getScene();
        return scene ? parseFeatures(scene.getFlag(FLAG_SCOPE, FLAG_KEY)) : [];
    }

    async save(features: readonly Feature[]): Promise<void> {
        const scene = this.getScene();
        if (scene) {
            await scene.setFlag(FLAG_SCOPE, FLAG_KEY, features);
        }
    }
}
