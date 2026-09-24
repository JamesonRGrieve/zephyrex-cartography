// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The zone window: opened on a zone placed or clicked with the zone tool, in
 * Foundry's Regions controls. It sets the zone's name, shape and sizes,
 * rotation, grid measuring and the token it moves with (from the scene's
 * tokens), labelled with Foundry's own shape and Region sheet strings. The
 * zone itself is the controller's. A zone's region moved with its token is
 * followed back into the zone here.
 */
import type { CartographyController } from '../canvas/controller';
import { I18N } from '../i18n';
import type { ZoneShapeKind } from '../tools/zone';
import { renderZonePanel, type TokenChoice, type ZoneLabels } from '../ui/zone-panel-view';
import { localize } from './localize';
import { createViewWindow } from './view-window';

const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 320;

function labels(): ZoneLabels {
    const shape = (kind: ZoneShapeKind): string => localize(`SHAPE.TYPES.${kind}.name`);
    const base = (path: string): string => localize(`SHAPE.TYPES.base.FIELDS.${path}`);
    return {
        name: localize('DOCUMENT.FIELDS.name.label'),
        shape: base('type.label'),
        shapes: {
            circle: shape('circle'),
            ellipse: shape('ellipse'),
            ring: shape('ring'),
            cone: shape('cone'),
            line: shape('line'),
            rectangle: shape('rectangle'),
        },
        size: (kind, field) => localize(`SHAPE.TYPES.${kind}.FIELDS.${field}.label`),
        curvature: localize('SHAPE.TYPES.cone.FIELDS.curvature.label'),
        curvatures: {
            round: localize('SHAPE.TYPES.cone.CURVATURES.round.label'),
            flat: localize('SHAPE.TYPES.cone.CURVATURES.flat.label'),
            semicircle: localize('SHAPE.TYPES.cone.CURVATURES.semicircle.label'),
        },
        rotation: base('rotation.label'),
        gridBased: base('gridBased.label'),
        token: localize('REGION.FIELDS.attachment.token.label'),
        none: localize(I18N.zones.none),
    };
}

/** The viewed scene's tokens, by name. */
function tokens(): TokenChoice[] {
    return (canvas?.scene?.tokens.contents ?? []).map((token) => ({ id: token.id, name: token.name }));
}

export interface ZoneRuntime {
    /** Open the panel for a zone. */
    readonly edit: (zoneId: string) => void;
}

export function registerZoneRuntime(controller: () => CartographyController | null): ZoneRuntime {
    let zoneId: string | null = null;

    const panel = createViewWindow({
        id: 'zone',
        title: () => localize(I18N.zones.title),
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        render: (root) => {
            const active = controller();
            const id = zoneId;
            const settings = id !== null && active ? active.zoneSettings(id) : null;
            if (!active || id === null || !settings) {
                root.replaceChildren();
                return;
            }
            renderZonePanel(root, { settings, tokens: tokens() }, labels(), {
                set: (next) => {
                    void (async (): Promise<void> => {
                        await active.setZoneSettings(id, next);
                        panel.refresh();
                    })();
                    return true;
                },
            });
        },
    });

    // Foundry moves an attached zone's region with its token, whoever moved the token; the zone follows on the active
    // GM alone, since players cannot write the scene and several GMs would race.
    Hooks.on('updateRegion', (region, changed) => {
        const active = controller();
        const [shape] = region.shapes;
        // Every shape a zone takes is placed at its x, y.
        const placed = shape !== undefined && 'x' in shape && 'y' in shape ? shape : null;
        if (!active || !('shapes' in changed) || game.users?.activeGM?.isSelf !== true || region.id === null || placed === null) {
            return;
        }
        void active.followZone(region.id, { x: placed.x, y: placed.y }, 'rotation' in placed ? placed.rotation : 0);
    });

    return {
        edit: (id) => {
            zoneId = id;
            panel.open();
            panel.refresh();
        },
    };
}
