// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Wall kinds, as Foundry's own Walls palette defines them (v14, 14.359
 * `WallsLayer.prepareSceneControls`), so a room's or a path's walls behave
 * like the native walls a GM already knows. Pure and unit-tested.
 */
import { BLOCKS_ALL, type SenseBlock, type WallThreshold } from './documents';

export const WALL_PRESETS = ['solid', 'terrain', 'invisible', 'ethereal', 'window'] as const;

export type WallPreset = (typeof WALL_PRESETS)[number];

/** What a new room's or path's walls are: solid. */
export const DEFAULT_WALL_PRESET: WallPreset = 'solid';

/** A wall kind's senses, and any thresholds it measures them by. */
export interface PresetWall {
    readonly blocks: SenseBlock;
    readonly threshold?: WallThreshold;
}

/** Foundry's window lets light and sight through within this many grid squares, fading with distance. */
const WINDOW_REACH_SQUARES = 2;

const PRESETS: Readonly<Record<WallPreset, PresetWall>> = {
    solid: { blocks: BLOCKS_ALL },
    // Terrain: a second terrain wall in the line of sight blocks it.
    terrain: { blocks: { sight: 'limited', light: 'limited', sound: 'limited', movement: true } },
    invisible: { blocks: { sight: 'none', light: 'none', sound: 'none', movement: true } },
    ethereal: { blocks: { sight: 'normal', light: 'normal', sound: 'none', movement: false } },
    window: {
        blocks: { sight: 'proximity', light: 'proximity', sound: 'normal', movement: true },
        threshold: { light: WINDOW_REACH_SQUARES, sight: WINDOW_REACH_SQUARES, attenuation: true },
    },
};

export function presetWall(preset: WallPreset): PresetWall {
    return PRESETS[preset];
}

// eslint-disable-next-line no-restricted-syntax -- boundary: narrows a persisted room's wall kind (scene-flag JSON) or a select's value
export function isWallPreset(value: unknown): value is WallPreset {
    return WALL_PRESETS.some((preset) => preset === value);
}
