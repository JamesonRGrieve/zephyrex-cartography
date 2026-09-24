// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The area effects panel, opened on a painted area, a stroke or a room: what
 * crossing it costs on foot, how its region shows and whether walls shape
 * it, then its region behaviours, each with the fields
 * Foundry's own behaviour sheet gives it, and a picker to add another. Named
 * with Foundry's own strings where it has them. A pure function from the
 * panel state to elements; unit-tested under happy-dom.
 */
import {
    AREA_EFFECT_KINDS,
    DARKNESS_MODES,
    HIGHLIGHT_MODES,
    newAreaEffect,
    parseModifier,
    parsePriority,
    parseUuidLines,
    REGION_EVENTS,
    REGION_VISIBILITIES,
    RESTRICTION_TYPES,
    TEXT_EVENTS,
    TEXT_VISIBILITIES,
    TOGGLE_ACTIONS,
    TOGGLE_EVENTS,
    toggleActionOf,
    withDisabled,
    withEvent,
    withoutEffect,
    withToggleAction,
    type AreaDisplay,
    type AreaEffect,
    type AreaEffectKind,
    type DarknessMode,
    type HighlightMode,
    type RegionEvent,
    type RegionVisibility,
    type RestrictionType,
    type TextVisibility,
    type ToggleAction,
} from '../tools/area-effects';
import type { AreaSettings } from '../tools/areas';
import { type AreaSpawn, parseSpawnLines, SPAWN_PLACEMENTS, spawnCount, spawnLines, type SpawnPlacement } from '../tools/spawn';
import { button, checkedTextArea, choice, el, labelledCheckbox, labelledInput, labelledTextArea, replacePreservingFocus } from './dom';

export interface EffectsPanel {
    readonly settings: AreaSettings;
    /** The kind of effect the Add button adds. */
    readonly adding: AreaEffectKind;
}

export interface EffectsLabels {
    readonly movementCost: string;
    /** The list of effects. */
    readonly effects: string;
    readonly none: string;
    /** The picker of the kind of behaviour to add. */
    readonly adding: string;
    readonly add: string;
    readonly remove: string;
    /** An effect kind's name: its behaviour type's. */
    readonly kind: (kind: AreaEffectKind) => string;
    readonly darknessMode: string;
    readonly darknessModes: Readonly<Record<DarknessMode, string>>;
    readonly modifier: string;
    readonly text: string;
    readonly colour: string;
    readonly visibility: string;
    readonly visibilities: Readonly<Record<TextVisibility, string>>;
    readonly once: string;
    readonly events: string;
    readonly eventName: (event: RegionEvent) => string;
    readonly macro: string;
    readonly everyone: string;
    readonly script: string;
    /** The Active Effects to apply, one UUID per line. */
    readonly activeEffects: string;
    /** A behaviour's native `disabled`. */
    readonly disabled: string;
    /** What a toggle does to another behaviour: its two actions, and leaving it be. */
    readonly toggleActions: Readonly<Record<ToggleAction, string>>;
    readonly untouched: string;
    readonly region: RegionDisplayLabels;
    readonly spawn: SpawnLabels;
}

/** The spawn section's fields. */
interface SpawnLabels {
    readonly title: string;
    /** The actors, one per line, each a UUID or a count then a UUID. */
    readonly actors: string;
    readonly placement: string;
    readonly placements: Readonly<Record<SpawnPlacement, string>>;
    readonly snap: string;
    readonly avoidOccupied: string;
    readonly spawnNow: string;
}

/** The region's display fields, named as Foundry's Region sheet names them. */
export interface RegionDisplayLabels {
    /** The section's legend. */
    readonly title: string;
    readonly visibility: string;
    readonly visibilities: Readonly<Record<RegionVisibility, string>>;
    readonly highlight: string;
    readonly highlights: Readonly<Record<HighlightMode, string>>;
    readonly measurements: string;
    /** Players are the region's observers. */
    readonly observed: string;
    readonly restriction: string;
    /** The "not restricted" choice. */
    readonly unrestricted: string;
    readonly restrictions: Readonly<Record<RestrictionType, string>>;
    readonly priority: string;
}

