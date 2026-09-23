// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * {@link WorldScenes} over the world's scenes, for submaps: names and frames
 * of scenes to link, new empty interiors gridded like the current scene, and
 * the exit regions that live in another scene.
 */
import type { WorldScenes } from '../canvas/controller';
import type { RegionDoc } from '../tools/documents';
import { activeScene, worldScene } from './scene-bridge';
import { regionCreateData, type TranslateOptions } from './translate';

/** Size of a new interior scene, in grid squares per side; the GM resizes it to suit. */
const INTERIOR_SQUARES = 20;

/** Grid size (px) and distance for an interior when there is no current scene to copy. */
const FALLBACK_GRID = { size: 100, distance: 1 } as const;

export interface WorldScenesOptions extends TranslateOptions {
    readonly regionName: (region: RegionDoc) => string;
}

export function createWorldScenes(options: WorldScenesOptions): WorldScenes {
    return {
        current: () => {
            const scene = activeScene();
            return scene?.id != null && scene.id !== '' ? { id: scene.id, name: scene.name } : null;
        },
        name: (sceneId) => worldScene(sceneId)?.name ?? null,
        frame: (sceneId) => {
            const d = worldScene(sceneId)?.dimensions;
            return d ? { x: d.sceneX, y: d.sceneY, width: d.sceneWidth, height: d.sceneHeight, gridSize: d.size } : null;
        },
        createScene: async (sceneName) => {
            const grid = activeScene()?.grid ?? FALLBACK_GRID;
            const created = await Scene.create({
                name: sceneName,
                width: grid.size * INTERIOR_SQUARES,
                height: grid.size * INTERIOR_SQUARES,
                grid: { size: grid.size, distance: grid.distance },
            });
            return created?.id ?? null;
        },
        createRegion: async (sceneId, region) => {
            const scene = worldScene(sceneId);
            if (scene?.id == null || scene.id === '' || region.id === null) {
                return false;
            }
            const [data] = regionCreateData([region], [region.id], scene.id, options.regionName, options);
            if (!data) {
                return false;
            }
            // A region teleported into must sit on one Level; on a multi-level v14 scene, use its default one.
            const initial = scene.initialLevel?.id ?? null;
            const onLevel = options.nativeLevels && (scene.levels?.size ?? 0) > 1 && initial !== null ? { ...data, levels: [initial] } : data;
            await scene.createEmbeddedDocuments('Region', [onLevel], { keepId: true });
            return true;
        },
        deleteRegion: async (sceneId, regionId) => {
            const scene = worldScene(sceneId);
            if (scene?.regions.has(regionId) === true) {
                await scene.deleteEmbeddedDocuments('Region', [regionId]);
            }
        },
    };
}
