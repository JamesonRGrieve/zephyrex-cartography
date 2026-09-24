// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Area effects: Foundry v14 region behaviours a GM puts on a painted area,
 * a stroke or a room, carried by the Scene Region the area generates. Each
 * mirrors one behaviour type's fields in the 14.359 source
 * (`client/data/region-behaviors/`): Adjust Darkness Level, Suppress Weather,
 * Display Scrolling Text, Pause Game, Execute Macro, Execute Script and Apply
 * Active Effect. Pure and unit-tested; the boundary translates them.
 */
import { parseCssHex } from './colour';
import { isRecord, stringArray } from './guards';
import { parseAreaSpawn, type Spawning } from './spawn';
import { type Costed, parseMovementCost } from './terrain-cost';

/** v14 `CONST.REGION_EVENTS`: what a region behaviour can subscribe to. */
export const REGION_EVENTS = [
    'regionBoundary',
    'regionAnimation',
    'behaviorActivated',
    'behaviorDeactivated',
    'behaviorViewed',
    'behaviorUnviewed',
    'tokenEnter',
    'tokenExit',
    'tokenMoveIn',
    'tokenMoveOut',
    'tokenMoveWithin',
    'tokenAnimateIn',
    'tokenAnimateOut',
    'tokenTurnStart',
    'tokenTurnEnd',
    'tokenRoundStart',
    'tokenRoundEnd',
] as const;

export type RegionEvent = (typeof REGION_EVENTS)[number];

/** The events Display Scrolling Text takes (its schema narrows them). */
export const TEXT_EVENTS = [
    'tokenAnimateIn',
    'tokenAnimateOut',
    'tokenTurnStart',
    'tokenTurnEnd',
    'tokenRoundStart',
    'tokenRoundEnd',
] as const satisfies readonly RegionEvent[];

type TextEvent = (typeof TEXT_EVENTS)[number];

/** Adjust Darkness Level's `MODES`, in their numeric order (OVERRIDE 0, BRIGHTEN 1, DARKEN 2). */
export const DARKNESS_MODES = ['override', 'brighten', 'darken'] as const;

export type DarknessMode = (typeof DARKNESS_MODES)[number];

/** Display Scrolling Text's `VISIBILITY_MODES`, in their numeric order (GAMEMASTER 0, OBSERVER 1, ANYONE 2). */
export const TEXT_VISIBILITIES = ['gamemaster', 'observer', 'anyone'] as const;

export type TextVisibility = (typeof TEXT_VISIBILITIES)[number];

/** The events Toggle Behavior takes (its schema narrows them). */
export const TOGGLE_EVENTS = [
    'tokenEnter',
    'tokenExit',
    'tokenMoveIn',
    'tokenMoveOut',
    'tokenTurnStart',
    'tokenTurnEnd',
    'tokenRoundStart',
    'tokenRoundEnd',
] as const satisfies readonly RegionEvent[];

type ToggleEvent = (typeof TOGGLE_EVENTS)[number];

/** What a toggle can do to another behaviour of its area. */
export const TOGGLE_ACTIONS = ['enable', 'disable'] as const;

export type ToggleAction = (typeof TOGGLE_ACTIONS)[number];

/**
 * One behaviour on an area's region. `disabled` is the behaviour's native
 * `disabled`: it starts switched off, for a toggle to switch on.
 */
export type AreaEffect = AreaEffectBody & { readonly disabled?: true };

type AreaEffectBody =
    | { readonly kind: 'darkness'; readonly mode: DarknessMode; readonly modifier: number }
    | { readonly kind: 'suppressWeather' }
    | {
          readonly kind: 'text';
          readonly text: string;
          /** `#rrggbb`. */
          readonly colour: string;
          readonly visibility: TextVisibility;
          readonly once: boolean;
          readonly events: readonly TextEvent[];
      }
    | { readonly kind: 'pause'; readonly once: boolean }
    /** `uuid` is a Macro's, or null until one is chosen. */
    | { readonly kind: 'macro'; readonly uuid: string | null; readonly everyone: boolean; readonly events: readonly RegionEvent[] }
    | { readonly kind: 'script'; readonly source: string; readonly events: readonly RegionEvent[] }
    /** `effects` are ActiveEffect UUIDs. */
    | { readonly kind: 'activeEffect'; readonly effects: readonly string[] }
    /**
     * Toggle Behavior. `enable` and `disable` name other behaviours of the
     * same area by their place in its effects: the area's behaviours are
     * always recreated together, so they can be named by UUID.
     */
    | { readonly kind: 'toggle'; readonly events: readonly ToggleEvent[]; readonly enable: readonly number[]; readonly disable: readonly number[] };

