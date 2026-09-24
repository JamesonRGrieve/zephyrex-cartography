// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Feature rendering over a keyed {@link DrawSurface} seam. Paths become smoothed,
 * variable-width ribbon polygons; biome regions become smoothed, closed fills.
 * Style is derived from the feature, so the controller just hands over features;
 * the concrete PIXI surface lives at the Foundry boundary, keeping this pure.
 */
import { buildRibbon, RIBBON_SAMPLES, ribbonOutline } from '../geometry/ribbon';
import { perimeterSegments, segmentBand } from '../geometry/wall';
import { BIOME_STYLES, isBiomeKind, type BiomeKind } from '../tools/biome';
import { tintToward } from '../tools/colour';
import type { Feature } from '../tools/feature';
import type { CartographyPath, Liquid } from '../tools/path';
import { proceduralRole, type Pattern } from '../tools/procedural';
import { regionOutline } from '../tools/region';
import { BIOME_TEXTURE, BIOME_TINT, ROAD_TEXTURE, type TextureResolver } from '../tools/texture';

/** Opacity for a textured fill — higher than a flat tint so the tile reads, but still blends. */
const TEXTURE_ALPHA = 0.9;

/** Neutral (no-op) multiply tint for a naturally-coloured texture. */
const NO_TINT = 0xffffff;

interface RibbonStyle {
    readonly fill: number;
    readonly alpha: number;
}

const ROAD_STYLE: RibbonStyle = { fill: 0x6b5a44, alpha: 0.85 };

const PREVIEW_STYLE: RibbonStyle = { fill: 0xff9c00, alpha: 0.4 };

/** How opaque each liquid is: water lets its bed show through, lava hides it. */
const LIQUID_ALPHA: Record<Liquid, number> = { water: 0.7, lava: 0.92, poison: 0.8, acid: 0.8 };

/** Texture roles a liquid is drawn in, the first the active set has; with none, it ripples. */
const LIQUID_ROLES: Record<Liquid, readonly string[]> = {
    water: ['water', 'floor.shallow-water', 'floor.calm-sea'],
    lava: ['lava'],
    poison: ['poison', 'floor.toxic-sludge'],
    acid: ['acid', 'floor.toxic-sludge'],
};

/**
 * How far a liquid's shade tints a pack texture: a water or sludge texture
 * has its own colour and takes the shade gently, while the lava tile is dark
 * rock that the shade turns molten.
 */
const LIQUID_TINT_STRENGTH: Record<Liquid, number> = { water: 0.5, lava: 1, poison: 0.6, acid: 0.6 };

/** Texture roles of the untextured water biomes, the first the active set has; with none, they ripple. */
const OPEN_WATER_ROLES: Readonly<Partial<Record<BiomeKind, readonly string[]>>> = {
    water: LIQUID_ROLES.water,
    ocean: ['ocean', 'floor.calm-sea', 'floor.rough-sea'],
};

/** A fill's texture and its multiply tint. */
interface Texturing {
    readonly texture: string | null;
    readonly tint: number;
}

/**
 * The first of `roles` the active set has, tinted `packTint`; failing that,
 * procedural `pattern` tinted `colour`, so a fill is never a flat colour.
 */
function texturing(resolve: TextureResolver, roles: readonly string[], packTint: number, pattern: Pattern, colour: number): Texturing {
    for (const role of roles) {
        const texture = resolve(role);
        if (texture !== null) {
            return { texture, tint: packTint };
        }
    }
    return { texture: resolve(proceduralRole(pattern)), tint: colour };
}

/** A river's bed runs this much wider than the river, plus a fixed bank either side, so even a stream shows its banks. */
const BED_SCALE = 1.5;
const BED_BANK_PX = 16;

/** Flat colour of a pack floor material, or a bed, the active texture set does not have. */
const ROLE_FALLBACK = 0x6e6457;

/** Flat colour of a wall material the active texture set does not have. */
const WALL_FALLBACK = 0x3a3a3a;

/** Width (scene px) of a room's drawn wall band. */
const WALL_BAND_WIDTH = 8;

