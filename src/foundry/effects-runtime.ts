// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The area effects window: opened by clicking painted ground or a room with
 * the effects tool, in Foundry's Regions controls. It sets what crossing the
 * area costs and the region behaviours on it, labelled with Foundry's own
 * strings for each behaviour type. The settings themselves are the
 * controller's.
 */
import type { CartographyController } from '../canvas/controller';
import { I18N } from '../i18n';
import type { AreaEffectKind } from '../tools/area-effects';
import { parseCostInput } from '../tools/terrain-cost';
import { renderEffectsPanel, type EffectsLabels, type RegionDisplayLabels } from '../ui/effects-panel-view';
import { localize } from './localize';
import { createViewWindow } from './view-window';

const PANEL_WIDTH = 460;
const PANEL_HEIGHT = 520;

/** Each area effect's native behaviour type, whose name Foundry's own strings give. */
const BEHAVIOUR_TYPES: Readonly<Record<AreaEffectKind, string>> = {
    darkness: 'adjustDarknessLevel',
    suppressWeather: 'suppressWeather',
    text: 'displayScrollingText',
    pause: 'pauseGame',
    macro: 'executeMacro',
    script: 'executeScript',
    activeEffect: 'applyActiveEffect',
};

function labels(): EffectsLabels {
    const behaviour = (path: string): string => localize(`BEHAVIOR.TYPES.${path}`);
    return {
        movementCost: localize(I18N.paint.movementCost),
        effects: localize(I18N.effects.effects),
        none: localize(I18N.effects.none),
        adding: localize(I18N.effects.adding),
        add: localize(I18N.effects.add),
        remove: localize(I18N.effects.remove),
        kind: (kind) => localize(`TYPES.RegionBehavior.${BEHAVIOUR_TYPES[kind]}`),
        darknessMode: behaviour('adjustDarknessLevel.FIELDS.mode.label'),
        darknessModes: {
            override: behaviour('adjustDarknessLevel.MODES.OVERRIDE.label'),
            brighten: behaviour('adjustDarknessLevel.MODES.BRIGHTEN.label'),
            darken: behaviour('adjustDarknessLevel.MODES.DARKEN.label'),
        },
        modifier: behaviour('adjustDarknessLevel.FIELDS.modifier.label'),
        text: behaviour('displayScrollingText.FIELDS.text.label'),
        colour: behaviour('displayScrollingText.FIELDS.color.label'),
        visibility: behaviour('displayScrollingText.FIELDS.visibility.label'),
        visibilities: {
            gamemaster: behaviour('displayScrollingText.VISIBILITY_MODES.GAMEMASTER.label'),
            observer: behaviour('displayScrollingText.VISIBILITY_MODES.OBSERVER.label'),
            anyone: behaviour('displayScrollingText.VISIBILITY_MODES.ANYONE.label'),
        },
        once: behaviour('base.FIELDS.once.label'),
        events: behaviour('base.FIELDS.events.label'),
        eventName: (regionEvent) => localize(`REGION.EVENTS.${regionEvent}.label`),
        macro: behaviour('executeMacro.FIELDS.uuid.label'),
        everyone: behaviour('executeMacro.FIELDS.everyone.label'),
        script: behaviour('executeScript.FIELDS.source.label'),
        activeEffects: localize(I18N.effects.activeEffects),
        region: regionLabels(),
    };
}

/** The region display's fields, as Foundry's Region sheet names them. */
function regionLabels(): RegionDisplayLabels {
    const region = (path: string): string => localize(`REGION.${path}`);
    return {
        title: localize(I18N.effects.region),
        visibility: region('FIELDS.visibility.label'),
        visibilities: {
            layer: region('VISIBILITY.LAYER.label'),
            gamemaster: region('VISIBILITY.GAMEMASTER.label'),
            observer: region('VISIBILITY.OBSERVER.label'),
            always: region('VISIBILITY.ALWAYS.label'),
        },
        highlight: region('FIELDS.highlightMode.label'),
        highlights: { shapes: region('HIGHLIGHT_MODES.shapes.label'), coverage: region('HIGHLIGHT_MODES.coverage.label') },
        measurements: region('FIELDS.displayMeasurements.label'),
        observed: localize(I18N.effects.observed),
        restriction: region('FIELDS.restriction.type.label'),
        unrestricted: localize(I18N.effects.unrestricted),
        restrictions: {
            light: region('RESTRICTION_TYPES.light.label'),
            darkness: region('RESTRICTION_TYPES.darkness.label'),
            sight: region('RESTRICTION_TYPES.sight.label'),
            sound: region('RESTRICTION_TYPES.sound.label'),
            move: region('RESTRICTION_TYPES.move.label'),
        },
        priority: region('FIELDS.restriction.priority.label'),
    };
}

export interface EffectsRuntime {
    /** Open the panel for an area (painted ground or a room). */
    readonly edit: (areaId: string) => void;
}

export function registerEffectsRuntime(controller: () => CartographyController | null): EffectsRuntime {
    let areaId: string | null = null;
    let adding: AreaEffectKind = 'darkness';

    const panel = createViewWindow({
        id: 'effects',
        title: () => localize(I18N.effects.title),
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        render: (root) => {
            const active = controller();
            const id = areaId;
            const settings = id !== null && active ? active.areaSettings(id) : null;
            if (!active || id === null || !settings) {
                root.replaceChildren();
                return;
            }
            const save = (next: typeof settings): void => {
                void (async (): Promise<void> => {
                    await active.setAreaSettings(id, next);
                    panel.refresh();
                })();
            };
            renderEffectsPanel(root, { settings, adding }, labels(), {
                setMovementCost: (typed) => {
                    const cost = parseCostInput(typed);
                    if (cost !== null) {
                        save({ ...settings, movementCost: cost });
                    }
                    return cost !== null;
                },
                setEffects: (effects) => {
                    save({ ...settings, effects });
                },
                setAdding: (kind) => {
                    adding = kind;
                    panel.refresh();
                },
                setDisplay: (display) => {
                    save({ ...settings, display });
                },
            });
        },
    });

    return {
        edit: (id) => {
            areaId = id;
            panel.open();
            panel.refresh();
        },
    };
}
