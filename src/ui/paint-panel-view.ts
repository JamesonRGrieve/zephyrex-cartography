// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The paint tool's panel: whether it lays areas and strokes or blends
 * texture into the level's splat map, the texture from a swatch grid, the
 * brush size, and then what crossing painted ground costs (difficult
 * terrain) or how much one blend dab lays down. A swatch shows the texture from
 * the active set, or the terrain's flat colour where the set has none (water
 * is always a tint). A pure function from the panel state to elements;
 * unit-tested under happy-dom.
 */
import type { BiomeKind } from '../tools/biome';
import { PAINT_MODES, type PaintMode } from '../tools/splat';
import { choice, el, labelledInput, pressable, replacePreservingFocus } from './dom';

export interface PaintChoice {
    readonly biome: BiomeKind;
    readonly label: string;
    /** The texture's image URL, or null to show the flat colour. */
    readonly image: string | null;
    /** The flat colour, as a CSS colour. */
    readonly colour: string;
}

export interface PaintPanel {
    readonly choices: readonly PaintChoice[];
    readonly biome: BiomeKind;
    /** Brush radius, scene px. */
    readonly radius: number;
    /** What crossing painted ground costs on foot (1: ordinary ground). */
    readonly movementCost: number;
    /** Lay areas and strokes, or blend the texture into the level's splat map (or take it out). */
    readonly mode: PaintMode;
    /** 0.05–1: how much one blend dab lays down. */
    readonly strength: number;
}

export interface PaintLabels {
    readonly texture: string;
    readonly size: string;
    readonly movementCost: string;
    readonly mode: string;
    readonly modes: Readonly<Record<PaintMode, string>>;
    readonly strength: string;
}

export interface PaintHandlers {
    readonly pick: (biome: BiomeKind) => void;
    /** Apply a typed brush size; false rejects it (the input reverts). */
    readonly setSize: (typed: string) => boolean;
    /** Apply a typed movement cost; false rejects it (the input reverts). */
    readonly setMovementCost: (typed: string) => boolean;
    readonly setMode: (mode: PaintMode) => void;
    /** Apply a typed blend strength; false rejects it (the input reverts). */
    readonly setStrength: (typed: string) => boolean;
}

function swatch(texture: PaintChoice, picked: boolean, onPick: () => void): HTMLButtonElement {
    const node = pressable('zc-paint-swatch tw-flex tw-flex-col tw-items-center tw-gap-1 tw-text-xs', '', picked, `paint-${texture.biome}`, onPick);
    const chip = el('span', 'tw-block tw-h-10 tw-w-10 tw-rounded tw-bg-cover');
    chip.style.backgroundColor = texture.colour;
    if (texture.image !== null) {
        chip.style.backgroundImage = `url(${JSON.stringify(texture.image)})`;
    }
    node.append(chip, el('span', '', texture.label));
    return node;
}

export function renderPaintPanel(root: HTMLElement, panel: PaintPanel, labels: PaintLabels, handlers: PaintHandlers): void {
    const group = el('div', 'tw-grid tw-grid-cols-4 tw-gap-1');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', labels.texture);
    group.append(
        ...panel.choices.map((texture) =>
            swatch(texture, texture.biome === panel.biome, () => {
                handlers.pick(texture.biome);
            }),
        ),
    );
    const blending = panel.mode !== 'shapes';
    replacePreservingFocus(root, [
        choice(
            'zc-paint-mode',
            labels.mode,
            PAINT_MODES.map((mode) => [mode, labels.modes[mode]] as const),
            panel.mode,
            handlers.setMode,
        ),
        group,
        labelledInput(labels.size, 'number', String(panel.radius), 'paint-size', handlers.setSize),
        // Blending paints texture, not ground: its cost belongs to areas and strokes, its strength to the blend.
        blending
            ? labelledInput(labels.strength, 'number', String(panel.strength), 'paint-strength', handlers.setStrength)
            : labelledInput(labels.movementCost, 'number', String(panel.movementCost), 'paint-cost', handlers.setMovementCost),
    ]);
}
