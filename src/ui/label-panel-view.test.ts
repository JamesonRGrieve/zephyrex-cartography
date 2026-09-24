// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { NEW_LABEL } from '../tools/label';
import * as stories from './label-panel-view.stories';

function mount(story: { readonly args?: Partial<stories.LabelPanelArgs> }): HTMLElement {
    const base = stories.default.args;
    const el = stories.mountLabelPanel({ settings: story.args?.settings ?? base?.settings ?? NEW_LABEL, fonts: story.args?.fonts ?? base?.fonts ?? [] });
    document.body.replaceChildren(el);
    return el;
}

function field(root: HTMLElement, key: string): HTMLInputElement | HTMLTextAreaElement {
    const found = root.querySelector(`[data-zc-focus="${key}"]`);
    if (!(found instanceof HTMLInputElement || found instanceof HTMLTextAreaElement)) {
        throw new Error(`no field ${key}`);
    }
    return found;
}

function change(target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
    target.value = value;
    target.dispatchEvent(new Event('change'));
}

function font(root: HTMLElement): HTMLSelectElement {
    const found = root.querySelector<HTMLSelectElement>('#zc-label-font');
    if (!found) {
        throw new Error('no font select');
    }
    return found;
}

describe('map label panel', () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it('starts as Foundry makes a text drawing, and offers Foundry’s fonts', () => {
        const root = mount(stories.NewLabel);
        expect(field(root, 'label-font-size').value).toBe('48');
        expect(field(root, 'label-colour').value).toBe('#ffffff');
        expect([...font(root).options].map((o) => o.textContent)).toEqual(["Foundry's default", 'Signika', 'Modesto Condensed', 'Amiri', 'Bruno Ace']);
    });

    it('sets the text, a font size Foundry takes, the colour, font and rotation, reverting what it does not take', () => {
        const root = mount(stories.NewLabel);
        change(field(root, 'label-text'), 'The Sump');
        expect(field(root, 'label-text').value).toBe('The Sump');
        change(field(root, 'label-font-size'), '72');
        expect(field(root, 'label-font-size').value).toBe('72');
        change(field(root, 'label-font-size'), '4');
        expect(field(root, 'label-font-size').value).toBe('72');
        change(field(root, 'label-font-size'), '12.5');
        expect(field(root, 'label-font-size').value).toBe('72');
        change(field(root, 'label-colour'), '#A0B0C0');
        expect(field(root, 'label-colour').value).toBe('#a0b0c0');
        change(font(root), 'Amiri');
        expect(font(root).value).toBe('Amiri');
        change(field(root, 'label-rotation'), '-30');
        expect(field(root, 'label-rotation').value).toBe('-30');
        change(field(root, 'label-rotation'), 'x');
        expect(field(root, 'label-rotation').value).toBe('-30');
    });

    it('keeps a font Foundry no longer knows selectable, and hides the label from players', () => {
        const root = mount(stories.SecretFontGone);
        expect(font(root).value).toBe('Gothic Old');
        const hidden = field(root, 'label-hidden');
        expect(hidden instanceof HTMLInputElement && hidden.checked).toBe(true);
        if (hidden instanceof HTMLInputElement) {
            hidden.click();
        }
        const after = field(root, 'label-hidden');
        expect(after instanceof HTMLInputElement && after.checked).toBe(false);
    });

    it('renders every story', () => {
        for (const story of [stories.NewLabel, stories.DistrictName, stories.SecretFontGone]) {
            expect(mount(story).querySelector('#zc-label-font')).not.toBeNull();
        }
    });
});
