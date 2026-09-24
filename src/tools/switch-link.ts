// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What a click with the link tool does. The GM first picks a light switch,
 * then clicks what it controls: a lamp stamp or a room links (or unlinks), and
 * so does a plain Foundry light clicked where no feature is. Clicking another
 * switch picks that one instead. Pure and unit-tested; the Foundry glue finds
 * what lies under the pointer and carries the action out.
 */
import type { SwitchTarget } from './switch-targets';

/** The feature under the pointer: its id, and whether it is a light switch. */
export interface LinkHit {
    readonly id: string;
    readonly isSwitch: boolean;
}

export type LinkAction =
    | { readonly kind: 'select'; readonly switchId: string }
    | { readonly kind: 'toggle'; readonly switchId: string; readonly target: SwitchTarget }
    | { readonly kind: 'none' };

/**
 * The action for a click, given the switch picked so far (or null), the
 * feature under the pointer (or null), and the plain Foundry light there (or
 * null).
 */
export function linkClick(selected: string | null, hit: LinkHit | null, lightId: string | null): LinkAction {
    if (hit?.isSwitch === true) {
        return { kind: 'select', switchId: hit.id };
    }
    if (selected === null) {
        return { kind: 'none' };
    }
    if (hit !== null) {
        return { kind: 'toggle', switchId: selected, target: { kind: 'feature', id: hit.id } };
    }
    return lightId === null ? { kind: 'none' } : { kind: 'toggle', switchId: selected, target: { kind: 'light', id: lightId } };
}