export type AreaEffectKind = AreaEffect['kind'];

export const AREA_EFFECT_KINDS = [
    'darkness',
    'suppressWeather',
    'text',
    'pause',
    'macro',
    'script',
    'activeEffect',
    'toggle',
] as const satisfies readonly AreaEffectKind[];

/** A new effect of `kind`, as Foundry makes a new behaviour of its type. */
export function newAreaEffect(kind: AreaEffectKind): AreaEffect {
    switch (kind) {
        case 'darkness':
            return { kind, mode: 'override', modifier: 0 };
        case 'text':
            return { kind, text: '', colour: '#ffffff', visibility: 'anyone', once: false, events: [] };
        case 'pause':
            return { kind, once: false };
        case 'macro':
            return { kind, uuid: null, everyone: false, events: [] };
        case 'script':
            return { kind, source: '', events: [] };
        case 'activeEffect':
            return { kind, effects: [] };
        case 'toggle':
            return { kind, events: [], enable: [], disable: [] };
        case 'suppressWeather':
            break;
    }
    return { kind: 'suppressWeather' };
}

/** `effect`, starting switched off or not. */
export function withDisabled(effect: AreaEffect, disabled: boolean): AreaEffect {
    const { disabled: _was, ...body } = effect;
    return disabled ? { ...body, disabled: true } : body;
}

/** What `toggle` does to effect `target`: enable it, disable it, or nothing. */
export function toggleActionOf(toggle: Extract<AreaEffect, { kind: 'toggle' }>, target: number): ToggleAction | null {
    return toggle.enable.includes(target) ? 'enable' : toggle.disable.includes(target) ? 'disable' : null;
}

/** `toggle`, set to `action` effect `target` (a behaviour is never both enabled and disabled). */
export function withToggleAction(
    toggle: Extract<AreaEffect, { kind: 'toggle' }>,
    target: number,
    action: ToggleAction | null,
): Extract<AreaEffect, { kind: 'toggle' }> {
    const without = (targets: readonly number[]): number[] => targets.filter((t) => t !== target);
    const withTarget = (targets: readonly number[]): number[] => [...without(targets), target].sort((a, b) => a - b);
    return {
        ...toggle,
        enable: action === 'enable' ? withTarget(toggle.enable) : without(toggle.enable),
        disable: action === 'disable' ? withTarget(toggle.disable) : without(toggle.disable),
    };
}

/** `effects` less effect `index`, every toggle's targets renumbered to match and any on it dropped. */
export function withoutEffect(effects: readonly AreaEffect[], index: number): AreaEffect[] {
    const renumber = (targets: readonly number[]): number[] => targets.filter((t) => t !== index).map((t) => (t > index ? t - 1 : t));
    return effects
        .filter((_, i) => i !== index)
        .map((effect) => (effect.kind === 'toggle' ? { ...effect, enable: renumber(effect.enable), disable: renumber(effect.disable) } : effect));
}

/**
 * Every toggle's targets kept to other effects that exist, each once and in
 * order, and never both enabled and disabled (disabling wins, as the later
 * of Foundry's two passes).
 */
function checkedToggles(effects: readonly AreaEffect[]): AreaEffect[] {
    return effects.map((effect, own) => {
        if (effect.kind !== 'toggle') {
            return effect;
        }
        const valid = (targets: readonly number[]): number[] =>
            [...new Set(targets)].filter((t) => Number.isInteger(t) && t >= 0 && t < effects.length && t !== own).sort((a, b) => a - b);
        const disable = valid(effect.disable);
        return { ...effect, enable: valid(effect.enable).filter((t) => !disable.includes(t)), disable };
    });
}

/** Who sees an area's region: v14 `CONST.REGION_VISIBILITY` less LAYER_UNLOCKED, which would hide a locked region. */
export const REGION_VISIBILITIES = ['layer', 'gamemaster', 'observer', 'always'] as const;

export type RegionVisibility = (typeof REGION_VISIBILITIES)[number];

/** How a region is highlighted: its true shapes, or the grid spaces it covers (v14 `highlightMode`). */
export const HIGHLIGHT_MODES = ['shapes', 'coverage'] as const;

export type HighlightMode = (typeof HIGHLIGHT_MODES)[number];

/** v14 `CONST.EDGE_RESTRICTION_TYPES`: the walls a restricted region's shapes are clipped to. */
export const RESTRICTION_TYPES = ['light', 'darkness', 'sight', 'sound', 'move'] as const;

