// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { NEW_DOOR } from '../tools/room';
import * as stories from './door-panel-view.stories';

function mount(args: Partial<stories.DoorPanelArgs> = {}): HTMLElement {
    const el = stories.mountDoorPanel({ door: NEW_DOOR, onRemove: () => undefined, ...args });
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

describe('door panel', () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it('shows the door type and state as labelled choices', () => {
        const root = mount({ door: { ...NEW_DOOR, type: 'secret', state: 'locked' } });
        expect(select(root, 'zc-door-type').value).toBe('secret');
        expect(select(root, 'zc-door-state').value).toBe('locked');
        expect(root.querySelector('label[for="zc-door-type"]')?.textContent).toBe('Door type');
    });

    it('changes type and state, keeping focus on the control', () => {
        const root = mount();
        const state = select(root, 'zc-door-state');
        state.focus();
        state.value = 'open';
        state.dispatchEvent(new Event('change'));
        expect(select(root, 'zc-door-state').value).toBe('open');
        expect(document.activeElement).toBe(select(root, 'zc-door-state'));
        const type = select(root, 'zc-door-type');
        type.value = 'secret';
        type.dispatchEvent(new Event('change'));
        expect(select(root, 'zc-door-type').value).toBe('secret');
        expect(select(root, 'zc-door-state').value).toBe('open');
    });

    it('picks a Foundry door sound and animation, and puts either back to Foundry’s default', () => {
        const root = mount();
        expect([select(root, 'zc-door-sound').value, select(root, 'zc-door-animation').value]).toEqual(['', '']);
        expect([...select(root, 'zc-door-sound').options].map((o) => o.textContent)).toEqual(expect.arrayContaining(['Foundry default', 'Wood (Creaky)']));
        const sound = select(root, 'zc-door-sound');
        sound.value = 'woodCreaky';
        sound.dispatchEvent(new Event('change'));
        const animation = select(root, 'zc-door-animation');
        animation.value = 'swivel';
        animation.dispatchEvent(new Event('change'));
        expect([select(root, 'zc-door-sound').value, select(root, 'zc-door-animation').value]).toEqual(['woodCreaky', 'swivel']);
        const reset = select(root, 'zc-door-animation');
        reset.value = '';
        reset.dispatchEvent(new Event('change'));
        expect(select(root, 'zc-door-animation').value).toBe('');
        expect(select(root, 'zc-door-sound').value).toBe('woodCreaky');
    });

    it('removes the door', () => {
        let removed = 0;
        const root = mount({
            onRemove: () => {
                removed += 1;
            },
        });
        root.querySelector('button')?.click();
        expect(removed).toBe(1);
    });

    it('renders every story', () => {
        for (const story of [stories.ClosedDoor, stories.LockedSecretDoor, stories.SlidingMetalDoor]) {
            expect(mount(story.args ?? {}).querySelector('select')).not.toBeNull();
        }
    });
});
