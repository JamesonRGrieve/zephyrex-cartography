// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Stories for the interior panel of an enterable stamp. Each story keeps its
 * own link state, so creating, linking and unlinking all work in Storybook;
 * opening the interior is logged.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { renderSubmapPanel, type SceneChoice, type SubmapLabels } from './submap-view';

export interface SubmapArgs {
    readonly stampName: string;
    readonly linkedScene: string | null;
    readonly scenes: readonly SceneChoice[];
    readonly onOpen: () => void;
}

const LABELS: SubmapLabels = {
    linkedTo: (scene) => `Leads into ${scene}`,
    notLinked: 'This building does not lead anywhere yet.',
    createInterior: 'Create an interior scene',
    linkExisting: 'Or link an existing scene',
    scene: 'Scene',
    link: 'Link scene',
    open: 'Open the interior',
    unlink: 'Unlink',
    noScenes: 'There are no other scenes to link.',
};

/** Mount an interactive panel inside a stand-in Foundry window scoped for the module's styles. */
export function mountSubmapPanel(args: SubmapArgs): HTMLElement {
    const windowEl = document.createElement('div');
    windowEl.className = 'zephyrex-cartography zc-story-window';
    const root = document.createElement('div');
    windowEl.append(root);
    let linked = args.linkedScene;
    let scenes = [...args.scenes];
    const render = (): void => {
        renderSubmapPanel(root, { stampName: args.stampName, linkedScene: linked, scenes }, LABELS, {
            createInterior: () => {
                linked = `${args.stampName} interior`;
                scenes = [...scenes, { id: `new-${scenes.length}`, name: linked }];
                render();
            },
            link: (sceneId) => {
                linked = scenes.find((s) => s.id === sceneId)?.name ?? null;
                render();
            },
            open: args.onOpen,
            unlink: () => {
                linked = null;
                render();
            },
        });
    };
    render();
    return windowEl;
}

const meta: Meta<SubmapArgs> = {
    title: 'Submaps/Interior Panel',
    excludeStories: ['mountSubmapPanel'],
    render: mountSubmapPanel,
    args: {
        stampName: 'Hab Block',
        linkedScene: null,
        scenes: [
            { id: 'vault', name: 'Vault' },
            { id: 'undercroft', name: 'Undercroft (imported)' },
        ],
    },
    argTypes: { onOpen: { action: 'open' } },
};

export default meta;

type Story = StoryObj<SubmapArgs>;

export const NotLinked: Story = {};

export const Linked: Story = {
    args: { linkedScene: 'Vault' },
};

export const NoOtherScenes: Story = {
    args: { scenes: [] },
};
