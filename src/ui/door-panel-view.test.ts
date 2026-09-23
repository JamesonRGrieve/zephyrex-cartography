// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import * as stories from './door-panel-view.stories';

function mount(args: Partial<stories.DoorPanelArgs> = {}): HTMLElement {
    const el = stories.mountDoorPanel({ door: { type: 'door', state: 'closed' }, onRemove: () => undefined, ...args });
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
        const root = mount({ door: { type: 'secret', state: 'locked' } });
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
        for (const story of [stories.ClosedDoor, stories.LockedSecretDoor]) {
            expect(mount(story.args ?? {}).querySelector('select')).not.toBeNull();
        }
    });
});
