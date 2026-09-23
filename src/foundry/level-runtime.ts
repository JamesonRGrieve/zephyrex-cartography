// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Foundry wiring for levels: the levels panel window, the localised names of
 * generated transition regions, and re-reading levels when a GM edits native
 * Level documents directly (v14). The level logic itself is the controller's.
 */
import type { CartographyController } from '../canvas/controller';
import { BIOME_TITLE_KEYS, I18N, TRANSITION_KIND_KEYS } from '../i18n';
import type { RegionDoc } from '../tools/documents';
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
    };
}

/** A generated region's display name, e.g. "Stairs: Ground floor → Upper floor" or "Enter Hab 12". */
export function regionName(region: RegionDoc): string {
    const label = region.label;
    if ('scene' in label) {
        return format(label.kind === 'entrance' ? I18N.regions.entrance : I18N.regions.exit, { scene: label.scene });
    }
    if ('biome' in label) {
        return localize(BIOME_TITLE_KEYS[label.biome]);
    }
    return format(I18N.regions.transition, { kind: localize(TRANSITION_KIND_KEYS[label.kind]), from: label.from, to: label.to.join(' / ') });
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
                remove: (id) => {
                    run(async (c) => c.removeLevel(id));
                },
            });
        },
    });

    // A GM editing native Level documents directly (v14) changes the bands everything hangs off.
    const reload = (): void => {
        run(async (c) => c.reloadLevels());
    };
    Hooks.on('createLevel', reload);
    Hooks.on('updateLevel', reload);
    Hooks.on('deleteLevel', reload);

    return { openPanel: panel.open, refresh: panel.refresh };
}
