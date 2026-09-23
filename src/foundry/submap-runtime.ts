// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Foundry wiring for submaps: an "Interior" button on the Tile HUD of every
 * enterable stamp opens the interior panel. From there the GM creates a new
 * interior scene, links an existing one (imported scenes included), opens the
 * linked interior, or unlinks it. Every change is the controller's.
 */
import type { CartographyController, StampCatalog } from '../canvas/controller';
import { I18N } from '../i18n';
import { MODULE_ID } from '../module-id';
import { isRecord, stringOrNull } from '../tools/guards';
import { renderSubmapPanel, type SubmapLabels } from '../ui/submap-view';
import { format, localize } from './localize';
import { createViewWindow } from './view-window';

const PANEL_WIDTH = 420;
const PANEL_HEIGHT = 300;

function labels(): SubmapLabels {
    const s = I18N.submap;
    return {
        linkedTo: (scene) => format(s.linkedTo, { scene }),
        notLinked: localize(s.notLinked),
        createInterior: localize(s.createInterior),
        linkExisting: localize(s.linkExisting),
        scene: localize(s.scene),
        link: localize(s.link),
        open: localize(s.open),
        unlink: localize(s.unlink),
        noScenes: localize(s.noScenes),
    };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: a tile's flags are arbitrary JSON; reads the owning feature id we wrote
function flaggedFeatureId(flags: unknown): string | null {
    const scoped = isRecord(flags) ? flags[MODULE_ID] : null;
    return isRecord(scoped) ? stringOrNull(scoped['featureId']) : null;
}

export function registerSubmapRuntime(controller: () => CartographyController | null, catalog: StampCatalog): void {
    let stampId: string | null = null;

    const stampName = (active: CartographyController, id: string): string => {
        const feature = active.getFeature(id);
        return feature?.type === 'stamp' ? catalog.get(feature.stamp)?.name ?? '' : '';
    };

    const panel = createViewWindow({
        id: 'submap',
        title: () => localize(I18N.submap.title),
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        render: (root) => {
            const active = controller();
            const id = stampId;
            if (!active || id === null) {
                root.replaceChildren();
                return;
            }
            const link = active.submapOf(id);
            const current = canvas?.scene?.id;
            const scenes = (game.scenes?.contents ?? []).filter((s) => s.id !== current).map((s) => ({ id: s.id, name: s.name }));
            const run = (action: () => Promise<unknown>): void => {
                void (async (): Promise<void> => {
                    await action();
                    panel.refresh();
                })();
            };
            renderSubmapPanel(root, { stampName: stampName(active, id), linkedScene: link?.sceneName ?? null, scenes }, labels(), {
                createInterior: () => {
                    run(async () => active.createInterior(id, format(I18N.submap.defaultName, { stamp: stampName(active, id) })));
                },
                link: (sceneId) => {
                    run(async () => active.linkSubmap(id, sceneId));
                },
                open: () => {
                    const interior = link ? game.scenes?.get(link.scene) : undefined;
                    void interior?.view();
                },
                unlink: () => {
                    run(async () => active.unlinkSubmap(id));
                },
            });
        },
    });

    Hooks.on('renderTileHUD', (hud, html) => {
        const active = controller();
        const tile = hud.document;
        const featureId = tile ? flaggedFeatureId(tile.flags) ?? (tile.id === null ? null : active?.featureForTile(tile.id)) : null;
        const feature = featureId != null && active ? active.getFeature(featureId) : null;
        const column = html.querySelector('.col.left');
        if (!column || feature?.type !== 'stamp' || !feature.behaviour.enterable) {
            return;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'control-icon';
        button.setAttribute('aria-label', localize(I18N.submap.hud));
        button.title = localize(I18N.submap.hud);
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-door-open';
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon);
        button.addEventListener('click', (clickEvent) => {
            clickEvent.preventDefault();
            stampId = feature.id;
            panel.open();
            panel.refresh();
        });
        column.append(button);
    });
}