export interface EffectsHandlers {
    /** Apply a typed movement cost; false rejects it (the input reverts). */
    readonly setMovementCost: (typed: string) => boolean;
    readonly setEffects: (effects: readonly AreaEffect[]) => void;
    readonly setAdding: (kind: AreaEffectKind) => void;
    readonly setDisplay: (display: AreaDisplay) => void;
    readonly setSpawn: (spawn: AreaSpawn) => void;
    /** Spawn the area's tokens now. */
    readonly spawnNow: () => void;
}

/** Select value standing for "not restricted" (no restriction type is empty). */
const UNRESTRICTED = '';

/** How the area's region shows, and whether walls shape it; its priority only while it is restricted. */
function displaySection(display: AreaDisplay, labels: RegionDisplayLabels, setDisplay: (display: AreaDisplay) => void): HTMLElement {
    const section = el('fieldset', 'tw-flex tw-flex-wrap tw-items-center tw-gap-2 tw-box-border tw-w-full tw-mx-0');
    const restriction = display.restriction;
    section.append(
        el('legend', 'tw-text-xs tw-font-bold', labels.title),
        choice(
            'zc-area-visibility',
            labels.visibility,
            REGION_VISIBILITIES.map((visibility) => [visibility, labels.visibilities[visibility]] as const),
            display.visibility,
            (visibility) => {
                setDisplay({ ...display, visibility });
            },
        ),
        choice(
            'zc-area-highlight',
            labels.highlight,
            HIGHLIGHT_MODES.map((highlight) => [highlight, labels.highlights[highlight]] as const),
            display.highlight,
            (highlight) => {
                setDisplay({ ...display, highlight });
            },
        ),
        labelledCheckbox(labels.measurements, display.measurements, 'area-measurements', (measurements) => {
            setDisplay({ ...display, measurements });
        }),
        labelledCheckbox(labels.observed, display.observed, 'area-observed', (observed) => {
            setDisplay({ ...display, observed });
        }),
        choice(
            'zc-area-restriction',
            labels.restriction,
            [[UNRESTRICTED, labels.unrestricted] as const, ...RESTRICTION_TYPES.map((type) => [type, labels.restrictions[type]] as const)],
            restriction?.type ?? UNRESTRICTED,
            (type) => {
                setDisplay({ ...display, restriction: type === UNRESTRICTED ? null : { type, priority: restriction?.priority ?? 0 } });
            },
        ),
        ...(restriction
            ? [
                  labelledInput(labels.priority, 'number', String(restriction.priority), 'area-priority', (typed) => {
                      const priority = parsePriority(typed);
                      if (priority !== null) {
                          setDisplay({ ...display, restriction: { ...restriction, priority } });
                      }
                      return priority !== null;
                  }),
              ]
            : []),
    );
    return section;
}

/** The subscribed events, one checkbox each, in Foundry's order. */
function eventChecks<T extends RegionEvent>(
    order: readonly T[],
    events: readonly T[],
    labels: EffectsLabels,
    key: string,
    onChange: (events: readonly T[]) => void,
): HTMLElement {
    const group = el('fieldset', 'tw-flex tw-flex-wrap tw-gap-2 tw-box-border tw-w-full tw-mx-0');
    group.append(
        el('legend', 'tw-text-xs', labels.events),
        ...order.map((regionEvent) =>
            labelledCheckbox(labels.eventName(regionEvent), events.includes(regionEvent), `${key}-${regionEvent}`, (on) => {
                onChange(withEvent(order, events, regionEvent, on));
            }),
        ),
    );
    return group;
}

/** Select value standing for "leave this behaviour be". */
const UNTOUCHED = '';

/** What a toggle does to each other behaviour of the area, one choice each, named by its place and kind. */
function toggleTargets(
    toggle: Extract<AreaEffect, { kind: 'toggle' }>,
    own: number,
    effects: readonly AreaEffect[],
    labels: EffectsLabels,
    key: string,
    change: (next: AreaEffect) => void,
): HTMLElement[] {
    const actions = [[UNTOUCHED, labels.untouched] as const, ...TOGGLE_ACTIONS.map((action) => [action, labels.toggleActions[action]] as const)];
    return effects.flatMap((target, index) =>
        index === own
            ? []
            : [
                  choice(
                      `${key}-target-${index}`,
                      `${index + 1}. ${labels.kind(target.kind)}`,
                      actions,
                      toggleActionOf(toggle, index) ?? UNTOUCHED,
                      (action) => {
                          change(withToggleAction(toggle, index, action === UNTOUCHED ? null : action));
                      },
                  ),
              ],
    );
}

