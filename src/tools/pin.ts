// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Map pins: a point on the map realised as a native Note, with its text, the
 * journal page it opens, its icon and whether everyone sees it. The pin owns
 * its Note like any feature its documents, so moving, undoing and erasing it
 * follow the usual rules. Pure and unit-tested.
 */
import type { Point } from '../geometry/spline';
import { NEW_FEATURE, parseFeatureCommon, type FeatureCommon } from './feature-common';
import { isPoint, isRecord, stringOrNull } from './guards';

/** What a pin shows and opens. */
export interface PinSettings {
    readonly text: string;
    /** The JournalEntry it opens, by id, and the page within it; null for none. */
    readonly entry: string | null;
    readonly page: string | null;
    /** The icon's image path; null for Foundry's own. */
    readonly icon: string | null;
    /** Shown to everyone whatever their tokens see. */
    readonly global: boolean;
}

export const NEW_PIN: PinSettings = { text: '', entry: null, page: null, icon: null, global: false };

/** A pin; its one point is where it stands. */
export interface PinFeature extends FeatureCommon, PinSettings {
    readonly type: 'pin';
}

/** How near (scene px) a click must be to pick a pin. */
export const PIN_HIT_RADIUS = 24;

export function makePin(id: string, at: Point, settings: PinSettings = NEW_PIN): PinFeature {
    return { type: 'pin', id, points: [{ x: at.x, y: at.y }], ...settings, ...NEW_FEATURE };
}

/** Where the pin stands. */
export function pinPoint(pin: PinFeature): Point {
    return pin.points[0] ?? { x: 0, y: 0 };
}

/** What `pin` shows and opens. */
export function pinSettingsOf(pin: PinFeature): PinSettings {
    return { text: pin.text, entry: pin.entry, page: pin.page, icon: pin.icon, global: pin.global };
}

/** The same pin showing and opening something else; a page only stands with its entry. */
export function withPinSettings(pin: PinFeature, settings: PinSettings): PinFeature {
    return { ...pin, ...settings, page: settings.entry === null ? null : settings.page };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: parses one untyped scene-flag entry, validating shape and returning a narrow PinFeature or null
export function parsePin(v: unknown): PinFeature | null {
    if (!isRecord(v) || v['type'] !== 'pin' || typeof v['id'] !== 'string' || !Array.isArray(v['points'])) {
        return null;
    }
    const [at] = v['points'].filter(isPoint);
    if (at === undefined) {
        return null;
    }
    const pin = withPinSettings(makePin(v['id'], at), {
        text: typeof v['text'] === 'string' ? v['text'] : '',
        entry: stringOrNull(v['entry']),
        page: stringOrNull(v['page']),
        icon: stringOrNull(v['icon']),
        global: v['global'] === true,
    });
    return { ...pin, ...parseFeatureCommon(v) };
}
