// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A size typed into a tool panel (a brush size, a path width), in scene px.
 * One rule for every such input, so the panels and their stories agree on
 * what they accept. Pure and unit-tested.
 */

/** The smallest size a panel accepts: anything thinner does not show. */
export const MIN_SIZE_PX = 1;

/** The largest size a panel accepts, well past any real brush or river. */
export const MAX_SIZE_PX = 5000;

/** The size typed, or null if it is not a number in range. */
export function parseSizePx(typed: string): number | null {
    const size = Number(typed);
    return typed.trim() !== '' && Number.isFinite(size) && size >= MIN_SIZE_PX && size <= MAX_SIZE_PX ? size : null;
}