/** The fields of effect `index` of `effects`, as Foundry's behaviour sheet has them; `change` replaces the effect. */
function effectFields(index: number, effects: readonly AreaEffect[], labels: EffectsLabels, key: string, change: (next: AreaEffect) => void): HTMLElement[] {
    const effect = effects[index];
    if (effect === undefined) {
        return [];
    }
    switch (effect.kind) {
        case 'darkness':
            return [
                choice(
                    `${key}-mode`,
                    labels.darknessMode,
                    DARKNESS_MODES.map((mode) => [mode, labels.darknessModes[mode]] as const),
                    effect.mode,
                    (mode) => {
                        change({ ...effect, mode });
                    },
                ),
                labelledInput(labels.modifier, 'number', String(effect.modifier), `${key}-modifier`, (typed) => {
                    const modifier = parseModifier(typed);
                    if (modifier !== null) {
                        change({ ...effect, modifier });
                    }
                    return modifier !== null;
                }),
            ];
        case 'text':
            return [
                labelledInput(labels.text, 'text', effect.text, `${key}-text`, (text) => {
                    change({ ...effect, text });
                    return true;
                }),
                labelledInput(labels.colour, 'color', effect.colour, `${key}-colour`, (colour) => {
                    change({ ...effect, colour: colour.toLowerCase() });
                    return true;
                }),
                choice(
                    `${key}-visibility`,
                    labels.visibility,
                    TEXT_VISIBILITIES.map((visibility) => [visibility, labels.visibilities[visibility]] as const),
                    effect.visibility,
                    (visibility) => {
                        change({ ...effect, visibility });
                    },
                ),
                onceCheck(effect.once, labels, key, (once) => {
                    change({ ...effect, once });
                }),
                eventChecks(TEXT_EVENTS, effect.events, labels, key, (events) => {
                    change({ ...effect, events });
                }),
            ];
        case 'pause':
            return [
                onceCheck(effect.once, labels, key, (once) => {
                    change({ ...effect, once });
                }),
            ];
        case 'macro':
            return [
                labelledInput(labels.macro, 'text', effect.uuid ?? '', `${key}-uuid`, (typed) => {
                    change({ ...effect, uuid: typed.trim() === '' ? null : typed.trim() });
                    return true;
                }),
                labelledCheckbox(labels.everyone, effect.everyone, `${key}-everyone`, (everyone) => {
                    change({ ...effect, everyone });
                }),
                eventChecks(REGION_EVENTS, effect.events, labels, key, (events) => {
                    change({ ...effect, events });
                }),
            ];
        case 'script':
            return [
                labelledTextArea(labels.script, effect.source, `${key}-source`, SCRIPT_ROWS, (source) => {
                    change({ ...effect, source });
                }),
                eventChecks(REGION_EVENTS, effect.events, labels, key, (events) => {
                    change({ ...effect, events });
                }),
            ];
        case 'activeEffect':
            return [
                labelledTextArea(labels.activeEffects, effect.effects.join('\n'), `${key}-effects`, UUID_ROWS, (typed) => {
                    change({ ...effect, effects: parseUuidLines(typed) });
                }),
            ];
        case 'toggle':
            return [
                eventChecks(TOGGLE_EVENTS, effect.events, labels, key, (events) => {
                    change({ ...effect, events });
                }),
                ...toggleTargets(effect, index, effects, labels, key, change),
            ];
        case 'suppressWeather':
            break;
    }
    // Suppress Weather has no fields.
    return [];
}

/** Lines of a script's text area. */
const SCRIPT_ROWS = 4;

/** Lines of the Active Effect UUIDs' text area. */
const UUID_ROWS = 2;

function onceCheck(once: boolean, labels: EffectsLabels, key: string, onChange: (once: boolean) => void): HTMLElement {
    return labelledCheckbox(labels.once, once, `${key}-once`, onChange);
}