/** A keyed 2D fill surface: create-or-update / remove / clear filled polygons. */
export interface DrawSurface {
    fill: (id: string, polygon: readonly number[], color: number, alpha: number, feather: boolean) => void;
    /** Fill the polygon with a tiled texture (by image URL), multiply-tinted. */
    fillTextured: (id: string, polygon: readonly number[], textureUrl: string, tint: number, alpha: number, feather: boolean) => void;
    remove: (id: string) => void;
    clear: () => void;
}

export interface FeatureRenderer {
    set: (id: string, feature: Feature) => void;
    preview: (feature: Feature) => void;
    remove: (id: string) => void;
    clearPreview: () => void;
    clear: () => void;
}

interface Filled {
    readonly outline: number[];
    readonly fill: number;
    readonly alpha: number;
    /** Tiled texture URL, or null for a flat colour fill (water/river, or a role the texture set lacks). */
    readonly texture: string | null;
    /** Multiply tint for the texture (ignored when `texture` is null). */
    readonly tint: number;
    /** Soften the boundary — regions blend into the map (coastline/terrain edge); paths stay crisp. */
    readonly feather: boolean;
}

/** Fill descriptor for a biome area (region, brush stroke, or room floor) — textured, tinted. */
/**
 * How a biome is drawn: water and ocean translucent, in a water texture or
 * rippling; land in its texture, or grain in its colour. Shared by painted
 * areas and splat-map blending.
 */
export function biomeLook(biome: BiomeKind, resolve: TextureResolver): Texturing & { readonly alpha: number } {
    const style = BIOME_STYLES[biome];
    const role = BIOME_TEXTURE[biome];
    if (role === null) {
        return { ...texturing(resolve, OPEN_WATER_ROLES[biome] ?? [], NO_TINT, 'ripple', style.fill), alpha: style.alpha };
    }
    return { ...texturing(resolve, [role], BIOME_TINT[biome], 'grain', style.fill), alpha: TEXTURE_ALPHA };
}

function biomeFilled(biome: BiomeKind, outline: number[], feather: boolean, resolve: TextureResolver): Filled {
    return { outline, fill: BIOME_STYLES[biome].fill, feather, ...biomeLook(biome, resolve) };
}

/** Fill descriptor for a texture role: a biome as a biome, any other role (a pack material) by its texture, or grain. */
function roleFilled(role: string, outline: number[], feather: boolean, resolve: TextureResolver): Filled {
    if (isBiomeKind(role)) {
        return biomeFilled(role, outline, feather, resolve);
    }
    const { texture, tint } = texturing(resolve, [role], NO_TINT, 'grain', ROLE_FALLBACK);
    return { outline, fill: ROLE_FALLBACK, alpha: TEXTURE_ALPHA, texture, tint, feather };
}

/** A path's ribbon outline at `halfWidths`; rivers taper to a point at each end, roads keep a constant carriageway. */
function pathOutline(path: CartographyPath, halfWidths: readonly number[]): number[] {
    return ribbonOutline(buildRibbon(path.points, halfWidths, RIBBON_SAMPLES, path.kind === 'river'));
}

function pathFilled(path: CartographyPath, resolve: TextureResolver): Filled {
    const outline = pathOutline(path, path.halfWidths);
    if (path.river === null) {
        const road = texturing(resolve, [ROAD_TEXTURE], NO_TINT, 'grain', ROAD_STYLE.fill);
        return { outline, fill: ROAD_STYLE.fill, alpha: TEXTURE_ALPHA, ...road, feather: false };
    }
    const { liquid, shade } = path.river;
    const flow = texturing(resolve, LIQUID_ROLES[liquid], tintToward(shade, LIQUID_TINT_STRENGTH[liquid]), 'ripple', shade);
    return { outline, fill: shade, alpha: LIQUID_ALPHA[liquid], ...flow, feather: false };
}

/** Fills drawn beneath a feature's own: a river's bed, wider than the river and feathered into the map. */
function underlays(feature: Feature, resolve: TextureResolver): Filled[] {
    const bed = feature.type === 'path' ? feature.river?.bed ?? null : null;
    if (feature.type !== 'path' || bed === null) {
        return [];
    }
    const outline = pathOutline(
        feature,
        feature.halfWidths.map((w) => w * BED_SCALE + BED_BANK_PX),
    );
    return [roleFilled(bed, outline, true, resolve)];
}

