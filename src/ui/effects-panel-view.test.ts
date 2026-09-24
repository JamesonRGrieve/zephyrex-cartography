// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import * as stories from './effects-panel-view.stories';

function mount(story: { readonly args?: Partial<stories.EffectsPanelArgs> }): HTMLElement {
    const el = stories.mountEffectsPanel({ settings: story.args?.settings ?? stories.default.args?.settings ?? { movementCost: 1, effects: [] } });
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

function legends(root: HTMLElement): string[] {
    return [...root.querySelectorAll('fieldset > legend.tw-font-bold')].map((legend) => legend.textContent);
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
        expect(legends(root)).toEqual(['Pause Game']);
        expect(root.querySelector<HTMLInputElement>('input[data-zc-focus="effect-0-once"]')?.checked).toBe(false);
        root.querySelector<HTMLButtonElement>('button[aria-label="Remove: Pause Game"]')?.click();
        expect(root.textContent).toContain('No effects.');
    });

    it('edits darkness, reverting a modifier outside 0 to 1', () => {
        const root = mount(stories.DarkMireRoom);
        expect(legends(root)).toEqual(['Adjust Darkness Level', 'Suppress Weather']);
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
        expect(legends(root)).toEqual(['Display Scrolling Text', 'Pause Game', 'Execute Macro', 'Execute Script', 'Apply Active Effect']);
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

    it('renders every story', () => {
        for (const story of [stories.OrdinaryGround, stories.DarkMireRoom, stories.TrappedCorridor]) {
            expect(mount(story).querySelector('#zc-effect-kind')).not.toBeNull();
        }
    });
});
