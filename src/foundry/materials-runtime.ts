// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The room materials window: opened by clicking a room with the materials
 * tool, it sets the room's floor and walls from what the active texture set
 * offers. The last choice becomes the default for new rooms.
 */
import type { CartographyController } from '../canvas/controller';
import { BIOME_TITLE_KEYS, I18N } from '../i18n';
import { isBiomeKind } from '../tools/biome';
import { floorMaterials, materialName, wallMaterials } from '../tools/materials';
import { DEFAULT_FLOOR, type RoomMaterials } from '../tools/room';
import { renderMaterialsPanel } from '../ui/materials-view';
import { localize } from './localize';
import { createViewWindow } from './view-window';

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 180;

/** A material's display label: a biome's localised name, or a pack material's name. */
function label(role: string): string {
    return isBiomeKind(role) ? localize(BIOME_TITLE_KEYS[role]) : materialName(role);
}

export interface MaterialsRuntime {
    /** Open the panel for a room. */
    readonly edit: (roomId: string) => void;
    /** The materials a newly drawn room gets: the last ones chosen. */
    readonly forNewRooms: () => RoomMaterials;
}

export function registerMaterialsRuntime(controller: () => CartographyController | null, textureRoles: () => string[]): MaterialsRuntime {
    let roomId: string | null = null;
    let last: RoomMaterials = { floor: DEFAULT_FLOOR, wall: null };

    const panel = createViewWindow({
        id: 'materials',
        title: () => localize(I18N.materials.title),
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        render: (root) => {
            const active = controller();
            const id = roomId;
            const current = id !== null && active ? active.roomMaterials(id) : null;
            if (!active || id === null || !current) {
                root.replaceChildren();
                return;
            }
            const roles = textureRoles();
            const choices = (list: readonly string[]): { role: string; label: string }[] => list.map((role) => ({ role, label: label(role) }));
            renderMaterialsPanel(
                root,
                { current, floors: choices(floorMaterials(roles)), walls: choices(wallMaterials(roles)) },
                { floor: localize(I18N.materials.floor), wall: localize(I18N.materials.wall), noWall: localize(I18N.materials.noWall) },
                (materials) => {
                    last = materials;
                    void (async (): Promise<void> => {
                        await active.setRoomMaterials(id, materials);
                        panel.refresh();
                    })();
                },
            );
        },
    });

    return {
        edit: (id) => {
            roomId = id;
            panel.open();
            panel.refresh();
        },
        forNewRooms: () => last,
    };
}