export type RestrictionType = (typeof RESTRICTION_TYPES)[number];

/**
 * How an area's region shows and whether it is shaped by walls. `observed`
 * makes every player an observer of the region (its default ownership), so
 * the `observer` visibility shows it to them. A restriction does not bar
 * anything: Foundry clips the region's shapes to walls of its type (and, for
 * light, darkness and sight, sources at or past its priority), cast from each
 * shape's origin like a light, so an effect stops at walls. A `hidden` region
 * (14.360) is the GM's alone and its behaviours do nothing until it is shown:
 * a trap or an ambush the GM springs.
 */
export interface AreaDisplay {
    readonly visibility: RegionVisibility;
    readonly highlight: HighlightMode;
    readonly measurements: boolean;
    readonly observed: boolean;
    readonly restriction: { readonly type: RestrictionType; readonly priority: number } | null;
    readonly hidden: boolean;
}

/** A region as the engine makes one: on the Regions layer, its true shapes, no measurements, the GM's alone, unrestricted, live. */
export const DEFAULT_AREA_DISPLAY: AreaDisplay = {
    visibility: 'layer',
    highlight: 'shapes',
    measurements: false,
    observed: false,
    restriction: null,
    hidden: false,
};

/** What an area carries: its effects, its region's display and what it spawns, each left out of the stored JSON while it has none. */
export interface Affected extends Spawning {
    readonly effects?: readonly AreaEffect[] | undefined;
    readonly display?: AreaDisplay | undefined;
}

/** An area's region display, the engine's default when it has none. */
export function displayOf(feature: Affected): AreaDisplay {
    return feature.display ?? DEFAULT_AREA_DISPLAY;
}

/** Whether `display` is anything but the default. */
export function customDisplay(display: AreaDisplay): boolean {
    const { visibility, highlight, measurements, observed, restriction, hidden } = DEFAULT_AREA_DISPLAY;
    return (
        display.visibility !== visibility ||
        display.highlight !== highlight ||
        display.measurements !== measurements ||
        display.observed !== observed ||
        display.restriction !== restriction ||
        display.hidden !== hidden
    );
}

/** A display as stored: undefined for the default. */
export function storedDisplay(display: AreaDisplay): AreaDisplay | undefined {
    return customDisplay(display) ? display : undefined;
}

/** A typed restriction priority: a whole number from 0, or null. */
export function parsePriority(typed: string): number | null {
    const value = typed.trim() === '' ? Number.NaN : Number(typed);
    return Number.isInteger(value) && value >= 0 ? value : null;
}

/** An area's persisted cost, effects, region display and spawn, as its parser spreads them. */
// eslint-disable-next-line no-restricted-syntax -- boundary: reads an area's fields from one untyped scene-flag entry
export function parseAreaFields(v: Record<string, unknown>): Costed & Affected {
    return {
        movementCost: parseMovementCost(v['movementCost']),
        effects: parseAreaEffects(v['effects']),
        display: parseAreaDisplay(v['display']),
        spawn: parseAreaSpawn(v['spawn']),
    };
}

/** The persisted display of an area: each field valid or the default; none when it is the default. */
// eslint-disable-next-line no-restricted-syntax -- boundary: narrows a persisted region display from scene-flag JSON
export function parseAreaDisplay(v: unknown): AreaDisplay | undefined {
    if (!isRecord(v)) {
        return undefined;
    }
    const restriction = isRecord(v['restriction']) ? v['restriction'] : null;
    const type = restriction ? RESTRICTION_TYPES.find((t) => t === restriction['type']) : undefined;
    const priority = restriction && typeof restriction['priority'] === 'number' ? parsePriority(String(restriction['priority'])) : null;
    return storedDisplay({
        visibility: oneOf(REGION_VISIBILITIES, v['visibility'], DEFAULT_AREA_DISPLAY.visibility),
        highlight: oneOf(HIGHLIGHT_MODES, v['highlight'], DEFAULT_AREA_DISPLAY.highlight),
        measurements: v['measurements'] === true,
        observed: v['observed'] === true,
        restriction: type === undefined ? null : { type, priority: priority ?? 0 },
        hidden: v['hidden'] === true,
    });
}

/** An area's effects, none when it has none. */
export function effectsOf(feature: Affected): readonly AreaEffect[] {
    return feature.effects ?? [];
}

