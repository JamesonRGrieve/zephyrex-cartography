// SPDX-License-Identifier: AGPL-3.0-or-later
/** Foundry localisation, falling back to the raw key before i18n is ready. */

export function localize(key: string): string {
    return game.i18n?.localize(key) ?? key;
}

export function format(key: string, data: Record<string, string>): string {
    return game.i18n?.format(key, data) ?? key;
}
