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
import { biomeSwatches, type TextureResolver } from '../tools/texture';
import { renderPaintPanel } from '../ui/paint-panel-view';
import { localize } from './localize';
import { createViewWindow } from './view-window';

const PANEL_WIDTH = 340;
const PANEL_HEIGHT = 380;

/** The texture a fresh session paints. */
const DEFAULT_PAINT: BiomeKind = 'grassland';

export interface PaintSettings {
    readonly biome: BiomeKind;
    /** Brush radius, scene px. */
    readonly radius: number;
}

export interface PaintRuntime {
    readonly open: () => void;
    readonly current: () => PaintSettings;
}

/** `onChange` runs after every choice, to put it in the tool's hand. */
export function registerPaintRuntime(textures: () => TextureResolver, onChange: (settings: PaintSettings) => void): PaintRuntime {
    let settings: PaintSettings = { biome: DEFAULT_PAINT, radius: DEFAULT_BRUSH_RADIUS };

    const choose = (next: PaintSettings): void => {
        settings = next;
        onChange(settings);
        panel.refresh();
    };

    const panel = createViewWindow({
        id: 'paint',
        title: () => localize(I18N.paint.title),
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        render: (root) => {
            const choices = biomeSwatches(textures()).map((swatch) => ({ ...swatch, label: localize(BIOME_TITLE_KEYS[swatch.biome]) }));
            renderPaintPanel(
                root,
                { choices, ...settings },
                { texture: localize(I18N.paint.texture), size: localize(I18N.paint.size) },
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
                },
            );
        },
    });

    return { open: panel.open, current: () => settings };
}
