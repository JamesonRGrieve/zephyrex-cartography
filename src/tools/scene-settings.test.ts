// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { FOG_MODE_IDS, FOG_MODES, hasSceneSettings } from './scene-settings';

describe('scene settings', () => {
    it('changes something only when a setting is given', () => {
        expect(hasSceneSettings({})).toBe(false);
        expect(hasSceneSettings({ darkness: undefined })).toBe(false);
        expect(hasSceneSettings({ darkness: 0 })).toBe(true);
        expect(hasSceneSettings({ weather: '' })).toBe(true);
    });

    it('names each fog exploration mode by Foundry’s id', () => {
        expect(FOG_MODES.map((mode) => FOG_MODE_IDS[mode])).toEqual([0, 1, 2]);
    });
});
