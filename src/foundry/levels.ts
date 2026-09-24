// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The scene's levels are its native Level documents, so walls, tiles, lights
 * and regions are assigned to real floors and Foundry handles per-level
 * vision.
 */
import type { LevelStore } from '../canvas/controller';
import { type Level, type LevelArt, levelHeightFor, NO_LEVEL_ART, sortLevels, TEXTURE_FITS } from '../tools/levels';
import type { FoundryScene, LevelUpdateData, NativeLevel } from './boundary';

// eslint-disable-next-line no-restricted-syntax -- boundary: parses Foundry's createEmbeddedDocuments result to read the created Level's id
function firstId(created: unknown): string | null {
    const [doc] = Array.isArray(created) ? created : [];
    return typeof doc === 'object' && doc !== null && 'id' in doc && typeof doc.id === 'string' ? doc.id : null;
}

/**
 * A native Level as a band. Open-ended bounds are closed so every band has a
 * floor and a ceiling: an open floor at 0, an open ceiling one default level
 * height up (4 grid squares).
 */
function fromNative(level: NativeLevel, height: number): Level | null {
    if (level.id === null) {
        return null;
    }
    // Foundry reports an open bound as null in source data and as ±Infinity once prepared.
    const bottom = finiteOr(level.elevation.bottom, 0);
    return { id: level.id, name: level.name, bottom, top: finiteOr(level.elevation.top, bottom + height), art: artOf(level) };
}

/** How Foundry draws `level`, as the engine holds it. */
function artOf(level: NativeLevel): LevelArt {
    const { background, foreground, fog, textures } = level;
    return {
        background: background.src,
        foreground: foreground.src,
        fog: fog.src,
        backgroundColor: background.color.css,
        tints: { background: background.tint.css, foreground: foreground.tint.css, fog: fog.tint?.css ?? NO_LEVEL_ART.tints.fog },
        alphaThresholds: { background: background.alphaThreshold, foreground: foreground.alphaThreshold },
        placement: { ...textures, fit: TEXTURE_FITS.find((fit) => fit === textures.fit) ?? NO_LEVEL_ART.placement.fit },
        visibleLevels: [...level.visibility.levels],
    };
}

/** `art` as a native Level update. */
function artUpdate(art: LevelArt): Omit<LevelUpdateData, '_id'> {
    return {
        background: { src: art.background, color: art.backgroundColor, tint: art.tints.background, alphaThreshold: art.alphaThresholds.background },
        foreground: { src: art.foreground, tint: art.tints.foreground, alphaThreshold: art.alphaThresholds.foreground },
        fog: { src: art.fog, tint: art.tints.fog },
        textures: art.placement,
        visibility: { levels: art.visibleLevels },
    };
}

function finiteOr(value: number | null, fallback: number): number {
    return value !== null && Number.isFinite(value) ? value : fallback;
}

/** The scene's Levels as bands. */
function bands(scene: FoundryScene): Level[] {
    const height = levelHeightFor(scene.grid.distance);
    return scene.levels.contents.map((level) => fromNative(level, height)).filter((l): l is Level => l !== null);
}

export function createLevelStore(getScene: () => FoundryScene | null): LevelStore {
    return {
        load: () => {
            const scene = getScene();
            return scene ? sortLevels(bands(scene)) : [];
        },
        create: async (level) => {
            const scene = getScene();
            return scene
                ? firstId(await scene.createEmbeddedDocuments('Level', [{ name: level.name, elevation: { bottom: level.bottom, top: level.top } }]))
                : null;
        },
        update: async (id, patch) => {
            const scene = getScene();
            const current = scene ? bands(scene).find((l) => l.id === id) : undefined;
            if (!scene || !current) {
                return;
            }
            const band = { bottom: patch.bottom ?? current.bottom, top: patch.top ?? current.top };
            const art = patch.art === undefined ? {} : artUpdate(patch.art);
            await scene.updateEmbeddedDocuments('Level', [{ _id: id, ...(patch.name === undefined ? {} : { name: patch.name }), elevation: band, ...art }]);
        },
        remove: async (id) => {
            await getScene()?.deleteEmbeddedDocuments('Level', [id]);
        },
    };
}
