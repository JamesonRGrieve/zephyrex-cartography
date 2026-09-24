// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { BLOCKS_ALL } from './documents';
import { DEFAULT_WALL_PRESET, isWallPreset, presetWall, WALL_PRESETS } from './wall-presets';

describe('wall presets', () => {
    it('mirror Foundry’s Walls palette', () => {
        expect(WALL_PRESETS).toEqual(['solid', 'terrain', 'invisible', 'ethereal', 'window']);
        expect(presetWall('solid')).toEqual({ blocks: BLOCKS_ALL });
        expect(presetWall('terrain').blocks).toEqual({ sight: 'limited', light: 'limited', sound: 'limited', movement: true });
        expect(presetWall('invisible').blocks).toEqual({ sight: 'none', light: 'none', sound: 'none', movement: true });
        expect(presetWall('ethereal').blocks).toEqual({ sight: 'normal', light: 'normal', sound: 'none', movement: false });
    });

    it('let light and sight through a window within two squares, fading', () => {
        expect(presetWall('window')).toEqual({
            blocks: { sight: 'proximity', light: 'proximity', sound: 'normal', movement: true },
            threshold: { light: 2, sight: 2, attenuation: true },
        });
    });

    it('default to solid, and recognise only their own names', () => {
        expect(DEFAULT_WALL_PRESET).toBe('solid');
        expect(['window', 'glass', 3, null].map(isWallPreset)).toEqual([true, false, false, false]);
    });
});
