// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import * as stories from './materials-view.stories';

function mount(story: { readonly args?: Partial<stories.MaterialsArgs> }): HTMLElement {
    const base = stories.default.args;
    const el = stories.mountMaterialsPanel({
        current: story.args?.current ?? base?.current ?? { floor: 'dirt', wall: null, wallKind: 'solid', ceiling: true },
        floors: story.args?.floors ?? base?.floors ?? [],
        walls: story.args?.walls ?? base?.walls ?? [],
    });
    document.body.replaceChildren(el);
    return el;
}

function control(root: HTMLElement, id: string): HTMLSelectElement {
    const found = root.querySelector<HTMLSelectElement>(`#${id}`);
    if (!found) {
        throw new Error(`no select ${id}`);
    }
    return found;
}

function choose(root: HTMLElement, id: string, value: string): void {
    const select = control(root, id);
    select.value = value;
    select.dispatchEvent(new Event('change'));
}

describe('materials panel', () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it('shows the floor and walls as labelled choices, walls not drawn by default', () => {
        const root = mount(stories.DirtFloorNoWalls);
        expect(control(root, 'zc-room-floor').value).toBe('dirt');
        expect(control(root, 'zc-room-wall').value).toBe('');
        expect([...control(root, 'zc-room-wall').options].map((o) => o.textContent)).toEqual(['Not drawn', 'brick']);
        expect(root.querySelector('label[for="zc-room-floor"]')?.textContent).toBe('Floor');
    });

    it('changes the floor and walls, and can stop drawing walls', () => {
        const root = mount(stories.DirtFloorNoWalls);
        choose(root, 'zc-room-floor', 'floor.oak');
        choose(root, 'zc-room-wall', 'wall.brick');
        expect(control(root, 'zc-room-floor').value).toBe('floor.oak');
        expect(control(root, 'zc-room-wall').value).toBe('wall.brick');
        choose(root, 'zc-room-wall', '');
        expect(control(root, 'zc-room-wall').value).toBe('');
    });

    it('keeps materials the active set lacks selectable instead of silently changing them', () => {
        const root = mount(stories.MaterialsMissingFromTheSet);
        expect(control(root, 'zc-room-floor').value).toBe('floor.marble');
        expect(control(root, 'zc-room-wall').value).toBe('wall.granite');
    });

    it('offers Foundry’s wall kinds, showing the room’s and changing it', () => {
        const root = mount(stories.GlassWalledRoom);
        expect(control(root, 'zc-room-wall-kind').value).toBe('window');
        expect([...control(root, 'zc-room-wall-kind').options].map((o) => o.textContent)).toEqual([
            'Solid Wall',
            'Terrain Wall',
            'Invisible Wall',
            'Ethereal Wall',
            'Window',
        ]);
        choose(root, 'zc-room-wall-kind', 'terrain');
        expect(control(root, 'zc-room-wall-kind').value).toBe('terrain');
    });

    it('shows whether the room has a ceiling, and opens it to the sky', () => {
        const root = mount(stories.DirtFloorNoWalls);
        const ceiling = (): HTMLInputElement | null => root.querySelector<HTMLInputElement>('input[type="checkbox"]');
        expect(ceiling()?.closest('label')?.textContent).toBe('Ceiling (when a level is above)');
        expect(ceiling()?.checked).toBe(true);
        ceiling()?.click();
        expect(ceiling()?.checked).toBe(false);
        expect(mount(stories.OpenCourtyard).querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
    });

    it('renders every story', () => {
        for (const story of [
            stories.DirtFloorNoWalls,
            stories.OakWithBrickWalls,
            stories.GlassWalledRoom,
            stories.OpenCourtyard,
            stories.MaterialsMissingFromTheSet,
        ]) {
            expect(mount(story).querySelectorAll('select')).toHaveLength(3);
        }
    });
});
