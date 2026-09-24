// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * {@link SplatStore} over the live scene and the world's data folder: the
 * layers live in the scene's `splats` flag, and each mask is an exact RGBA
 * PNG (`tools/png.ts`) under `worlds/<world>/zephyrex-cartography/`, uploaded
 * through Foundry's own file picker. Only the GM saves; everyone reads.
 */
import type { SplatStore } from '../canvas/controller';
import { MODULE_ID } from '../module-id';
import { decodePng, encodePng } from '../tools/png';
import { parseSplatLayers, type SplatLayer } from '../tools/splat';
import type { FoundryScene } from './boundary';

const SPLAT_FLAG = 'splats';

/** The world's folder for the module's files. */
function worldFolder(): string {
    return `worlds/${game.world?.id ?? 'world'}/${MODULE_ID}`;
}

/** Make the module's world folder once per session; it already existing is fine. */
let folderReady: Promise<void> | null = null;
async function ensureFolder(): Promise<void> {
    folderReady ??= (async (): Promise<void> => {
        try {
            await foundry.applications.apps.FilePicker.implementation.createDirectory('data', worldFolder());
        } catch {
            // The folder is there already: Foundry refuses to make it twice.
        }
    })();
    await folderReady;
}

export function createSplatStore(getScene: () => FoundryScene | null): SplatStore {
    return {
        load: () => {
            const scene = getScene();
            return scene ? parseSplatLayers(scene.getFlag(MODULE_ID, SPLAT_FLAG)) : [];
        },
        save: async (layers) => {
            await getScene()?.setFlag(MODULE_ID, SPLAT_FLAG, layers);
        },
        readMask: async (layer) => {
            try {
                const response = await fetch(layer.path, { cache: 'no-store' });
                const image = response.ok ? await decodePng(new Uint8Array(await response.arrayBuffer())) : null;
                return image?.width === layer.width && image.height === layer.height ? image.pixels : null;
            } catch {
                return null;
            }
        },
        writeMask: async (layer: SplatLayer, mask) => {
            await ensureFolder();
            const png = await encodePng({ width: layer.width, height: layer.height, pixels: mask });
            const fileName = layer.path.slice(layer.path.lastIndexOf('/') + 1);
            const file = new File([png], fileName, { type: 'image/png' });
            await foundry.applications.apps.FilePicker.implementation.upload('data', worldFolder(), file, {}, { notify: false });
        },
        pathFor: (level) => `${worldFolder()}/splat-${getScene()?.id ?? 'scene'}-${level ?? 'all'}.png`,
    };
}
