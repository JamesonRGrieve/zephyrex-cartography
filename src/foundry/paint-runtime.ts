// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The paint tool's window: opened with the tool, it picks the texture the
 * tool paints and its brush size. A click-drawn area and a dragged stroke
 * both take the texture; the size is a stroke's radius.
 */
import { BIOME_TITLE_KEYS, I18N } from '../i18n';
import type { BiomeKind } from '../tools/biome';
import { parseSizePx } from '../tools/size-input';
import { DEFAULT_BRUSH_RADIUS } from '../tools/stroke';
import { NORMAL_COST, parseCostInput } from '../tools/terrain-cost';
import { biomeSwatches, type TextureResolver } from '../tools/texture';
import { renderPaintPanel } from '../ui/paint-panel-view';
import { localize } from './localize';
import { createSettingsWindow, type SettingsWindow } from './view-window';

const PANEL_WIDTH = 340;
const PANEL_HEIGHT = 380;

/** The texture a fresh session paints. */
const DEFAULT_PAINT: BiomeKind = 'grassland';

export interface PaintSettings {
    readonly biome: BiomeKind;
    /** Brush radius, scene px. */
    readonly radius: number;
    /** What crossing painted ground costs on foot (1: ordinary ground). */
    readonly movementCost: number;
}

/** `onChange` runs after every choice, to put it in the tool's hand. */
export function registerPaintRuntime(textures: () => TextureResolver, onChange: (settings: PaintSettings) => void): SettingsWindow<PaintSettings> {
    return createSettingsWindow<PaintSettings>({
        id: 'paint',
        title: () => localize(I18N.paint.title),
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        initial: { biome: DEFAULT_PAINT, radius: DEFAULT_BRUSH_RADIUS, movementCost: NORMAL_COST },
        onChange,
        render: (root, settings, choose) => {
            const choices = biomeSwatches(textures()).map((swatch) => ({ ...swatch, label: localize(BIOME_TITLE_KEYS[swatch.biome]) }));
            renderPaintPanel(
                root,
                { choices, ...settings },
                { texture: localize(I18N.paint.texture), size: localize(I18N.paint.size), movementCost: localize(I18N.paint.movementCost) },
                {
                    pick: (biome) => {
                        choose({ ...settings, biome });
                    },
                    setSize: (typed) => {
                        const radius = parseSizePx(typed);
                        if (radius !== null) {
                            choose({ ...settings, radius });
                        }
                        return radius !== null;
                    },
                    setMovementCost: (typed) => {
                        const movementCost = parseCostInput(typed);
                        if (movementCost !== null) {
                            choose({ ...settings, movementCost });
                        }
                        return movementCost !== null;
                    },
                },
            );
        },
    });
}
