// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { NEW_ZONE } from '../tools/zone';
import * as stories from './zone-panel-view.stories';

function mount(story: { readonly args?: Partial<stories.ZonePanelArgs> }): HTMLElement {
    const base = stories.default.args;
    const el = stories.mountZonePanel({ settings: story.args?.settings ?? base?.settings ?? NEW_ZONE, tokens: story.args?.tokens ?? base?.tokens ?? [] });
    document.body.replaceChildren(el);
    return el;
}

function select(root: HTMLElement, id: string): HTMLSelectElement {
    const found = root.querySelector<HTMLSelectElement>(`#${id}`);
    if (!found) {
        throw new Error(`no select ${id}`);
    }
    return found;
}

function input(root: HTMLElement, key: string): HTMLInputElement {
    const found = root.querySelector<HTMLInputElement>(`input[data-zc-focus="${key}"]`);
    if (!found) {
        throw new Error(`no input ${key}`);
    }
    return found;
}

function change(target: HTMLInputElement | HTMLSelectElement, value: string): void {
    target.value = value;
    target.dispatchEvent(new Event('change'));
}

/** The labels of the size fields shown, in order. */
function sizeLabels(root: HTMLElement): string[] {
    return [...root.querySelectorAll('input[type="number"]')]
        .filter((i) => i.getAttribute('data-zc-focus') !== 'zone-rotation')
        .map((i) => i.closest('label')?.textContent ?? '');
}

describe('zone panel', () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it('starts as a circle, on no token, and offers the scene’s tokens', () => {
        const root = mount(stories.NewZone);
        expect(select(root, 'zc-zone-shape').value).toBe('circle');
        expect(sizeLabels(root)).toEqual(['Radius']);
        expect(select(root, 'zc-zone-token').value).toBe('');
        expect([...select(root, 'zc-zone-token').options].map((o) => o.text)).toEqual(['None', 'Sister Ibnad', 'Gun-servitor']);
    });

    it('shows each shape’s own sizes, in Foundry’s names, keeping about the same size', () => {
        const root = mount(stories.NewZone);
        change(select(root, 'zc-zone-shape'), 'rectangle');
        expect(sizeLabels(root)).toEqual(['X-Size', 'Y-Size']);
        expect(input(root, 'zone-width').value).toBe('300');
        change(select(root, 'zc-zone-shape'), 'ring');
        expect(sizeLabels(root)).toEqual(['Radius', 'Inner Width', 'Outer Width']);
    });

    it('takes a size Foundry takes, and reverts one it would refuse', () => {
        const root = mount(stories.Ring);
        change(input(root, 'zone-radius'), '500');
        expect(input(root, 'zone-radius').value).toBe('500');
        // The ring's band would reach past its centre.
        change(input(root, 'zone-innerWidth'), '600');
        expect(input(root, 'zone-innerWidth').value).toBe('50');
        change(input(root, 'zone-outerWidth'), '-1');
        expect(input(root, 'zone-outerWidth').value).toBe('50');
    });

    it('narrows a cone’s spread to what its curvature allows', () => {
        const root = mount({ args: { settings: { ...NEW_ZONE, shape: { kind: 'cone', radius: 100, angle: 150, curvature: 'round' } } } });
        change(select(root, 'zc-zone-curvature'), 'flat');
        expect(input(root, 'zone-angle').value).toBe('90');
        // A flat cone spreads 90° at most.
        change(input(root, 'zone-angle'), '120');
        expect(input(root, 'zone-angle').value).toBe('90');
    });

    it('names, turns, grids and attaches the zone, keeping a token no longer on the scene selectable', () => {
        const root = mount(stories.FlamerCone);
        expect(select(root, 'zc-zone-token').value).toBe('tokenServitor001');
        change(input(root, 'zone-name'), ' Burn ');
        expect(input(root, 'zone-name').value).toBe('Burn');
        change(input(root, 'zone-rotation'), '90');
        expect(input(root, 'zone-rotation').value).toBe('90');
        input(root, 'zone-grid-based').click();
        expect(input(root, 'zone-grid-based').checked).toBe(false);
        change(select(root, 'zc-zone-token'), '');
        expect(select(root, 'zc-zone-token').value).toBe('');
        const gone = mount({ args: { settings: { ...NEW_ZONE, attachedTo: 'tokenGone0000001' }, tokens: [] } });
        expect(select(gone, 'zc-zone-token').value).toBe('tokenGone0000001');
    });

    it('renders every story', () => {
        for (const story of [stories.NewZone, stories.FlamerCone, stories.Ring]) {
            expect(mount(story).querySelector('#zc-zone-shape')).not.toBeNull();
        }
    });
});
