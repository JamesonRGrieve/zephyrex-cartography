// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { BIOMES } from './biome';
import { BIOME_TEXTURE, BIOME_TINT, PATH_TEXTURE, pickTextureSet, textureResolver, textureSetChoices } from './texture';

const sets = [
    { key: 'a:photo', name: 'Photo (CC0)', textures: { grassland: 'modules/a/grass.jpg', road: 'modules/a/road.jpg' } },
    { key: 'b:paint', name: 'Painted', textures: { grassland: 'modules/b/grass.png' } },
];

describe('BIOME_TEXTURE / BIOME_TINT', () => {
    it('has a texture role and a tint for every biome', () => {
        for (const biome of BIOMES) {
            expect(biome in BIOME_TEXTURE).toBe(true);
            expect(BIOME_TINT[biome]).toBeTypeOf('number');
        }
    });

    it('leaves water and ocean untextured, and names land biomes by role', () => {
        expect(BIOME_TEXTURE.water).toBeNull();
        expect(BIOME_TEXTURE.ocean).toBeNull();
        expect(BIOME_TEXTURE.grassland).toBe('grassland');
        expect(BIOME_TEXTURE.lava).toBe('lava');
    });

    it('recolours only the neutral tiles (lava, ice); leaves natural tiles white', () => {
        expect(BIOME_TINT.lava).not.toBe(0xffffff);
        expect(BIOME_TINT.ice).not.toBe(0xffffff);
        expect(BIOME_TINT.grassland).toBe(0xffffff);
    });
});

describe('PATH_TEXTURE', () => {
    it('textures roads and leaves rivers translucent', () => {
        expect(PATH_TEXTURE.road).toBe('road');
        expect(PATH_TEXTURE.river).toBeNull();
    });
});

describe('texture sets', () => {
    it('picks the chosen set, else the first, else none', () => {
        expect(pickTextureSet(sets, 'b:paint')?.key).toBe('b:paint');
        expect(pickTextureSet(sets, 'gone:set')?.key).toBe('a:photo');
        expect(pickTextureSet([], 'a:photo')).toBeNull();
    });

    it('resolves roles to URLs, null for a role the set lacks or with no set', () => {
        const resolve = textureResolver(pickTextureSet(sets, 'b:paint'));
        expect(resolve('grassland')).toBe('modules/b/grass.png');
        expect(resolve('road')).toBeNull();
        expect(textureResolver(null)('grassland')).toBeNull();
    });

    it('offers each set by name as a setting choice', () => {
        expect(textureSetChoices(sets)).toEqual({ 'a:photo': 'Photo (CC0)', 'b:paint': 'Painted' });
    });
});
