// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The scene's levels. On Foundry v14 they are the scene's native Level
 * documents, so walls, tiles, lights and regions are assigned to real floors
 * and Foundry handles per-level vision. On v13, which has no Level documents,
 * the bands live in a scene flag; generated documents still take their band's
 * elevation, but walls apply on every level there.
 */
import type { LevelStore } from '../canvas/controller';
import { MODULE_ID } from '../module-id';
import { DEFAULT_LEVEL_HEIGHT, type Level, parseLevels, sortLevels } from '../tools/levels';
import type { FoundryScene, NativeLevel } from './boundary';

/** Scene-flag key (v13) holding the level list. */
const LEVELS_FLAG_KEY = 'levels';

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

function nativeStore(getScene: () => FoundryScene | null): LevelStore {
    return {
        load: () => sortLevels((getScene()?.levels?.contents ?? []).map(fromNative).filter((l): l is Level => l !== null)),
        create: async (level) => {
            const scene = getScene();
            return scene
                ? firstId(await scene.createEmbeddedDocuments('Level', [{ name: level.name, elevation: { bottom: level.bottom, top: level.top } }]))
                : null;
        },
        update: async (id, patch) => {
            const scene = getScene();
            const current = scene?.levels?.contents.map(fromNative).find((l) => l?.id === id);
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

function flagStore(getScene: () => FoundryScene | null, makeId: () => string): LevelStore {
    const read = (): Level[] => parseLevels(getScene()?.getFlag(MODULE_ID, LEVELS_FLAG_KEY));
    const write = async (levels: readonly Level[]): Promise<void> => {
        await getScene()?.setFlag(MODULE_ID, LEVELS_FLAG_KEY, sortLevels(levels));
    };
    return {
        load: read,
        create: async (level) => {
            if (!getScene()) {
                return null;
            }
            const id = makeId();
            await write([...read(), { id, ...level }]);
            return id;
        },
        update: async (id, patch) => {
            await write(read().map((level) => (level.id === id ? { ...level, ...patch } : level)));
        },
        remove: async (id) => {
            await write(read().filter((level) => level.id !== id));
        },
    };
}

/** Native Levels where the running Foundry has them (v14+), otherwise the flag store. */
export function createLevelStore(getScene: () => FoundryScene | null, nativeLevels: boolean, makeId: () => string): LevelStore {
    return nativeLevels ? nativeStore(getScene) : flagStore(getScene, makeId);
}
