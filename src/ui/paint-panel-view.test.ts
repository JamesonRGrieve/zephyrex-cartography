// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import * as stories from './paint-panel-view.stories';

function mount(story: { readonly args?: Partial<stories.PaintArgs> }): HTMLElement {
    const base = stories.default.args;
    const el = stories.mountPaintPanel({
        choices: story.args?.choices ?? base?.choices ?? [],
        biome: story.args?.biome ?? base?.biome ?? 'grassland',
        radius: story.args?.radius ?? base?.radius ?? 25,
        movementCost: story.args?.movementCost ?? base?.movementCost ?? 1,
    });
    document.body.replaceChildren(el);
    return el;
}

function swatch(root: HTMLElement, label: string): HTMLButtonElement {
    const found = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label);
    if (!found) {
        throw new Error(`no swatch ${label}`);
    }
    return found;
}

function size(root: HTMLElement): HTMLInputElement {
    const found = root.querySelector<HTMLInputElement>('input[type="number"]');
    if (!found) {
        throw new Error('no size input');
    }
    return found;
}

describe('paint panel', () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it('offers every texture as a labelled swatch group, the chosen one pressed', () => {
        const root = mount(stories.Grassland);
        expect(root.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Texture');
        expect(swatch(root, 'Grassland').getAttribute('aria-pressed')).toBe('true');
        expect(swatch(root, 'Water').getAttribute('aria-pressed')).toBe('false');
        expect(size(root).value).toBe('25');
        expect(size(root).closest('label')?.textContent).toBe('Brush size (px)');
    });

    it('shows a texture’s image, or its flat colour where the set has none', () => {
        const root = mount(stories.Grassland);
        const chip = (label: string): HTMLElement | null => swatch(root, label).querySelector('span');
        expect(chip('Grassland')?.style.backgroundImage).toContain('data:image/svg+xml');
        expect(chip('Water')?.style.backgroundImage).toBe('');
        expect(chip('Water')?.style.backgroundColor).not.toBe('');
    });

    it('picks a texture and sets the brush size, reverting a size it refuses', () => {
        const root = mount(stories.Grassland);
        swatch(root, 'Lava').click();
        expect(swatch(root, 'Lava').getAttribute('aria-pressed')).toBe('true');
        size(root).value = '60';
        size(root).dispatchEvent(new Event('change'));
        expect(size(root).value).toBe('60');
        size(root).value = '0';
        size(root).dispatchEvent(new Event('change'));
        expect(size(root).value).toBe('60');
    });

    it('sets what crossing the painted ground costs, refusing a cost Foundry does not take', () => {
        const root = mount(stories.DifficultMarsh);
        const cost = (): HTMLInputElement => root.querySelectorAll<HTMLInputElement>('input[type="number"]')[1] ?? size(root);
        expect(cost().value).toBe('2');
        expect(cost().closest('label')?.textContent).toBe('Movement cost (×)');
        cost().value = '3';
        cost().dispatchEvent(new Event('change'));
        expect(cost().value).toBe('3');
        cost().value = '9';
        cost().dispatchEvent(new Event('change'));
        expect(cost().value).toBe('3');
    });

    it('renders every story', () => {
        for (const story of [stories.Grassland, stories.WaterWithAWideBrush, stories.DifficultMarsh, stories.NoTextureSet]) {
            expect(mount(story).querySelectorAll('button')).toHaveLength(6);
        }
    });
});