/** Nothing to draw: the feature is realised entirely as native documents (a stamp is its Tile). */
const NOT_DRAWN: Filled = { outline: [], fill: 0, alpha: 0, texture: null, tint: NO_TINT, feather: false };

function outlineAndStyle(feature: Feature, resolve: TextureResolver): Filled {
    if (feature.type === 'stamp') {
        return NOT_DRAWN;
    }
    if (feature.type === 'region') {
        return biomeFilled(feature.biome, regionOutline(feature.points), true, resolve);
    }
    if (feature.type === 'stroke') {
        const halfWidths = feature.points.map(() => feature.radius);
        return biomeFilled(feature.biome, ribbonOutline(buildRibbon(feature.points, halfWidths, RIBBON_SAMPLES, false)), true, resolve);
    }
    if (feature.type === 'room') {
        // The exact polygon with a crisp edge: a room's walls are straight and cover its boundary.
        return roleFilled(
            feature.floor,
            feature.points.flatMap((p) => [p.x, p.y]),
            false,
            resolve,
        );
    }
    return pathFilled(feature, resolve);
}

const PREVIEW_ID = '__preview__';

/** The drawn wall bands of a room: one band per perimeter segment, in its wall material. */
function wallBands(feature: Feature, resolve: TextureResolver): Filled[] {
    if (feature.type !== 'room' || feature.wall === null) {
        return [];
    }
    const { texture, tint } = texturing(resolve, [feature.wall], NO_TINT, 'grain', WALL_FALLBACK);
    return perimeterSegments(feature.points).map((seg) => ({
        outline: segmentBand(seg, WALL_BAND_WIDTH),
        fill: WALL_FALLBACK,
        alpha: 1,
        texture,
        tint,
        feather: false,
    }));
}

export class GraphicsFeatureRenderer implements FeatureRenderer {
    /** Surface ids of the extra fills drawn for each feature (a river's bed, a room's wall bands), so they go with it. */
    private readonly extras = new Map<string, string[]>();

    constructor(private readonly surface: DrawSurface, private readonly resolve: TextureResolver) {}

    /** Draw a feature: what lies beneath it first (each draw goes on top), then the feature, then its wall bands. */
    set(id: string, feature: Feature): void {
        this.removeExtras(id);
        const below = underlays(feature, this.resolve).map((fill, i) => this.drawExtra(`${id}:bed:${i}`, fill));
        this.draw(id, outlineAndStyle(feature, this.resolve));
        const above = wallBands(feature, this.resolve).map((band, i) => this.drawExtra(`${id}:wall:${i}`, band));
        const drawn = [...below, ...above];
        if (drawn.length > 0) {
            this.extras.set(id, drawn);
        }
    }

    private drawExtra(extraId: string, fill: Filled): string {
        this.draw(extraId, fill);
        return extraId;
    }

    private draw(id: string, { outline, fill, alpha, texture, tint, feather }: Filled): void {
        if (outline.length < 6) {
            this.surface.remove(id);
        } else if (texture !== null) {
            this.surface.fillTextured(id, outline, texture, tint, alpha, feather);
        } else {
            this.surface.fill(id, outline, fill, alpha, feather);
        }
    }

    private removeExtras(id: string): void {
        for (const extraId of this.extras.get(id) ?? []) {
            this.surface.remove(extraId);
        }
        this.extras.delete(id);
    }

    preview(feature: Feature): void {
        const { outline } = outlineAndStyle(feature, this.resolve);
        if (outline.length >= 6) {
            this.surface.fill(PREVIEW_ID, outline, PREVIEW_STYLE.fill, PREVIEW_STYLE.alpha, false);
        } else {
            this.surface.remove(PREVIEW_ID);
        }
    }

    remove(id: string): void {
        this.surface.remove(id);
        this.removeExtras(id);
    }

    clearPreview(): void {
        this.surface.remove(PREVIEW_ID);
    }

    clear(): void {
        this.surface.clear();
        this.extras.clear();
    }
}
