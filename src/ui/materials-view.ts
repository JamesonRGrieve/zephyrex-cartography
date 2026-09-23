// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The room materials panel: the floor (a biome or a pack floor material) and
 * the drawn walls (a pack wall material, or none). The choices on offer are
 * whatever the active texture set has. A pure function from the room's
 * materials and the choices to elements; unit-tested under happy-dom.
 */
import type { RoomMaterials } from '../tools/room';
import { el, focusKey, replacePreservingFocus } from './dom';

export interface MaterialChoice {
    readonly role: string;
    readonly label: string;
}

export interface MaterialsPanel {
    readonly current: RoomMaterials;
    readonly floors: readonly MaterialChoice[];
    readonly walls: readonly MaterialChoice[];
}

export interface MaterialsLabels {
    readonly floor: string;
    readonly wall: string;
    /** The "walls not drawn" choice. */
    readonly noWall: string;
}

/** Select value standing for "walls not drawn" (no real role is empty). */
const NO_WALL = '';

function select(id: string, label: string, choices: readonly MaterialChoice[], value: string, onChange: (role: string) => void): HTMLElement {
    const wrap = el('div', 'tw-flex tw-items-center tw-gap-2');
    const labelEl = el('label', 'tw-text-xs', label);
    labelEl.htmlFor = id;
    const control = el('select', 'tw-text-xs');
    control.id = id;
    focusKey(control, id);
    for (const choice of choices) {
        const option = el('option', '', choice.label);
        option.value = choice.role;
        control.append(option);
    }
    control.value = value;
    control.addEventListener('change', () => {
        onChange(control.value);
    });
    wrap.append(labelEl, control);
    return wrap;
}

export function renderMaterialsPanel(root: HTMLElement, panel: MaterialsPanel, labels: MaterialsLabels, onChange: (materials: RoomMaterials) => void): void {
    const { current } = panel;
    // Keep a material the active set lacks selectable, so opening the panel never silently changes it.
    const floors = panel.floors.some((f) => f.role === current.floor) ? panel.floors : [...panel.floors, { role: current.floor, label: current.floor }];
    const walls = [{ role: NO_WALL, label: labels.noWall }, ...panel.walls];
    const wallChoices = current.wall === null || walls.some((w) => w.role === current.wall) ? walls : [...walls, { role: current.wall, label: current.wall }];
    replacePreservingFocus(root, [
        select('zc-room-floor', labels.floor, floors, current.floor, (floor) => {
            onChange({ ...current, floor });
        }),
        select('zc-room-wall', labels.wall, wallChoices, current.wall ?? NO_WALL, (wall) => {
            onChange({ ...current, wall: wall === NO_WALL ? null : wall });
        }),
    ]);
}
