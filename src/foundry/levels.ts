// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The scene's levels are its native Level documents, so walls, tiles, lights
 * and regions are assigned to real floors and Foundry handles per-level
 * vision.
 */
import type { LevelStore } from '../canvas/controller';
import { DEFAULT_LEVEL_HEIGHT, type Level, sortLevels } from '../tools/levels';
import type { FoundryScene, NativeLevel } from './boundary';

// eslint-disable-next-line no-restricted-syntax -- boundary: parses Foundry's createEmbeddedDocuments result to read the created Level's id
function firstId(created: unknown): string | null {
    const [doc] = Array.isArray(created) ? created : [];
    return typeof doc === 'object' && doc !== null && 'id' in doc && typeof doc.id === 'string' ? doc.id : null;
}

/** A native Level as a band; open-ended bounds are closed at a default height so every band has a floor and a ceiling. */
function fromNative(level: NativeLevel): Level | null {
    if (level.id === null) {
        return null;
    }
    const bottom = level.elevation.bottom ?? 0;
    return { id: level.id, name: level.name, bottom, top: level.elevation.top ?? bottom + DEFAULT_LEVEL_HEIGHT };
}

export function createLevelStore(getScene: () => FoundryScene | null): LevelStore {
    return {
        load: () => sortLevels((getScene()?.levels.contents ?? []).map(fromNative).filter((l): l is Level => l !== null)),
        create: async (level) => {
            const scene = getScene();
            return scene
                ? firstId(await scene.createEmbeddedDocuments('Level', [{ name: level.name, elevation: { bottom: level.bottom, top: level.top } }]))
                : null;
        },
        update: async (id, patch) => {
            const scene = getScene();
            const current = scene?.levels.contents.map(fromNative).find((l) => l?.id === id);
            if (!scene || !current) {
                return;
            }
            const band = { bottom: patch.bottom ?? current.bottom, top: patch.top ?? current.top };
            await scene.updateEmbeddedDocuments('Level', [{ _id: id, ...(patch.name === undefined ? {} : { name: patch.name }), elevation: band }]);
        },
        remove: async (id) => {
            await getScene()?.deleteEmbeddedDocuments('Level', [id]);
        },
    };
}
