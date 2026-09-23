// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The room door panel window: opened by clicking an existing door with the
 * door tool, it sets that door's type and state or removes it. The door
 * itself is the controller's.
 */
import type { CartographyController } from '../canvas/controller';
import { I18N } from '../i18n';
import { renderDoorPanel, type DoorPanelLabels } from '../ui/door-panel-view';
import { localize } from './localize';
import { createViewWindow } from './view-window';

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 200;

function labels(): DoorPanelLabels {
    const d = I18N.doors;
    return {
        type: localize(d.type),
        state: localize(d.state),
        types: { door: localize(d.types.door), secret: localize(d.types.secret) },
        states: { closed: localize(d.states.closed), open: localize(d.states.open), locked: localize(d.states.locked) },
        remove: localize(d.remove),
    };
}

export interface DoorRuntime {
    /** Open the panel for the door on a room's perimeter segment. */
    readonly edit: (roomId: string, segment: number) => void;
}

export function registerDoorRuntime(controller: () => CartographyController | null): DoorRuntime {
    let target: { readonly room: string; readonly segment: number } | null = null;

    const panel = createViewWindow({
        id: 'door',
        title: () => localize(I18N.doors.title),
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        render: (root) => {
            const active = controller();
            const door = target && active ? active.roomDoor(target.room, target.segment) : null;
            if (!target || !active || !door) {
                root.replaceChildren();
                return;
            }
            const { room, segment } = target;
            const apply = (settings: Parameters<CartographyController['setRoomDoor']>[2]): void => {
                void (async (): Promise<void> => {
                    await active.setRoomDoor(room, segment, settings);
                    panel.refresh();
                })();
            };
            renderDoorPanel(root, door, labels(), { set: apply, remove: () => apply(null) });
        },
    });

    return {
        edit: (roomId, segment) => {
            target = { room: roomId, segment };
            panel.open();
            panel.refresh();
        },
    };
}
