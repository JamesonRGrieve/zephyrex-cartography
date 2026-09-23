// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Terrain texturing. Each biome and path kind fills with a texture *role*.
 * Asset packs ship texture sets that map roles to images, and the GM picks one
 * set. Water, ocean and river have no role: water reads best as a translucent
 * tint, not a tiled photo. A role the active set lacks falls back to the flat
 * biome colour. Pure data plus set resolution; unit-tested. The concrete PIXI
 * tiling lives at the Foundry boundary.
 */
import type { BiomeKind } from './biome';
import type { PathKind } from './path';

/** A pack texture set as the renderer needs it: role → module-served image URL. */
export interface TextureSetRef {
    readonly key: string;
    readonly name: string;
    readonly textures: Readonly<Record<string, string>>;
}

/** Resolves a texture role to an image URL, or null to use the flat colour. */
export type TextureResolver = (role: string) => string | null;

/** Texture role per biome, or null for an untextured (translucent) biome. */
export const BIOME_TEXTURE: Record<BiomeKind, string | null> = {
    water: null,
    ocean: null,
    grassland: 'grassland',
    forest: 'forest',
    sand: 'sand',
    rock: 'rock',
    snow: 'snow',
    dirt: 'dirt',
    lava: 'lava',
    marsh: 'marsh',
    ice: 'ice',
    ash: 'ash',
    tundra: 'tundra',
};

/**
 * Multiply tint for each biome's texture. White (0xffffff) leaves a
 * naturally-coloured photo untouched; the two neutral tiles are recoloured
 * (dark volcanic rock → molten, the reused snow tile → glacial blue).
 */
export const BIOME_TINT: Record<BiomeKind, number> = {
    water: 0xffffff,
    ocean: 0xffffff,
    grassland: 0xffffff,
    forest: 0xffffff,
    sand: 0xffffff,
    rock: 0xffffff,
    snow: 0xffffff,
    dirt: 0xffffff,
    lava: 0xff5a1e,
    marsh: 0xffffff,
    ice: 0xbfe3ec,
    ash: 0xffffff,
    tundra: 0xffffff,
};

/** Texture role per path kind, or null (rivers render as translucent water). */
export const PATH_TEXTURE: Record<PathKind, string | null> = {
    road: 'road',
    river: null,
};

/** The chosen texture set, or the first available when the choice is unset or no longer installed. */
export function pickTextureSet(sets: readonly TextureSetRef[], chosen: string): TextureSetRef | null {
    return sets.find((set) => set.key === chosen) ?? sets[0] ?? null;
}

/** A resolver over one texture set; with no set, everything renders as flat colour. */
export function textureResolver(set: TextureSetRef | null): TextureResolver {
    return (role) => set?.textures[role] ?? null;
}

/** Setting choices: texture set key → display name. */
export function textureSetChoices(sets: readonly TextureSetRef[]): Record<string, string> {
    return Object.fromEntries(sets.map((set) => [set.key, set.name]));
}
