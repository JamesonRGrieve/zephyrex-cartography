// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { BIOMES } from './region';
import { BIOME_TEXTURE, BIOME_TINT, DEFAULT_PACK, isTexturePack, PATH_TEXTURE, TEXTURE_PACKS, textureUrl } from './texture';

describe('BIOME_TEXTURE / BIOME_TINT', () => {
    it('has a texture entry and a tint for every biome', () => {
        for (const biome of BIOMES) {
            expect(biome in BIOME_TEXTURE).toBe(true);
            expect(BIOME_TINT[biome]).toBeTypeOf('number');
        }
    });

    it('leaves water and ocean untextured, and textures the land biomes', () => {
        expect(BIOME_TEXTURE.water).toBeNull();
        expect(BIOME_TEXTURE.ocean).toBeNull();
        expect(BIOME_TEXTURE.grassland).toBe('grassland.jpg');
        expect(BIOME_TEXTURE.lava).toBe('lava.jpg');
    });

    it('recolours only the neutral tiles (lava, ice); leaves natural tiles white', () => {
        expect(BIOME_TINT.lava).not.toBe(0xffffff);
        expect(BIOME_TINT.ice).not.toBe(0xffffff);
        expect(BIOME_TINT.grassland).toBe(0xffffff);
    });
});

describe('PATH_TEXTURE', () => {
    it('textures roads and leaves rivers translucent', () => {
        expect(PATH_TEXTURE.road).toBe('road.jpg');
        expect(PATH_TEXTURE.river).toBeNull();
    });
});

describe('textureUrl', () => {
    it('resolves a filename against the module-served path for a pack', () => {
        expect(textureUrl('polyhaven', 'grassland.jpg')).toBe('modules/dh-cartography-draw/assets/textures/polyhaven/grassland.jpg');
        expect(textureUrl('ambientcg', 'road.jpg')).toBe('modules/dh-cartography-draw/assets/textures/ambientcg/road.jpg');
    });
});

describe('texture packs', () => {
    it('offers multiple packs with a valid default', () => {
        expect(TEXTURE_PACKS.length).toBeGreaterThanOrEqual(2);
        expect(TEXTURE_PACKS).toContain(DEFAULT_PACK);
    });

    it('validates a setting value against the known packs', () => {
        expect(isTexturePack('polyhaven')).toBe(true);
        expect(isTexturePack('ambientcg')).toBe(true);
        expect(isTexturePack('nonsense')).toBe(false);
        expect(isTexturePack(42)).toBe(false);
    });
});
