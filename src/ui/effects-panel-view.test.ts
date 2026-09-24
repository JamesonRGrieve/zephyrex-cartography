// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_AREA_DISPLAY } from '../tools/area-effects';
import * as stories from './effects-panel-view.stories';

function mount(story: { readonly args?: Partial<stories.EffectsPanelArgs> }): HTMLElement {
    const el = stories.mountEffectsPanel({
        settings: story.args?.settings ?? stories.default.args?.settings ?? { movementCost: 1, effects: [], display: DEFAULT_AREA_DISPLAY },
    });
    document.body.replaceChildren(el);
    return el;
}

function input(root: HTMLElement, labelText: string): HTMLInputElement | HTMLTextAreaElement {
    const found = [...root.querySelectorAll('label')].find((l) => l.textContent.startsWith(labelText))?.querySelector('input, textarea');
    if (!(found instanceof HTMLInputElement || found instanceof HTMLTextAreaElement)) {
        throw new Error(`no field ${labelText}`);
    }
    return found;
}

function change(target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
    target.value = value;
    target.dispatchEvent(new Event('change'));
}

function select(root: HTMLElement, id: string): HTMLSelectElement {
    const found = root.querySelector<HTMLSelectElement>(`#${id}`);
    if (!found) {
        throw new Error(`no select ${id}`);
    }
    return found;
}

/** Each behaviour's legend, after the region display's own. */
function legends(root: HTMLElement): string[] {
    const [region, ...behaviours] = [...root.querySelectorAll('fieldset > legend.tw-font-bold')].map((legend) => legend.textContent);
    expect(region).toBe('Region');
    return behaviours;
}

