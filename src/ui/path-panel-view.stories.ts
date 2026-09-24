// SPDX-License-Identifier: AGPL-3.0-or-later
/** Stories for the road and river panel; each keeps its own settings, so every control works in Storybook. */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { LIQUID_LOOKS, type PathKind, type RiverLook } from '../tools/path';
import { parseSizePx } from '../tools/size-input';
import { renderPathPanel, type BedChoice, type PathLabels } from './path-panel-view';

export interface PathArgs {
    readonly kind: PathKind;
    readonly width: number;
    readonly river: RiverLook;
    readonly beds: readonly BedChoice[];
}

const LABELS: PathLabels = {
    width: 'Width (px)',
    liquid: 'Liquid',
    liquids: { water: 'Water', lava: 'Lava', poison: 'Poison', acid: 'Acid' },
    shade: 'Shade',
    bed: 'Bed',
    noBed: 'No bed',
};

/** Mount an interactive panel inside a stand-in Foundry window scoped for the module's styles. */
export function mountPathPanel(args: PathArgs): HTMLElement {
    const windowEl = document.createElement('div');
    windowEl.className = 'zephyrex-cartography zc-story-window';
    const root = document.createElement('div');
    windowEl.append(root);
    let { width, river } = args;
    const render = (): void => {
        renderPathPanel(root, { kind: args.kind, width, river, beds: args.beds }, LABELS, {
            setWidth: (typed) => {
                const size = parseSizePx(typed);
                if (size === null) {
                    return false;
                }
                width = size;
                render();
                return true;
            },
            setRiver: (look) => {
                river = look;
                render();
            },
        });
    };
    render();
    return windowEl;
}

const BEDS: readonly BedChoice[] = [
    { role: 'dirt', label: 'Dirt' },
    { role: 'sand', label: 'Sand' },
    { role: 'rock', label: 'Rock' },
    { role: 'marsh', label: 'Marsh' },
];

const meta: Meta<PathArgs> = {
    title: 'Terrain/Road and River Panel',
    excludeStories: ['mountPathPanel'],
    render: mountPathPanel,
    args: { kind: 'river', width: 40, river: LIQUID_LOOKS.water, beds: BEDS },
};

export default meta;

type Story = StoryObj<PathArgs>;

export const WaterOnDirt: Story = {};

export const LavaFlow: Story = {
    args: { river: LIQUID_LOOKS.lava, width: 90 },
};

export const BarePoisonWithABedTheSetLacks: Story = {
    args: { river: { ...LIQUID_LOOKS.poison, bed: 'floor.slime' } },
};

export const Road: Story = {
    args: { kind: 'road', width: 30 },
};
