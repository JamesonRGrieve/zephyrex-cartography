// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The zone panel: a zone's name, its shape (Foundry's own region shapes)
 * and that shape's sizes, its rotation, whether Foundry measures it in grid
 * units, and the token it moves with. Named with Foundry's own shape and
 * Region sheet strings. A pure function from the zone's settings and the
 * scene's tokens to elements; unit-tested under happy-dom.
 */
import {
    CONE_CURVATURES,
    type ConeCurvature,
    reshapedZone,
    shapeSizes,
    withCurvature,
    withShapeSize,
    ZONE_SHAPES,
    type ZoneSettings,
    type ZoneShapeKind,
} from '../tools/zone';
import { choice, labelledCheckbox, labelledInput, replacePreservingFocus } from './dom';

/** A token on the scene a zone can move with. */
export interface TokenChoice {
    readonly id: string;
    readonly name: string;
}

export interface ZonePanel {
    readonly settings: ZoneSettings;
    readonly tokens: readonly TokenChoice[];
}

export interface ZoneLabels {
    readonly name: string;
    readonly shape: string;
    readonly shapes: Readonly<Record<ZoneShapeKind, string>>;
    /** A size field's name on a shape of `kind` ("Radius", "X-Size", "Angle"…). */
    readonly size: (kind: ZoneShapeKind, field: string) => string;
    readonly curvature: string;
    readonly curvatures: Readonly<Record<ConeCurvature, string>>;
    readonly rotation: string;
    readonly gridBased: string;
    readonly token: string;
    /** The "no token" choice. */
    readonly none: string;
}

export interface ZoneHandlers {
    /** Apply new settings; false rejects them (the input reverts). */
    readonly set: (settings: ZoneSettings) => boolean;
}

/** Select value standing for "no token" (no real id is empty). */
const NONE = '';

/** One number typed into a field: finite, or null. */
function typedNumber(typed: string): number | null {
    const value = typed.trim() === '' ? Number.NaN : Number(typed);
    return Number.isFinite(value) ? value : null;
}

/** The size inputs of the zone's shape, each rejected (and reverted) when Foundry would not take it. */
function sizeFields(settings: ZoneSettings, labels: ZoneLabels, set: (change: Partial<ZoneSettings>) => boolean): HTMLElement[] {
    const { shape } = settings;
    return Object.entries(shapeSizes(shape)).map(([field, value]) =>
        labelledInput(labels.size(shape.kind, field), 'number', String(value), `zone-${field}`, (typed) => {
            const number = typedNumber(typed);
            const next = number === null ? null : withShapeSize(shape, field, number);
            return next !== null && set({ shape: next });
        }),
    );
}

export function renderZonePanel(root: HTMLElement, panel: ZonePanel, labels: ZoneLabels, handlers: ZoneHandlers): void {
    const { settings } = panel;
    const set = (change: Partial<ZoneSettings>): boolean => handlers.set({ ...settings, ...change });
    const { shape } = settings;
    // A token no longer on the scene stays selectable, so opening the panel never silently detaches the zone.
    const tokens =
        settings.attachedTo === null || panel.tokens.some((t) => t.id === settings.attachedTo)
            ? panel.tokens
            : [...panel.tokens, { id: settings.attachedTo, name: settings.attachedTo }];
    replacePreservingFocus(root, [
        labelledInput(labels.name, 'text', settings.name, 'zone-name', (typed) => set({ name: typed.trim() })),
        choice(
            'zc-zone-shape',
            labels.shape,
            ZONE_SHAPES.map((kind) => [kind, labels.shapes[kind]] as const),
            shape.kind,
            (kind) => {
                set({ shape: reshapedZone(kind, shape) });
            },
        ),
        ...sizeFields(settings, labels, set),
        ...(shape.kind === 'cone'
            ? [
                  choice(
                      'zc-zone-curvature',
                      labels.curvature,
                      CONE_CURVATURES.map((curvature) => [curvature, labels.curvatures[curvature]] as const),
                      shape.curvature,
                      (curvature) => {
                          set({ shape: withCurvature(shape, curvature) });
                      },
                  ),
              ]
            : []),
        labelledInput(labels.rotation, 'number', String(settings.rotation), 'zone-rotation', (typed) => {
            const rotation = typedNumber(typed);
            return rotation !== null && set({ rotation });
        }),
        labelledCheckbox(labels.gridBased, settings.gridBased, 'zone-grid-based', (gridBased) => {
            set({ gridBased });
        }),
        choice(
            'zc-zone-token',
            labels.token,
            [[NONE, labels.none] as const, ...tokens.map((t) => [t.id, t.name] as const)],
            settings.attachedTo ?? NONE,
            (token) => {
                set({ attachedTo: token === NONE ? null : token });
            },
        ),
    ]);
}
