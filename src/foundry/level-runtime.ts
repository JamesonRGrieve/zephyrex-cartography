// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Foundry wiring for levels: the levels panel window, and re-reading levels
 * when a GM edits native Level documents directly. The level logic itself is
 * the controller's.
 */
import type { CartographyController } from '../canvas/controller';
import { I18N } from '../i18n';
import { levelPanel } from '../tools/levels';
import { renderLevelPanel, type LevelPanelLabels } from '../ui/level-panel-view';
import { pickImage } from './file-picker';
import { format, localize } from './localize';
import { createViewWindow } from './view-window';

const PANEL_WIDTH = 560;

export interface LevelRuntime {
    readonly openPanel: () => void;
    /** Re-render the panel (after the canvas or its levels change). */
    readonly refresh: () => void;
}

function panelLabels(): LevelPanelLabels {
    const l = I18N.levels;
    return {
        allLevels: localize(l.allLevels),
        addAbove: localize(l.addAbove),
        addBelow: localize(l.addBelow),
        // Foundry's own scene-navigation entry.
        preload: localize('SCENE.Preload'),
        remove: localize(l.remove),
        name: localize(l.name),
        bottom: localize(l.bottom),
        top: localize(l.top),
        features: (count) => format(l.features, { count: String(count) }),
        empty: localize(l.empty),
        removeBlocked: localize(l.removeBlocked),
        list: localize(l.list),
        art: { background: localize(l.background), foreground: localize(l.foreground), fog: localize(l.fog) },
        browse: (image) => format(l.browse, { image }),
        look: {
            title: localize(l.look),
            backgroundColor: localize(l.backgroundColor),
            tints: { background: localize(l.tints.background), foreground: localize(l.tints.foreground) },
            thresholds: { background: localize(l.thresholds.background), foreground: localize(l.thresholds.foreground) },
            // Named as Foundry's own Level sheet names them.
            fit: localize('SCENE_LEVEL.FIELDS.textures.fit.label'),
            fits: {
                fill: localize('TEXTURE_DATA.FIT.fill'),
                contain: localize('TEXTURE_DATA.FIT.contain'),
                cover: localize('TEXTURE_DATA.FIT.cover'),
                width: localize('TEXTURE_DATA.FIT.width'),
                height: localize('TEXTURE_DATA.FIT.height'),
            },
            placement: {
                anchorX: localize(l.placement.anchorX),
                anchorY: localize(l.placement.anchorY),
                offsetX: localize(l.placement.offsetX),
                offsetY: localize(l.placement.offsetY),
                scaleX: localize(l.placement.scaleX),
                scaleY: localize(l.placement.scaleY),
                rotation: localize(l.placement.rotation),
            },
            visibleLevels: localize('SCENE_LEVEL.FIELDS.visibility.levels.label'),
        },
    };
}

export function registerLevelRuntime(controller: () => CartographyController | null): LevelRuntime {
    const run = (action: (active: CartographyController) => Promise<unknown>): void => {
        const active = controller();
        if (active) {
            void (async (): Promise<void> => {
                await action(active);
                panel.refresh();
            })();
        }
    };

    const panel = createViewWindow({
        id: 'levels',
        title: () => localize(I18N.levels.title),
        width: PANEL_WIDTH,
        render: (root) => {
            const active = controller();
            renderLevelPanel(root, levelPanel(active?.levels ?? [], active?.activeLevel ?? null, active?.levelCounts() ?? {}), panelLabels(), {
                select: (id) => {
                    active?.setActiveLevel(id);
                    panel.refresh();
                },
                add: (position) => {
                    run(async (c) => c.addLevel(position, format(I18N.levels.newLevel, { number: String(c.levels.length + 1) })));
                },
                rename: (id, levelName) => {
                    run(async (c) => c.renameLevel(id, levelName));
                },
                setBand: (id, bottom, ceiling) => {
                    run(async (c) => c.setLevelBand(id, bottom, ceiling));
                },
                setArt: (id, art) => {
                    run(async (c) => c.setLevelArt(id, art));
                },
                browse: (id, image) => {
                    const level = active?.levels.find((l) => l.id === id);
                    if (level) {
                        void pickImage(level.art[image], (path) => {
                            run(async (c) => c.setLevelArt(id, { ...level.art, [image]: path }));
                        });
                    }
                },
                preload: (id) => {
                    const scene = canvas?.scene?.id ?? null;
                    if (scene !== null) {
                        // As Foundry's own scene navigation preloads a level: on every connected client.
                        void game.scenes?.preload(scene, { level: id, broadcast: true });
                    }
                },
                remove: (id) => {
                    run(async (c) => c.removeLevel(id));
                },
            });
        },
    });

    // A GM editing native Level documents directly changes the bands everything hangs off. Only the
    // active GM re-syncs (and drops the features of a deleted level); everyone else just re-reads.
    const reload = (): void => {
        if (game.users?.activeGM?.isSelf === true) {
            run(async (c) => c.reloadLevels());
        } else {
            controller()?.load();
            panel.refresh();
        }
    };
    Hooks.on('createLevel', reload);
    Hooks.on('updateLevel', reload);
    Hooks.on('deleteLevel', reload);

    return { openPanel: panel.open, refresh: panel.refresh };
}
