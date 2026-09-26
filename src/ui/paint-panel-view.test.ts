// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import * as stories from './paint-panel-view.stories';

function mount(story: { readonly args?: Partial<stories.PaintArgs> }): HTMLElement {
    const base = stories.default.args;
    const el = stories.mountPaintPanel({
        choices: story.args?.choices ?? base?.choices ?? [],
        biome: story.args?.biome ?? base?.biome ?? 'grassland',
        textures: story.args?.textures ?? base?.textures ?? [],
        texture: story.args?.texture ?? base?.texture ?? null,
        sets: story.args?.sets ?? base?.sets ?? [],
        set: story.args?.set ?? base?.set ?? '',
        radius: story.args?.radius ?? base?.radius ?? 25,
        movementCost: story.args?.movementCost ?? base?.movementCost ?? 1,
        mode: story.args?.mode ?? base?.mode ?? 'shapes',
        strength: story.args?.strength ?? base?.strength ?? 0.3,
        splat: story.args?.splat ?? base?.splat ?? 'none',
        backgroundBakeable: story.args?.backgroundBakeable ?? base?.backgroundBakeable ?? true,
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

    it('offers every ground as a labelled swatch group, the chosen one pressed', () => {
        const root = mount(stories.Grassland);
        expect(root.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Ground');
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

    it('draws the ground in its own texture or any of the set’s, named in the section title', () => {
        const root = mount(stories.Grassland);
        const summary = (): string | null | undefined => root.querySelector('summary')?.textContent;
        expect(summary()).toBe("Texture: The ground's own");
        expect(swatch(root, "The ground's own").getAttribute('aria-pressed')).toBe('true');
        // The ground's own shows as its biome's swatch does.
        expect(swatch(root, "The ground's own").querySelector('span')?.style.backgroundImage).toBe(
            swatch(root, 'Grassland').querySelector('span')?.style.backgroundImage,
        );
        swatch(root, 'Cobbled street').click();
        expect(summary()).toBe('Texture: Cobbled street');
        expect(swatch(root, 'Cobbled street').getAttribute('aria-pressed')).toBe('true');
        expect(swatch(root, "The ground's own").getAttribute('aria-pressed')).toBe('false');
        swatch(root, "The ground's own").click();
        expect(summary()).toBe("Texture: The ground's own");
        expect(mount(stories.CobbledGround).querySelector('summary')?.textContent).toBe('Texture: Cobbled street');
    });

    it('chooses among the packs’ texture sets, offering the choice only when there is one to make', () => {
        const root = mount(stories.Grassland);
        const set = (): HTMLSelectElement | null => root.querySelector<HTMLSelectElement>('#zc-paint-set');
        expect([...(set()?.options ?? [])].map((o) => o.textContent)).toEqual(['Painted (hand-painted style)', 'Poly Haven (CC0)']);
        const picker = set();
        if (picker) {
            picker.value = 'assets:polyhaven';
            picker.dispatchEvent(new Event('change'));
        }
        expect(set()?.value).toBe('assets:polyhaven');
        expect(mount(stories.NoTextureSet).querySelector('#zc-paint-set')).toBeNull();
    });

    it('shows the ground’s own texture as a plain tile when its ground is not among the choices', () => {
        const root = mount({ args: { choices: [] } });
        expect(swatch(root, "The ground's own").querySelector('span')?.style.backgroundColor).toBe('transparent');
    });

    it('picks a ground and sets the brush size, reverting a size it refuses', () => {
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

    it('switches between laying ground and blending texture, blending with a strength in place of a cost', () => {
        const root = mount(stories.Grassland);
        const mode = root.querySelector<HTMLSelectElement>('#zc-paint-mode');
        expect([...(mode?.options ?? [])].map((o) => o.textContent)).toEqual(['Paint ground', 'Blend', 'Unblend']);
        const labels = (): (string | null)[] => [...root.querySelectorAll('label')].map((label) => label.textContent);
        expect(labels()).toContain('Movement cost (×)');
        if (mode) {
            mode.value = 'blend';
            mode.dispatchEvent(new Event('change'));
        }
        expect(root.querySelector<HTMLSelectElement>('#zc-paint-mode')?.value).toBe('blend');
        expect(labels()).toContain('Strength (0.05–1)');
        expect(labels()).not.toContain('Movement cost (×)');
        const strength = [...root.querySelectorAll<HTMLInputElement>('input[type="number"]')].at(-1);
        if (strength) {
            strength.value = '2';
            strength.dispatchEvent(new Event('change'));
        }
        expect([...root.querySelectorAll<HTMLInputElement>('input[type="number"]')].at(-1)?.value).toBe('0.3');
    });

    it('offers to bake the blend into a tile or its level’s background while blending, and to take a baked one back', () => {
        const button = (root: HTMLElement, key: string): HTMLButtonElement | null => root.querySelector<HTMLButtonElement>(`button[data-zc-focus="${key}"]`);
        expect(button(mount(stories.Grassland), 'paint-bake-tile')).toBeNull();
        const blending = mount(stories.BlendingSand);
        expect(button(blending, 'paint-bake-tile')?.textContent).toBe('Bake into a tile');
        expect(button(blending, 'paint-bake-background')?.disabled).toBe(false);
        button(blending, 'paint-bake-background')?.click();
        expect(button(blending, 'paint-unbake')?.textContent).toBe('Unbake to edit');
        expect(button(blending, 'paint-bake-tile')).toBeNull();
        button(blending, 'paint-unbake')?.click();
        expect(button(blending, 'paint-bake-tile')).not.toBeNull();
        expect(button(mount(stories.BakedBlend), 'paint-unbake')).not.toBeNull();
        // Nothing to bake before there is a blend; no one background for a blend on every level.
        expect(button(mount({ args: { mode: 'blend', splat: 'none' } }), 'paint-bake-tile')?.disabled).toBe(true);
        const everywhere = mount(stories.BlendOnEveryLevel);
        expect([button(everywhere, 'paint-bake-tile')?.disabled, button(everywhere, 'paint-bake-background')?.disabled]).toEqual([false, true]);
    });

    it('renders every story', () => {
        // Six grounds, the ground's own texture and the set's five.
        for (const story of [stories.Grassland, stories.WaterWithAWideBrush, stories.DifficultMarsh, stories.CobbledGround]) {
            expect(mount(story).querySelectorAll('button')).toHaveLength(12);
        }
        expect(mount(stories.NoTextureSet).querySelectorAll('button')).toHaveLength(7);
        expect(mount(stories.BakedBlend).querySelectorAll('button')).toHaveLength(13);
        for (const story of [stories.BlendingSand, stories.BlendOnEveryLevel]) {
            expect(mount(story).querySelectorAll('button')).toHaveLength(14);
        }
    });
});