/** A typed darkness modifier (0–1), or null when it is not one. */
export function parseModifier(typed: string): number | null {
    const value = typed.trim() === '' ? Number.NaN : Number(typed);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

/** `events` with `event` subscribed or not, in `order`'s order. */
export function withEvent<T extends string>(order: readonly T[], events: readonly T[], toggled: T, on: boolean): T[] {
    return order.filter((candidate) => (candidate === toggled ? on : events.includes(candidate)));
}

/** UUIDs typed one per line: trimmed, blank lines dropped. */
export function parseUuidLines(typed: string): string[] {
    return typed
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
}

/** Effects as stored: undefined for none, so only real effects are kept. */
export function storedEffects(effects: readonly AreaEffect[]): readonly AreaEffect[] | undefined {
    return effects.length > 0 ? effects : undefined;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: narrows a persisted enum value from scene-flag JSON
function oneOf<T extends string>(choices: readonly T[], v: unknown, fallback: T): T {
    return choices.find((choice) => choice === v) ?? fallback;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: narrows persisted region events from scene-flag JSON
function eventsOf<T extends string>(choices: readonly T[], v: unknown): T[] {
    return stringArray(v).flatMap((stored) => choices.filter((choice) => choice === stored));
}

// eslint-disable-next-line no-restricted-syntax -- boundary: narrows persisted effect indices from scene-flag JSON
function indicesOf(v: unknown): number[] {
    return Array.isArray(v) ? v.filter((t): t is number => typeof t === 'number') : [];
}

// eslint-disable-next-line no-restricted-syntax -- boundary: parses one persisted effect from scene-flag JSON
function parseAreaEffect(v: unknown): AreaEffect | null {
    if (!isRecord(v)) {
        return null;
    }
    const body = parseEffectBody(v);
    return body && withDisabled(body, v['disabled'] === true);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: parses one persisted effect's own fields from scene-flag JSON
function parseEffectBody(v: Record<string, unknown>): AreaEffect | null {
    const base = AREA_EFFECT_KINDS.find((kind) => kind === v['kind']);
    if (base === undefined) {
        return null;
    }
    const fresh = newAreaEffect(base);
    switch (fresh.kind) {
        case 'darkness': {
            const modifier = typeof v['modifier'] === 'number' && v['modifier'] >= 0 && v['modifier'] <= 1 ? v['modifier'] : fresh.modifier;
            return { ...fresh, mode: oneOf(DARKNESS_MODES, v['mode'], fresh.mode), modifier };
        }
        case 'text': {
            const colour = typeof v['colour'] === 'string' && parseCssHex(v['colour']) !== null ? v['colour'] : fresh.colour;
            return {
                ...fresh,
                text: typeof v['text'] === 'string' ? v['text'] : fresh.text,
                colour,
                visibility: oneOf(TEXT_VISIBILITIES, v['visibility'], fresh.visibility),
                once: v['once'] === true,
                events: eventsOf(TEXT_EVENTS, v['events']),
            };
        }
        case 'pause':
            return { ...fresh, once: v['once'] === true };
        case 'macro':
            return {
                ...fresh,
                uuid: typeof v['uuid'] === 'string' && v['uuid'] !== '' ? v['uuid'] : null,
                everyone: v['everyone'] === true,
                events: eventsOf(REGION_EVENTS, v['events']),
            };
        case 'script':
            return { ...fresh, source: typeof v['source'] === 'string' ? v['source'] : fresh.source, events: eventsOf(REGION_EVENTS, v['events']) };
        case 'activeEffect':
            return { ...fresh, effects: stringArray(v['effects']).filter((uuid) => uuid !== '') };
        case 'toggle':
            return { ...fresh, events: eventsOf(TOGGLE_EVENTS, v['events']), enable: indicesOf(v['enable']), disable: indicesOf(v['disable']) };
        case 'suppressWeather':
            break;
    }
    return fresh;
}

/**
 * The persisted effects of an area: each valid one, in order; none when there
 * are none. Dropping a malformed effect renumbers the toggles' targets, as
 * removing it in the panel would.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: narrows persisted area effects from scene-flag JSON
export function parseAreaEffects(v: unknown): readonly AreaEffect[] | undefined {
    const parsed = Array.isArray(v) ? v.map(parseAreaEffect) : [];
    const kept = checkedToggles(parsed.map((effect) => effect ?? newAreaEffect('suppressWeather')));
    const effects = parsed.reduceRight<AreaEffect[]>((all, effect, i) => (effect === null ? withoutEffect(all, i) : all), kept);
    return storedEffects(effects);
}
