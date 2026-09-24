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
import { format, localize } from './localize';
import { createViewWindow } from './view-window';

const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 420;

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
    };
}

/** Pick an image with Foundry's own file picker, starting from `current`. */
async function pickImage(current: string | null, picked: (path: string) => void): Promise<void> {
    const picker = new foundry.applications.apps.FilePicker.implementation({ type: 'image', current: current ?? '', callback: picked });
    await picker.render({ force: true });
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
        height: PANEL_HEIGHT,
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
