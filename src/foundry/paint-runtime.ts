// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The paint tool's window: opened with the tool, it sets what the tool does
 * (lay areas and strokes, or blend texture into the level's splat map, or
 * take it out), the texture, the brush size, and then the ground's movement
 * cost or the blend's strength.
 */
import { BIOME_TITLE_KEYS, I18N } from '../i18n';
import type { BiomeKind } from '../tools/biome';
import { parseSizePx } from '../tools/size-input';
import { type BakeTarget, DEFAULT_STRENGTH, type PaintMode, parseStrength, type SplatState } from '../tools/splat';
import { DEFAULT_BRUSH_RADIUS } from '../tools/stroke';
import { NORMAL_COST, parseCostInput } from '../tools/terrain-cost';
import { biomeSwatches, type TextureResolver, type TextureSetRef, textureSwatches } from '../tools/texture';
import { renderPaintPanel } from '../ui/paint-panel-view';
import { format, localize } from './localize';
import { acceptTyped, createSettingsWindow, type SettingsWindow } from './view-window';

const PANEL_WIDTH = 340;

/** The texture a fresh session paints. */
const DEFAULT_PAINT: BiomeKind = 'grassland';

export interface PaintSettings {
    readonly biome: BiomeKind;
    /** The texture the ground is drawn in (and blended), or null for its biome's own. */
    readonly texture: string | null;
    /** Brush radius, scene px. */
    readonly radius: number;
    /** What crossing painted ground costs on foot (1: ordinary ground). */
    readonly movementCost: number;
    readonly mode: PaintMode;
    /** 0.05–1: how much one blend dab lays down. */
    readonly strength: number;
}

/** Baking the level's blend: where it stands, whether it has a level's background to go into, and baking or unbaking it. */
export interface PaintBaking {
    readonly state: () => SplatState;
    readonly backgroundBakeable: () => boolean;
    readonly bake: (into: BakeTarget) => Promise<unknown>;
    readonly unbake: () => Promise<unknown>;
}

/** The active texture set's textures, and choosing another set. */
export interface PaintTextures {
    /** Resolves a texture to the image a panel can show. */
    readonly previews: () => TextureResolver;
    /** Every texture the active set has. */
    readonly roles: () => readonly string[];
    readonly sets: () => readonly TextureSetRef[];
    /** The key of the set in use. */
    readonly active: () => string;
    readonly choose: (key: string) => Promise<void>;
}

/** `onChange` runs after every choice, to put it in the tool's hand. */
export function registerPaintRuntime(textures: PaintTextures, onChange: (settings: PaintSettings) => void, baking: PaintBaking): SettingsWindow<PaintSettings> {
    const panel = createSettingsWindow<PaintSettings>({
        id: 'paint',
        title: () => localize(I18N.paint.title),
        width: PANEL_WIDTH,
        initial: { biome: DEFAULT_PAINT, texture: null, radius: DEFAULT_BRUSH_RADIUS, movementCost: NORMAL_COST, mode: 'shapes', strength: DEFAULT_STRENGTH },
        onChange,
        render: (root, settings, choose) => {
            const previews = textures.previews();
            const choices = biomeSwatches(previews).map((swatch) => ({ ...swatch, label: localize(BIOME_TITLE_KEYS[swatch.biome]) }));
            const p = I18N.paint;
            renderPaintPanel(
                root,
                {
                    choices,
                    ...settings,
                    textures: textureSwatches(textures.roles(), previews),
                    sets: textures.sets().map((set) => ({ key: set.key, label: set.name })),
                    set: textures.active(),
                    splat: baking.state(),
                    backgroundBakeable: baking.backgroundBakeable(),
                },
                {
                    ground: localize(p.ground),
                    texture: (shown) => format(p.texture, { texture: shown }),
                    ownTexture: localize(p.ownTexture),
                    textureSet: localize(p.textureSet),
                    size: localize(p.size),
                    movementCost: localize(p.movementCost),
                    mode: localize(p.mode),
                    modes: { shapes: localize(p.modes.shapes), blend: localize(p.modes.blend), unblend: localize(p.modes.unblend) },
                    strength: localize(p.strength),
                    bake: { tile: localize(p.bake), background: localize(p.bakeBackground) },
                    unbake: localize(p.unbake),
                },
                {
                    pick: (biome) => {
                        choose({ ...settings, biome });
                    },
                    pickTexture: (texture) => {
                        choose({ ...settings, texture });
                    },
                    // The panel redraws with the new set's textures once the layer has rebuilt for it.
                    chooseSet: (key) => {
                        panel.apply(async () => textures.choose(key));
                    },
                    setSize: acceptTyped(parseSizePx, (radius) => {
                        choose({ ...settings, radius });
                    }),
                    setMovementCost: acceptTyped(parseCostInput, (movementCost) => {
                        choose({ ...settings, movementCost });
                    }),
                    setMode: (mode) => {
                        choose({ ...settings, mode });
                    },
                    setStrength: acceptTyped(parseStrength, (strength) => {
                        choose({ ...settings, strength });
                    }),
                    bake: (into) => {
                        panel.apply(async () => baking.bake(into));
                    },
                    unbake: () => {
                        panel.apply(async () => baking.unbake());
                    },
                },
            );
        },
    });
    return panel;
}
