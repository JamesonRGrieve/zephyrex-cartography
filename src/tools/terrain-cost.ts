// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Difficult terrain on painted ground: how much a painted area or stroke
 * multiplies the cost of walking across it (mud 2, a thicket 3). Foundry's
 * Modify Movement Cost behaviour takes 0 to 5; 1 is ordinary ground, and an
 * area at 1 carries no cost at all. Pure and unit-tested.
 */

/** Ordinary ground: no cost beyond the distance moved. */
export const NORMAL_COST = 1;

/** The range Foundry's Modify Movement Cost behaviour takes. */
const MIN_COST = 0;
const MAX_COST = 5;

/** What a painted feature carries: its cost, or undefined for ordinary ground (left out of the stored JSON). */
export interface Costed {
    readonly movementCost?: number | undefined;
}

/** A painted feature's movement cost, ordinary ground when it has none. */
export function movementCostOf(feature: Costed): number {
    return feature.movementCost ?? NORMAL_COST;
}

/** A cost Foundry takes, or null for anything else. */
export function validCost(cost: number): number | null {
    return Number.isFinite(cost) && cost >= MIN_COST && cost <= MAX_COST ? cost : null;
}

/** A cost typed into a panel, or null if it is not one Foundry takes. */
export function parseCostInput(typed: string): number | null {
    return typed.trim() === '' ? null : validCost(Number(typed));
}

/** A cost as stored: undefined for ordinary ground, so only real difficulty is kept. */
export function storedCost(cost: number): number | undefined {
    return cost === NORMAL_COST ? undefined : cost;
}

/** The persisted cost of a painted feature: a valid cost, or ordinary ground. */
// eslint-disable-next-line no-restricted-syntax -- boundary: narrows a persisted movement cost from scene-flag JSON
export function parseMovementCost(v: unknown): number | undefined {
    const cost = typeof v === 'number' ? validCost(v) : null;
    return cost === null ? undefined : storedCost(cost);
}
