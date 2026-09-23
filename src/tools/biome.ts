// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The biome vocabulary: the terrain kinds, their base fill styles, and the
 * guard that narrows a persisted value to one. A leaf module, so documents,
 * features and rendering can all name a biome without depending on each other.
 */

export type BiomeKind = 'water' | 'grassland' | 'forest' | 'sand' | 'rock' | 'snow' | 'dirt' | 'lava' | 'marsh' | 'ice' | 'ash' | 'tundra' | 'ocean';

export const BIOMES: readonly BiomeKind[] = ['water', 'grassland', 'forest', 'sand', 'rock', 'snow', 'dirt', 'lava', 'marsh', 'ice', 'ash', 'tundra', 'ocean'];

export interface BiomeStyle {
    readonly fill: number;
    readonly alpha: number;
}

/** Base biome fill colours; alpha leaves the base map partly visible for blending. */
export const BIOME_STYLES: Record<BiomeKind, BiomeStyle> = {
    water: { fill: 0x2f5d7c, alpha: 0.55 },
    grassland: { fill: 0x5a7b3c, alpha: 0.5 },
    forest: { fill: 0x2f4a24, alpha: 0.55 },
    sand: { fill: 0xc2a866, alpha: 0.5 },
    rock: { fill: 0x6b6b6b, alpha: 0.5 },
    snow: { fill: 0xdfe8ee, alpha: 0.55 },
    dirt: { fill: 0x6b4f34, alpha: 0.5 },
    lava: { fill: 0xc1440e, alpha: 0.62 },
    marsh: { fill: 0x4a5d3a, alpha: 0.5 },
    ice: { fill: 0xbfe3ec, alpha: 0.55 },
    ash: { fill: 0x4a4a4a, alpha: 0.55 },
    tundra: { fill: 0x8a9a8f, alpha: 0.5 },
    ocean: { fill: 0x1e4260, alpha: 0.62 },
};

// eslint-disable-next-line no-restricted-syntax -- boundary: a persisted biome value is untyped scene-flag JSON; this guard narrows it to BiomeKind
export function isBiomeKind(v: unknown): v is BiomeKind {
    return typeof v === 'string' && (BIOMES as readonly string[]).includes(v);
}