describe('area effects panel', () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it('shows ordinary ground with no effects, and takes a movement cost Foundry accepts', () => {
        const root = mount(stories.OrdinaryGround);
        expect(root.textContent).toContain('No effects.');
        const cost = input(root, 'Movement cost');
        change(cost, '3');
        expect(input(root, 'Movement cost').value).toBe('3');
        change(input(root, 'Movement cost'), '9');
        expect(input(root, 'Movement cost').value).toBe('3');
    });

    it('adds the kind picked, as Foundry makes it, and removes an effect', () => {
        const root = mount(stories.OrdinaryGround);
        change(select(root, 'zc-effect-kind'), 'pause');
        [...root.querySelectorAll('button')].find((b) => b.textContent === 'Add effect')?.click();
        expect(legends(root)).toEqual(['1. Pause Game']);
        expect(root.querySelector<HTMLInputElement>('input[data-zc-focus="effect-0-once"]')?.checked).toBe(false);
        root.querySelector<HTMLButtonElement>('button[aria-label="Remove: Pause Game"]')?.click();
        expect(root.textContent).toContain('No effects.');
    });

    it('edits darkness, reverting a modifier outside 0 to 1', () => {
        const root = mount(stories.DarkMireRoom);
        expect(legends(root)).toEqual(['1. Adjust Darkness Level', '2. Suppress Weather']);
        expect(select(root, 'effect-0-mode').value).toBe('darken');
        change(select(root, 'effect-0-mode'), 'brighten');
        expect(select(root, 'effect-0-mode').value).toBe('brighten');
        change(input(root, 'Modifier'), '0.9');
        expect(input(root, 'Modifier').value).toBe('0.9');
        change(input(root, 'Modifier'), '2');
        expect(input(root, 'Modifier').value).toBe('0.9');
    });

    it('shows every kind’s fields, and subscribes events in Foundry’s order', () => {
        const root = mount(stories.TrappedCorridor);
        expect(legends(root)).toEqual(['1. Display Scrolling Text', '2. Pause Game', '3. Execute Macro', '4. Execute Script', '5. Apply Active Effect']);
        expect(input(root, 'Text').value).toBe('Click.');
        expect(select(root, 'effect-0-visibility').value).toBe('anyone');
        // Scrolling text only offers the events Foundry lets it subscribe to.
        expect(root.querySelector('input[data-zc-focus="effect-0-tokenEnter"]')).toBeNull();
        root.querySelector<HTMLInputElement>('input[data-zc-focus="effect-0-tokenTurnEnd"]')?.click();
        expect(root.querySelector<HTMLInputElement>('input[data-zc-focus="effect-0-tokenTurnEnd"]')?.checked).toBe(true);
        expect(input(root, 'Macro').value).toBe('Macro.dartTrap');
        change(input(root, 'Macro'), '  ');
        expect(input(root, 'Macro').value).toBe('');
        expect(input(root, 'Script').value).toContain('draught');
        change(input(root, 'Effects (one UUID per line)'), ' a \n\n b ');
        expect(input(root, 'Effects (one UUID per line)').value).toBe('a\nb');
    });

    it('sets who sees the region, how it is highlighted, its measurements, and the walls that shape it, with a priority only while shaped', () => {
        const root = mount(stories.OrdinaryGround);
        expect(select(root, 'zc-area-visibility').value).toBe('layer');
        expect(select(root, 'zc-area-restriction').value).toBe('');
        expect(root.querySelector('input[data-zc-focus="area-priority"]')).toBeNull();
        change(select(root, 'zc-area-visibility'), 'observer');
        change(select(root, 'zc-area-highlight'), 'coverage');
        change(select(root, 'zc-area-restriction'), 'sight');
        expect(select(root, 'zc-area-visibility').value).toBe('observer');
        expect(select(root, 'zc-area-highlight').value).toBe('coverage');
        const priority = (): HTMLInputElement | null => root.querySelector<HTMLInputElement>('input[data-zc-focus="area-priority"]');
        expect(priority()?.value).toBe('0');
        const at = priority();
        if (at) {
            change(at, '3');
        }
        expect(priority()?.value).toBe('3');
        const bad = priority();
        if (bad) {
            change(bad, '-1');
        }
        expect(priority()?.value).toBe('3');
        root.querySelector<HTMLInputElement>('input[data-zc-focus="area-measurements"]')?.click();
        expect(root.querySelector<HTMLInputElement>('input[data-zc-focus="area-measurements"]')?.checked).toBe(true);
        root.querySelector<HTMLInputElement>('input[data-zc-focus="area-observed"]')?.click();
        expect(root.querySelector<HTMLInputElement>('input[data-zc-focus="area-observed"]')?.checked).toBe(true);
        change(select(root, 'zc-area-restriction'), '');
        expect(priority()).toBeNull();
    });

    it('sets what a toggle does to each other behaviour, starts one disabled, and renumbers the toggles when one is removed', () => {
        const root = mount(stories.LightsOutRoom);
        const disabled = (index: number): boolean | undefined =>
            root.querySelector<HTMLInputElement>(`input[data-zc-focus="effect-${index}-disabled"]`)?.checked;
        expect([0, 1, 2].map(disabled)).toEqual([true, false, false]);
        expect(select(root, 'effect-1-target-0').value).toBe('enable');
        expect(select(root, 'effect-2-target-0').value).toBe('disable');
        // A toggle names every behaviour but itself.
        expect(root.querySelector('#effect-1-target-1')).toBeNull();
        change(select(root, 'effect-1-target-2'), 'disable');
        expect(select(root, 'effect-1-target-2').value).toBe('disable');
        root.querySelector<HTMLInputElement>('input[data-zc-focus="effect-0-disabled"]')?.click();
        expect(disabled(0)).toBe(false);
        // Removing the first toggle makes the second one the new second behaviour, still disabling the first.
        root.querySelector<HTMLButtonElement>('button[data-zc-focus="effect-1-remove"]')?.click();
        expect(legends(root)).toEqual(['1. Adjust Darkness Level', '2. Toggle Behavior']);
        expect(select(root, 'effect-1-target-0').value).toBe('disable');
    });

    it('renders every story', () => {
        for (const story of [stories.OrdinaryGround, stories.DarkMireRoom, stories.TrappedCorridor, stories.LightsOutRoom]) {
            expect(mount(story).querySelector('#zc-effect-kind')).not.toBeNull();
        }
    });
});