/** Effect `index` of `effects`: its kind as a legend, its fields, and a button to remove it. */
function effectSection(effect: AreaEffect, index: number, effects: readonly AreaEffect[], labels: EffectsLabels, handlers: EffectsHandlers): HTMLElement {
    const section = el('fieldset', 'tw-flex tw-flex-wrap tw-items-center tw-gap-2 tw-box-border tw-w-full tw-mx-0');
    const key = `effect-${index}`;
    const replace = (next: AreaEffect): void => {
        handlers.setEffects(effects.map((e, i) => (i === index ? next : e)));
    };
    const remove = button('tw-text-xs', labels.remove, `${key}-remove`, () => {
        handlers.setEffects(withoutEffect(effects, index));
    });
    const kindName = labels.kind(effect.kind);
    remove.setAttribute('aria-label', `${labels.remove}: ${kindName}`);
    section.append(
        el('legend', 'tw-text-xs tw-font-bold', `${index + 1}. ${kindName}`),
        ...effectFields(index, effects, labels, key, replace),
        labelledCheckbox(labels.disabled, effect.disabled === true, `${key}-disabled`, (disabled) => {
            replace(withDisabled(effect, disabled));
        }),
        remove,
    );
    return section;
}

export function renderEffectsPanel(root: HTMLElement, panel: EffectsPanel, labels: EffectsLabels, handlers: EffectsHandlers): void {
    const { movementCost, effects } = panel.settings;
    const list = el('div', 'tw-flex tw-flex-col tw-gap-2');
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', labels.effects);
    list.append(
        ...(effects.length > 0
            ? effects.map((effect, i) => effectSection(effect, i, effects, labels, handlers))
            : [el('p', 'tw-italic tw-text-xs', labels.none)]),
    );
    const adder = el('div', 'tw-flex tw-items-center tw-gap-2');
    adder.append(
        choice(
            'zc-effect-kind',
            labels.adding,
            AREA_EFFECT_KINDS.map((kind) => [kind, labels.kind(kind)] as const),
            panel.adding,
            handlers.setAdding,
        ),
        button('tw-text-xs', labels.add, 'effect-add', () => {
            handlers.setEffects([...effects, newAreaEffect(panel.adding)]);
        }),
    );
    replacePreservingFocus(root, [
        labelledInput(labels.movementCost, 'number', String(movementCost), 'movement-cost', handlers.setMovementCost),
        displaySection(panel.settings.display, labels.region, handlers.setDisplay),
        list,
        adder,
        spawnSection(panel.settings.spawn, labels.spawn, handlers),
    ]);
}

/** Lines of the actors' text area. */
const SPAWN_ROWS = 3;

/** What the area spawns and how Foundry places it, and the button that spawns it now (only while there is something to spawn). */
function spawnSection(spawn: AreaSpawn, labels: SpawnLabels, handlers: EffectsHandlers): HTMLElement {
    const section = el('fieldset', 'tw-flex tw-flex-wrap tw-items-center tw-gap-2 tw-box-border tw-w-full tw-mx-0');
    const now = button('tw-text-xs', labels.spawnNow, 'spawn-now', handlers.spawnNow);
    now.disabled = spawnCount(spawn) === 0;
    section.append(
        el('legend', 'tw-text-xs tw-font-bold', labels.title),
        checkedTextArea(labels.actors, spawnLines(spawn.actors), 'spawn-actors', SPAWN_ROWS, (typed) => {
            const actors = parseSpawnLines(typed);
            if (actors !== null) {
                handlers.setSpawn({ ...spawn, actors });
            }
            return actors !== null;
        }),
        choice(
            'zc-spawn-placement',
            labels.placement,
            SPAWN_PLACEMENTS.map((placement) => [placement, labels.placements[placement]] as const),
            spawn.placement,
            (placement) => {
                handlers.setSpawn({ ...spawn, placement });
            },
        ),
        labelledCheckbox(labels.snap, spawn.snap, 'spawn-snap', (snap) => {
            handlers.setSpawn({ ...spawn, snap });
        }),
        labelledCheckbox(labels.avoidOccupied, spawn.avoidOccupied, 'spawn-avoid', (avoidOccupied) => {
            handlers.setSpawn({ ...spawn, avoidOccupied });
        }),
        now,
    );
    return section;
}
