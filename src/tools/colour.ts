// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Colours as the engine holds them (a 0xRRGGBB number, as PIXI takes them)
 * and as a colour input shows them (`#rrggbb`). Pure and unit-tested.
 */

const RGB_MAX = 0xffffff;

const HEX_DIGITS = 6;

const CSS_HEX = /^#[0-9a-f]{6}$/iu;

/** `0x2f5d7c` → `#2f5d7c`. */
export function cssHex(colour: number): string {
    return `#${(Math.round(colour) & RGB_MAX).toString(16).padStart(HEX_DIGITS, '0')}`;
}

/** `#2f5d7c` → `0x2f5d7c`, or null for anything that is not a six-digit hex colour. */
export function parseCssHex(css: string): number | null {
    return CSS_HEX.test(css) ? Number.parseInt(css.slice(1), 16) : null;
}
