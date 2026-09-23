// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Bundled terrain-texture mapping: which CC0 tile (from `assets/textures/`, see
 * that dir's CREDITS.md) fills each biome and path kind, and the multiply tint
 * applied to it. Water/ocean/river are `null` — water reads best as a
 * translucent tint, not a tiled photo, so those fall back to the flat fill.
 * Pure data + a tiny URL helper; unit-tested. The concrete PIXI tiling lives at
 * the Foundry boundary.
 */
import { MODULE_ID } from '../module-id';
import type { PathKind } from './path';
import type { BiomeKind } from './region';

/** Foundry serves a module's files under this path; textures live beside the code. */
const TEXTURE_BASE = `modules/${MODULE_ID}/assets/textures`;

/** Bundled texture packs the GM can choose between (see assets/textures/PACKS.json). */
export type TexturePack = 'polyhaven' | 'ambientcg';

export const TEXTURE_PACKS: readonly TexturePack[] = ['polyhaven', 'ambientcg'];

export const DEFAULT_PACK: TexturePack = 'polyhaven';

/** Human-readable pack labels for the settings dropdown. */
export const TEXTURE_PACK_LABELS: Record<TexturePack, string> = {
    polyhaven: 'Poly Haven (CC0)',
    ambientcg: 'ambientCG (CC0)',
};

// eslint-disable-next-line no-restricted-syntax -- boundary: validates an untyped Foundry setting value, narrowing it to TexturePack
export function isTexturePack(v: unknown): v is TexturePack {
    return typeof v === 'string' && (TEXTURE_PACKS as readonly string[]).includes(v);
}

/** Bundled tile filename per biome, or null for an untextured (translucent) biome. */
export const BIOME_TEXTURE: Record<BiomeKind, string | null> = {
    water: null,
    ocean: null,
    grassland: 'grassland.jpg',
    forest: 'forest.jpg',
    sand: 'sand.jpg',
    rock: 'rock.jpg',
    snow: 'snow.jpg',
    dirt: 'dirt.jpg',
    lava: 'lava.jpg',
    marsh: 'marsh.jpg',
    ice: 'ice.jpg',
    ash: 'ash.jpg',
    tundra: 'tundra.jpg',
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

/** Bundled tile filename per path kind, or null (rivers render as translucent water). */
export const PATH_TEXTURE: Record<PathKind, string | null> = {
    road: 'road.jpg',
    river: null,
};

/** Absolute (Foundry-served) URL for a bundled texture filename within a pack. */
export function textureUrl(pack: TexturePack, file: string): string {
    return `${TEXTURE_BASE}/${pack}/${file}`;
}
