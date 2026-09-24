// SPDX-License-Identifier: AGPL-3.0-or-later
/** Stories for the area effects panel; each keeps its own area, so the controls work in Storybook. */
import type { Meta, StoryObj } from '@storybook/html-vite';
import type { AreaEffectKind, RegionEvent } from '../tools/area-effects';
import type { AreaSettings } from '../tools/areas';
import { parseCostInput } from '../tools/terrain-cost';
import { renderEffectsPanel, type EffectsLabels } from './effects-panel-view';

export interface EffectsPanelArgs {
    readonly settings: AreaSettings;
}

const KIND_NAMES: Readonly<Record<AreaEffectKind, string>> = {
    darkness: 'Adjust Darkness Level',
    suppressWeather: 'Suppress Weather',
    text: 'Display Scrolling Text',
    pause: 'Pause Game',
    macro: 'Execute Macro',
    script: 'Execute Script',
    activeEffect: 'Apply Active Effect',
};

const EVENT_NAMES: Readonly<Record<RegionEvent, string>> = {
    regionBoundary: 'Region Boundary Changed',
    regionAnimation: 'Region Animation State Changed',
    behaviorActivated: 'Behavior Activated',
    behaviorDeactivated: 'Behavior Deactivated',
    behaviorViewed: 'Behavior Viewed',
    behaviorUnviewed: 'Behavior Unviewed',
    tokenEnter: 'Token Enters',
    tokenExit: 'Token Exits',
    tokenMoveIn: 'Token Moves In',
    tokenMoveOut: 'Token Moves Out',
    tokenMoveWithin: 'Token Moves Within',
    tokenAnimateIn: 'Token Animates In',
    tokenAnimateOut: 'Token Animates Out',
    tokenTurnStart: 'Token Starts Turn',
    tokenTurnEnd: 'Token Ends Turn',
    tokenRoundStart: 'Token Starts Round',
    tokenRoundEnd: 'Token Ends Round',
};

/** Named as Foundry's own behaviour sheets name them. */
const LABELS: EffectsLabels = {
    movementCost: 'Movement cost (1: ordinary ground)',
    effects: 'Area effects',
    none: 'No effects.',
    adding: 'New effect',
    add: 'Add effect',
    remove: 'Remove',
    kind: (kind) => KIND_NAMES[kind],
    darknessMode: 'Mode',
    darknessModes: { override: 'Override', brighten: 'Brighten', darken: 'Darken' },
    modifier: 'Modifier',
    text: 'Text',
    colour: 'Color',
    visibility: 'Visibility',
    visibilities: { gamemaster: 'Gamemaster', observer: 'Observer', anyone: 'Anyone' },
    once: 'Once',
    events: 'Events',
    eventName: (regionEvent) => EVENT_NAMES[regionEvent],
    macro: 'Macro',
    everyone: 'Everyone',
    script: 'Script',
    activeEffects: 'Effects (one UUID per line)',
};

/** Mount an interactive panel inside a stand-in Foundry window scoped for the module's styles. */
export function mountEffectsPanel(args: EffectsPanelArgs): HTMLElement {
    const windowEl = document.createElement('div');
    windowEl.className = 'zephyrex-cartography zc-story-window';
    const root = document.createElement('div');
    windowEl.append(root);
    let settings = args.settings;
    let adding: AreaEffectKind = 'darkness';
    const render = (): void => {
        renderEffectsPanel(root, { settings, adding }, LABELS, {
            setMovementCost: (typed) => {
                const cost = parseCostInput(typed);
                if (cost !== null) {
                    settings = { ...settings, movementCost: cost };
                    render();
                }
                return cost !== null;
            },
            setEffects: (effects) => {
                settings = { ...settings, effects };
                render();
            },
            setAdding: (kind) => {
                adding = kind;
                render();
            },
        });
    };
    render();
    return windowEl;
}

const meta: Meta<EffectsPanelArgs> = {
    title: 'Regions/Area Effects Panel',
    excludeStories: ['mountEffectsPanel'],
    render: mountEffectsPanel,
    args: { settings: { movementCost: 1, effects: [] } },
};

export default meta;

type Story = StoryObj<EffectsPanelArgs>;

export const OrdinaryGround: Story = {};

export const DarkMireRoom: Story = {
    args: {
        settings: {
            movementCost: 2,
            effects: [{ kind: 'darkness', mode: 'darken', modifier: 0.4 }, { kind: 'suppressWeather' }],
        },
    },
};

export const TrappedCorridor: Story = {
    args: {
        settings: {
            movementCost: 1,
            effects: [
                { kind: 'text', text: 'Click.', colour: '#ff5500', visibility: 'anyone', once: true, events: ['tokenAnimateIn'] },
                { kind: 'pause', once: true },
                { kind: 'macro', uuid: 'Macro.dartTrap', everyone: false, events: ['tokenEnter'] },
                { kind: 'script', source: 'ui.notifications.info("A draught.");', events: ['tokenExit'] },
                { kind: 'activeEffect', effects: ['Compendium.world.effects.ActiveEffect.poisoned'] },
            ],
        },
    },
};
