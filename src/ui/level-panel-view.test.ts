// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { NO_LEVEL_ART } from '../tools/levels';
import * as stories from './level-panel-view.stories';

const base: stories.LevelPanelArgs = {
    levels: [
        { id: 'ground', name: 'Ground floor', bottom: 0, top: 10, art: { ...NO_LEVEL_ART, background: 'maps/ground.webp' } },
        { id: 'upper', name: 'Upper floor', bottom: 10, top: 20, art: NO_LEVEL_ART },
    ],
    active: 'ground',
    counts: { ground: 3 },
};

function mount(args: Partial<stories.LevelPanelArgs> = {}): HTMLElement {
    const el = stories.mountLevelPanel({ ...base, ...args });
    document.body.replaceChildren(el);
    return el;
}

function buttonNamed(root: HTMLElement, label: string): HTMLButtonElement {
    const found = [...root.querySelectorAll('button')].find((b) => b.textContent === label);
    if (!found) {
        throw new Error(`no button ${label}`);
    }
    return found;
}

function input(root: HTMLElement, labelText: string, index = 0): HTMLInputElement {
    const labels = [...root.querySelectorAll('label')].filter((l) => l.textContent.startsWith(labelText));
    const found = labels[index]?.querySelector('input');
    if (!found) {
        throw new Error(`no input ${labelText}`);
    }
    return found;
}

function change(target: HTMLInputElement, value: string): void {
    target.value = value;
    target.dispatchEvent(new Event('change'));
}

describe('level panel', () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it('lists floors top to bottom with the active one pressed and counts shown', () => {
        const root = mount();
        const names = [...root.querySelectorAll('li > button[aria-pressed]')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]);
        expect(names).toEqual([
            ['Upper floor', 'false'],
            ['Ground floor', 'true'],
        ]);
        expect(root.textContent).toContain('3 features');
        expect(buttonNamed(root, 'All levels').getAttribute('aria-pressed')).toBe('false');
    });

    it('only lets an empty level be removed', () => {
        const root = mount();
        const removes = [...root.querySelectorAll('button')].filter((b) => b.textContent === 'Remove level');
        expect(removes.map((b) => b.disabled)).toEqual([false, true]);
        removes[0]?.click();
        expect(root.textContent).not.toContain('Upper floor');
    });

    it('selects, adds, renames and re-bands levels', () => {
        const root = mount();
        buttonNamed(root, 'All levels').click();
        expect(buttonNamed(root, 'All levels').getAttribute('aria-pressed')).toBe('true');
        buttonNamed(root, 'Add level above').click();
        expect(buttonNamed(root, 'Level 3').getAttribute('aria-pressed')).toBe('true');
        change(input(root, 'Level name', 0), 'Roof');
        expect(root.textContent).toContain('Roof');
        change(input(root, 'Ceiling elevation', 0), '45');
        expect(input(root, 'Ceiling elevation', 0).value).toBe('45');
    });

    it('reverts an inverted or empty band, and a blank name', () => {
        const root = mount();
        change(input(root, 'Floor elevation', 1), '50');
        expect(input(root, 'Floor elevation', 1).value).toBe('0');
        change(input(root, 'Ceiling elevation', 1), '');
        expect(input(root, 'Ceiling elevation', 1).value).toBe('10');
        change(input(root, 'Level name', 1), '   ');
        expect(input(root, 'Level name', 1).value).toBe('Ground floor');
    });

    it('shows each level’s images, sets a typed path, clears a blanked one, and browses for another', () => {
        const root = mount();
        // Rows read top to bottom: Upper, then Ground.
        expect(input(root, 'Background image', 1).value).toBe('maps/ground.webp');
        change(input(root, 'Foreground image', 1), '  maps/roof.webp ');
        expect(input(root, 'Foreground image', 1).value).toBe('maps/roof.webp');
        change(input(root, 'Background image', 1), ' ');
        expect(input(root, 'Background image', 1).value).toBe('');
        const browseFog = [...root.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Browse for Fog image');
        browseFog?.click();
        expect(input(root, 'Fog image', 0).value).toBe('maps/levels/picked.webp');
    });

    it('keeps each level’s look closed until opened, and open across edits', () => {
        const root = mount();
        const look = (): HTMLDetailsElement | null => root.querySelector<HTMLDetailsElement>('details[data-zc-focus="look:ground"]');
        expect(look()?.open).toBe(false);
        expect(look()?.querySelector('summary')?.textContent).toBe('Look');
        const opened = look();
        if (opened) {
            opened.open = true;
        }
        change(input(root, 'Background tint', 1), '#AABBCC');
        expect(look()?.open).toBe(true);
        expect(input(root, 'Background tint', 1).value).toBe('#aabbcc');
    });

    it('sets colours, thresholds, fit and placement, reverting what is not valid', () => {
        const root = mount();
        change(input(root, 'Background colour', 1), '#101010');
        expect(input(root, 'Background colour', 1).value).toBe('#101010');
        change(input(root, 'Foreground alpha threshold', 1), '0.2');
        expect(input(root, 'Foreground alpha threshold', 1).value).toBe('0.2');
        change(input(root, 'Foreground alpha threshold', 1), '1.5');
        expect(input(root, 'Foreground alpha threshold', 1).value).toBe('0.2');
        change(input(root, 'Offset X (px)', 1), '12');
        expect(input(root, 'Offset X (px)', 1).value).toBe('12');
        change(input(root, 'Offset X (px)', 1), '12.5');
        expect(input(root, 'Offset X (px)', 1).value).toBe('12');
        change(input(root, 'Scale Y', 1), '0');
        expect(input(root, 'Scale Y', 1).value).toBe('1');
        const fit = root.querySelector<HTMLSelectElement>('#fit\\:ground');
        if (fit) {
            fit.value = 'cover';
            fit.dispatchEvent(new Event('change'));
        }
        expect(root.querySelector<HTMLSelectElement>('#fit\\:ground')?.value).toBe('cover');
    });

    it('offers the other levels as the ones seen from this one', () => {
        const root = mount();
        // The ground floor's look lists only the upper floor, unchecked.
        const seen = (): HTMLInputElement | null => root.querySelector<HTMLInputElement>('input[data-zc-focus="visible-upper:ground"]');
        expect(root.querySelector('input[data-zc-focus="visible-ground:ground"]')).toBeNull();
        expect(seen()?.checked).toBe(false);
        seen()?.click();
        expect(seen()?.checked).toBe(true);
        seen()?.click();
        expect(seen()?.checked).toBe(false);
    });

    it('explains an empty scene and still offers to add a level', () => {
        const root = mount({ levels: [], active: null, counts: {} });
        expect(root.textContent).toContain('no levels yet');
        buttonNamed(root, 'Add level below').click();
        expect(buttonNamed(root, 'Level 1').getAttribute('aria-pressed')).toBe('true');
    });

    it('renders every story', () => {
        for (const story of [stories.ThreeFloors, stories.EditingAllLevels, stories.GroundFloorLook, stories.NoLevelsYet]) {
            expect(mount(story.args ?? {}).querySelector('button')).not.toBeNull();
        }
        expect(mount(stories.GroundFloorLook.args).querySelector<HTMLDetailsElement>('details[open]')?.getAttribute('data-zc-focus')).toBe('look:ground');
    });
});
