// SPDX-License-Identifier: AGPL-3.0-or-later
/** Stories for the paint tool's panel; each keeps its own choice, so picking and resizing work in Storybook. */
import type { Meta, StoryObj } from '@storybook/html-vite';
import type { BiomeKind } from '../tools/biome';
import { parseSizePx } from '../tools/size-input';
import { parseCostInput } from '../tools/terrain-cost';
import { renderPaintPanel, type PaintChoice, type PaintLabels } from './paint-panel-view';

export interface PaintArgs {
    readonly choices: readonly PaintChoice[];
    readonly biome: BiomeKind;
    readonly radius: number;
    readonly movementCost: number;
}

const LABELS: PaintLabels = { texture: 'Texture', size: 'Brush size (px)', movementCost: 'Movement cost (×)' };

/** Mount an interactive panel inside a stand-in Foundry window scoped for the module's styles. */
export function mountPaintPanel(args: PaintArgs): HTMLElement {
    const windowEl = document.createElement('div');
    windowEl.className = 'zephyrex-cartography zc-story-window';
    const root = document.createElement('div');
    windowEl.append(root);
    let { biome, radius, movementCost } = args;
    const render = (): void => {
        renderPaintPanel(root, { choices: args.choices, biome, radius, movementCost }, LABELS, {
            setMovementCost: (typed) => {
                const cost = parseCostInput(typed);
                if (cost === null) {
                    return false;
                }
                movementCost = cost;
                render();
                return true;
            },
            pick: (picked) => {
                biome = picked;
                render();
            },
            setSize: (typed) => {
                const size = parseSizePx(typed);
                if (size === null) {
                    return false;
                }
                radius = size;
                render();
                return true;
            },
        });
    };
    render();
    return windowEl;
}

/** An inline tile standing in for a pack texture. */
function tile(colour: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="${colour}"/><circle cx="8" cy="8" r="4" fill="#0003"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const TEXTURED: readonly PaintChoice[] = [
    { biome: 'water', label: 'Water', image: null, colour: '#2f5d7c' },
    { biome: 'grassland', label: 'Grassland', image: tile('#5a7b3c'), colour: '#5a7b3c' },
    { biome: 'forest', label: 'Forest', image: tile('#2f4a24'), colour: '#2f4a24' },
    { biome: 'sand', label: 'Sand', image: tile('#c2a866'), colour: '#c2a866' },
    { biome: 'lava', label: 'Lava', image: tile('#c1440e'), colour: '#c1440e' },
    { biome: 'snow', label: 'Snow', image: null, colour: '#dfe8ee' },
];

const meta: Meta<PaintArgs> = {
    title: 'Terrain/Paint Panel',
    excludeStories: ['mountPaintPanel'],
    render: mountPaintPanel,
    args: { choices: TEXTURED, biome: 'grassland', radius: 25, movementCost: 1 },
};

export default meta;

type Story = StoryObj<PaintArgs>;

export const Grassland: Story = {};

export const WaterWithAWideBrush: Story = {
    args: { biome: 'water', radius: 120 },
};

export const DifficultMarsh: Story = {
    args: { biome: 'water', movementCost: 2 },
};

export const NoTextureSet: Story = {
    args: { choices: TEXTURED.map((choice) => ({ ...choice, image: null })), biome: 'sand' },
};
