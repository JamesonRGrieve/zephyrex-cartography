// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What a light switch controls, kept apart from the switch logic so a stamp
 * can carry and parse its targets without depending on it. Pure and
 * unit-tested.
 */
import { isRecord } from './guards';

/** A feature of the scene (a lamp stamp or a room), or a plain Foundry light by id. */
export type SwitchTarget = { readonly kind: 'feature'; readonly id: string } | { readonly kind: 'light'; readonly id: string };

export function sameTarget(a: SwitchTarget, b: SwitchTarget): boolean {
    return a.kind === b.kind && a.id === b.id;
}

/** Link `target` if it is not linked yet, unlink it if it is. */
export function toggleTarget(targets: readonly SwitchTarget[], target: SwitchTarget): SwitchTarget[] {
    return targets.some((t) => sameTarget(t, target)) ? targets.filter((t) => !sameTarget(t, target)) : [...targets, target];
}

// eslint-disable-next-line no-restricted-syntax -- boundary: parses a stamp's persisted switch targets (scene-flag JSON), dropping any malformed entry
export function parseSwitchTargets(v: unknown): SwitchTarget[] {
    if (!Array.isArray(v)) {
        return [];
    }
    return v.flatMap((entry): SwitchTarget[] => {
        if (!isRecord(entry) || typeof entry['id'] !== 'string') {
            return [];
        }
        const { kind, id } = entry;
        return kind === 'feature' || kind === 'light' ? [{ kind, id }] : [];
    });
}
