// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Stories for the levels panel. Each story keeps its own level list and
 * applies the panel's actions to it, so selecting, renaming, re-banding,
 * adding and removing all work in Storybook.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { levelPanel, nextLevelBand, type Level } from '../tools/levels';
import { renderLevelPanel, type LevelPanelLabels } from './level-panel-view';

export interface LevelPanelArgs {
    readonly levels: readonly Level[];
    readonly active: string | null;
    readonly counts: Readonly<Record<string, number>>;
}

const LABELS: LevelPanelLabels = {
    allLevels: 'All levels',
    addAbove: 'Add level above',
    addBelow: 'Add level below',
    remove: 'Remove level',
    name: 'Level name',
    bottom: 'Floor elevation',
    top: 'Ceiling elevation',
    features: (count) => `${count} features`,
    empty: 'This scene has no levels yet. Everything drawn shows on every level until you add one.',
    removeBlocked: "Remove or move this level's features before removing it.",
    list: 'Scene levels, top to bottom',
};

/** Mount an interactive panel inside a stand-in Foundry window scoped for the module's styles. */
export function mountLevelPanel(args: LevelPanelArgs): HTMLElement {
    const windowEl = document.createElement('div');
    windowEl.className = 'zephyrex-cartography zc-story-window';
    const root = document.createElement('div');
    windowEl.append(root);
    let levels = [...args.levels];
    let active = args.active;
    let created = 0;
    const render = (): void => {
        renderLevelPanel(root, levelPanel(levels, active, args.counts), LABELS, {
            select: (id) => {
                active = id;
                render();
            },
            add: (position) => {
                created += 1;
                const id = `new-${created}`;
                levels = [...levels, { id, name: `Level ${levels.length + 1}`, ...nextLevelBand(levels, position) }];
                active = id;
                render();
            },
            rename: (id, levelName) => {
                levels = levels.map((l) => (l.id === id ? { ...l, name: levelName } : l));
                render();
            },
            setBand: (id, bottom, ceiling) => {
                levels = levels.map((l) => (l.id === id ? { ...l, bottom, top: ceiling } : l));
                render();
            },
            remove: (id) => {
                levels = levels.filter((l) => l.id !== id);
                active = active === id ? null : active;
                render();
            },
        });
    };
    render();
    return windowEl;
}

const HAB_LEVELS: readonly Level[] = [
    { id: 'cellar', name: 'Cellar', bottom: -10, top: 0 },
    { id: 'ground', name: 'Ground floor', bottom: 0, top: 10 },
    { id: 'upper', name: 'Upper floor', bottom: 10, top: 20 },
];

const meta: Meta<LevelPanelArgs> = {
    title: 'Levels/Level Panel',
    excludeStories: ['mountLevelPanel'],
    render: mountLevelPanel,
    args: { levels: HAB_LEVELS, active: 'ground', counts: { ground: 12, upper: 4 } },
};

export default meta;

type Story = StoryObj<LevelPanelArgs>;

export const ThreeFloors: Story = {};

export const EditingAllLevels: Story = {
    args: { active: null },
};

export const NoLevelsYet: Story = {
    args: { levels: [], active: null, counts: {} },
};
