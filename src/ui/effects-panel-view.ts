// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The area effects panel, opened on a painted area, a stroke or a room: what
 * crossing it costs on foot, then its region behaviours, each with the fields
 * Foundry's own behaviour sheet gives it, and a picker to add another. Named
 * with Foundry's own strings where it has them. A pure function from the
 * panel state to elements; unit-tested under happy-dom.
 */
import {
    AREA_EFFECT_KINDS,
    DARKNESS_MODES,
    newAreaEffect,
    parseModifier,
    parseUuidLines,
    REGION_EVENTS,
    TEXT_EVENTS,
    TEXT_VISIBILITIES,
    withEvent,
    type AreaEffect,
    type AreaEffectKind,
    type DarknessMode,
    type RegionEvent,
    type TextVisibility,
} from '../tools/area-effects';
import type { AreaSettings } from '../tools/areas';
import { button, choice, el, labelledCheckbox, labelledInput, labelledTextArea, replacePreservingFocus } from './dom';

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
}

export interface EffectsHandlers {
    /** Apply a typed movement cost; false rejects it (the input reverts). */
    readonly setMovementCost: (typed: string) => boolean;
    readonly setEffects: (effects: readonly AreaEffect[]) => void;
    readonly setAdding: (kind: AreaEffectKind) => void;
}

/** The subscribed events, one checkbox each, in Foundry's order. */
function eventChecks<T extends RegionEvent>(
    order: readonly T[],
    events: readonly T[],
    labels: EffectsLabels,
    key: string,
    onChange: (events: readonly T[]) => void,
): HTMLElement {
    const group = el('fieldset', 'tw-flex tw-flex-wrap tw-gap-2 tw-w-full');
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

/** The fields of one effect, as Foundry's behaviour sheet has them; `change` replaces the effect. */
function effectFields(effect: AreaEffect, labels: EffectsLabels, key: string, change: (next: AreaEffect) => void): HTMLElement[] {
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
    const section = el('fieldset', 'tw-flex tw-flex-wrap tw-items-center tw-gap-2 tw-w-full');
    const key = `effect-${index}`;
    const replace = (next: AreaEffect | null): void => {
        handlers.setEffects(effects.flatMap((e, i) => (i !== index ? [e] : next === null ? [] : [next])));
    };
    const remove = button('tw-text-xs', labels.remove, `${key}-remove`, () => {
        replace(null);
    });
    const kindName = labels.kind(effect.kind);
    remove.setAttribute('aria-label', `${labels.remove}: ${kindName}`);
    section.append(el('legend', 'tw-text-xs tw-font-bold', kindName), ...effectFields(effect, labels, key, replace), remove);
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
    replacePreservingFocus(root, [labelledInput(labels.movementCost, 'number', String(movementCost), 'movement-cost', handlers.setMovementCost), list, adder]);
}
