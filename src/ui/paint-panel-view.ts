// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The paint tool's panel: pick the texture to paint with from a swatch grid,
 * the brush size for a freehand stroke, and what crossing the painted ground
 * costs (difficult terrain). A swatch shows the texture from
 * the active set, or the terrain's flat colour where the set has none (water
 * is always a tint). A pure function from the panel state to elements;
 * unit-tested under happy-dom.
 */
import type { BiomeKind } from '../tools/biome';
import { el, labelledInput, pressable, replacePreservingFocus } from './dom';

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
}

export interface PaintLabels {
    readonly texture: string;
    readonly size: string;
    readonly movementCost: string;
}

export interface PaintHandlers {
    readonly pick: (biome: BiomeKind) => void;
    /** Apply a typed brush size; false rejects it (the input reverts). */
    readonly setSize: (typed: string) => boolean;
    /** Apply a typed movement cost; false rejects it (the input reverts). */
    readonly setMovementCost: (typed: string) => boolean;
}

function swatch(choice: PaintChoice, picked: boolean, onPick: () => void): HTMLButtonElement {
    const node = pressable('zc-paint-swatch tw-flex tw-flex-col tw-items-center tw-gap-1 tw-text-xs', '', picked, `paint-${choice.biome}`, onPick);
    const chip = el('span', 'tw-block tw-h-10 tw-w-10 tw-rounded tw-bg-cover');
    chip.style.backgroundColor = choice.colour;
    if (choice.image !== null) {
        chip.style.backgroundImage = `url(${JSON.stringify(choice.image)})`;
    }
    node.append(chip, el('span', '', choice.label));
    return node;
}

export function renderPaintPanel(root: HTMLElement, panel: PaintPanel, labels: PaintLabels, handlers: PaintHandlers): void {
    const group = el('div', 'tw-grid tw-grid-cols-4 tw-gap-1');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', labels.texture);
    group.append(
        ...panel.choices.map((choice) =>
            swatch(choice, choice.biome === panel.biome, () => {
                handlers.pick(choice.biome);
            }),
        ),
    );
    replacePreservingFocus(root, [
        group,
        labelledInput(labels.size, 'number', String(panel.radius), 'paint-size', handlers.setSize),
        labelledInput(labels.movementCost, 'number', String(panel.movementCost), 'paint-cost', handlers.setMovementCost),
    ]);
}
