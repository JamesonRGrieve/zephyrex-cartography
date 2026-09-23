// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The door panel for a room door: its Foundry door type (door or secret) and
 * state (closed, open, locked), or removing it. A pure function from the
 * door's settings to elements; unit-tested under happy-dom.
 */
import type { DoorState } from '../tools/documents';
import type { DoorSettings, RoomDoorType } from '../tools/room';
import { button, el, focusKey, replacePreservingFocus } from './dom';

export interface DoorPanelLabels {
    readonly type: string;
    readonly state: string;
    readonly types: Readonly<Record<RoomDoorType, string>>;
    readonly states: Readonly<Record<DoorState, string>>;
    readonly remove: string;
}

export interface DoorPanelHandlers {
    readonly set: (settings: DoorSettings) => void;
    readonly remove: () => void;
}

const TYPES: readonly RoomDoorType[] = ['door', 'secret'];
const STATES: readonly DoorState[] = ['closed', 'open', 'locked'];

function choice<T extends string>(
    id: string,
    label: string,
    options: readonly T[],
    names: Readonly<Record<T, string>>,
    value: T,
    onChange: (v: T) => void,
): HTMLElement {
    const wrap = el('div', 'tw-flex tw-items-center tw-gap-2');
    const labelEl = el('label', 'tw-text-xs', label);
    labelEl.htmlFor = id;
    const select = el('select', 'tw-text-xs');
    select.id = id;
    focusKey(select, id);
    for (const option of options) {
        const node = el('option', '', names[option]);
        node.value = option;
        select.append(node);
    }
    select.value = value;
    select.addEventListener('change', () => {
        const picked = options.find((o) => o === select.value);
        if (picked !== undefined) {
            onChange(picked);
        }
    });
    wrap.append(labelEl, select);
    return wrap;
}

export function renderDoorPanel(root: HTMLElement, door: DoorSettings, labels: DoorPanelLabels, handlers: DoorPanelHandlers): void {
    replacePreservingFocus(root, [
        choice('zc-door-type', labels.type, TYPES, labels.types, door.type, (type) => {
            handlers.set({ ...door, type });
        }),
        choice('zc-door-state', labels.state, STATES, labels.states, door.state, (state) => {
            handlers.set({ ...door, state });
        }),
        button('tw-text-xs', labels.remove, 'remove', handlers.remove),
    ]);
}
