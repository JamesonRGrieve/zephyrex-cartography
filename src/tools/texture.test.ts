// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { BIOMES } from './biome';
import {
    BIOME_TEXTURE,
    BIOME_TINT,
    biomeSwatches,
    compressedTextures,
    isCompressedTexture,
    pickTextureSet,
    previewResolver,
    shownImage,
    textureResolver,
    textureSetChoices,
} from './texture';

const sets = [
    { key: 'a:photo', name: 'Photo (CC0)', textures: { grassland: 'modules/a/grass.jpg', road: 'modules/a/road.jpg' } },
    { key: 'b:paint', name: 'Painted', textures: { grassland: 'modules/b/grass.png' } },
];

describe('compressed textures', () => {
    const compressed = {
        key: 'c:gpu',
        name: 'GPU',
        textures: { grassland: 'modules/c/grass.ktx2', forest: 'modules/c/forest.basis', road: 'modules/c/road.webp' },
        previews: { grassland: 'modules/c/grass-preview.webp' },
    };

    it('knows KTX2 and Basis files, whatever their case and query', () => {
        expect(['a.ktx2', 'B.KTX2', 'c.basis?v=2', 'd.basis#x', 'e.webp', 'ktx2.png'].map(isCompressedTexture)).toEqual([true, true, true, true, false, false]);
    });

    it('shows a panel a preview, else a browser image, and nothing for compressed art without one', () => {
        expect(shownImage('a.ktx2', 'a.webp')).toBe('a.webp');
        expect(shownImage('a.png', undefined)).toBe('a.png');
        expect(shownImage('a.ktx2', undefined)).toBeNull();
        const shown = previewResolver(compressed, PATTERNS);
        expect([shown('grassland'), shown('forest'), shown('road'), shown('snow'), shown('procedural.ripple')]).toEqual([
            'modules/c/grass-preview.webp',
            null,
            'modules/c/road.webp',
            null,
            'pattern:ripple',
        ]);
    });

    it('lists the compressed images the canvas must load first', () => {
        expect(compressedTextures(compressed)).toEqual(['modules/c/grass.ktx2', 'modules/c/forest.basis']);
        expect(compressedTextures(null)).toEqual([]);
    });
});

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

/** Each pattern's image, as the boundary would give it. */
const PATTERNS = (pattern: string): string => `pattern:${pattern}`;

describe('texture sets', () => {
    it('picks the chosen set, else the first, else none', () => {
        expect(pickTextureSet(sets, 'b:paint')?.key).toBe('b:paint');
        expect(pickTextureSet(sets, 'gone:set')?.key).toBe('a:photo');
        expect(pickTextureSet([], 'a:photo')).toBeNull();
    });

    it('resolves roles to URLs, null for a role the set lacks or with no set, and patterns whatever the set', () => {
        const resolve = textureResolver(pickTextureSet(sets, 'b:paint'), PATTERNS);
        expect(resolve('grassland')).toBe('modules/b/grass.png');
        expect(resolve('road')).toBeNull();
        expect(textureResolver(null, PATTERNS)('grassland')).toBeNull();
        expect(textureResolver(null, PATTERNS)('procedural.ripple')).toBe('pattern:ripple');
    });

    it('offers each set by name as a setting choice', () => {
        expect(textureSetChoices(sets)).toEqual({ 'a:photo': 'Photo (CC0)', 'b:paint': 'Painted' });
    });

    it('gives every biome a swatch: the set’s texture where it has one, and always a flat colour', () => {
        const swatches = biomeSwatches(textureResolver(pickTextureSet(sets, 'a:photo'), PATTERNS));
        expect(swatches.map((s) => s.biome)).toEqual(BIOMES);
        expect(swatches.find((s) => s.biome === 'grassland')).toEqual({ biome: 'grassland', image: 'modules/a/grass.jpg', colour: '#5a7b3c' });
        expect(swatches.find((s) => s.biome === 'water')).toEqual({ biome: 'water', image: null, colour: '#2f5d7c' });
        expect(swatches.find((s) => s.biome === 'forest')?.image).toBeNull();
    });
});
