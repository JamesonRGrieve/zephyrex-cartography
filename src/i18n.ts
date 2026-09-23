// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Every localisation key the module uses, in one place. `i18n.test.ts` asserts
 * this set and `static/lang/en.json` match exactly (no missing, no unused keys),
 * so a typo or a stale entry fails the gate instead of showing a raw key in
 * Foundry.
 */
import type { BiomeKind } from './tools/region';

/** Root namespace of every key (the top-level object in `static/lang/en.json`). */
export const I18N_ROOT = 'ZEPHYREX-CARTOGRAPHY';

function key(path: string): string {
    return `${I18N_ROOT}.${path}`;
}

export const I18N = {
    controlsGroup: key('Controls.Group'),
    tools: {
        road: key('Tools.Road'),
        river: key('Tools.River'),
        room: key('Tools.Room'),
        door: key('Tools.Door'),
        edit: key('Tools.Edit'),
        erase: key('Tools.Erase'),
        undo: key('Tools.Undo'),
        redo: key('Tools.Redo'),
    },
    settings: {
        texturePackName: key('Settings.TexturePack.Name'),
        texturePackHint: key('Settings.TexturePack.Hint'),
    },
} as const;

/** Scene-control title key per biome tool. */
export const BIOME_TITLE_KEYS: Record<BiomeKind, string> = {
    water: key('Biomes.Water'),
    grassland: key('Biomes.Grassland'),
    forest: key('Biomes.Forest'),
    sand: key('Biomes.Sand'),
    rock: key('Biomes.Rock'),
    snow: key('Biomes.Snow'),
    dirt: key('Biomes.Dirt'),
    lava: key('Biomes.Lava'),
    marsh: key('Biomes.Marsh'),
    ice: key('Biomes.Ice'),
    ash: key('Biomes.Ash'),
    tundra: key('Biomes.Tundra'),
    ocean: key('Biomes.Ocean'),
};
