// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The map label panel: its text, font size, colour and font (from the fonts
 * Foundry knows), its rotation, and whether only the GM sees it. Named with
 * Foundry's own Drawing sheet strings where it has them. A pure function
 * from the label's settings to elements; unit-tested under happy-dom.
 */
import { type LabelSettings, validFontSize } from '../tools/label';
import { choice, labelledCheckbox, labelledInput, labelledTextArea, replacePreservingFocus } from './dom';

export interface LabelPanel {
    readonly settings: LabelSettings;
    /** The font families Foundry knows. */
    readonly fonts: readonly string[];
}

export interface LabelLabels {
    readonly text: string;
    readonly fontSize: string;
    readonly colour: string;
    readonly fontFamily: string;
    /** The "Foundry's default font" choice. */
    readonly defaultFont: string;
    readonly rotation: string;
    readonly hidden: string;
}

/** Lines of the text box. */
const TEXT_ROWS = 2;

/** Select value standing for Foundry's default font (no real family is empty). */
const DEFAULT_FONT = '';

export function renderLabelPanel(root: HTMLElement, panel: LabelPanel, labels: LabelLabels, set: (settings: LabelSettings) => void): void {
    const { settings } = panel;
    // A font Foundry no longer knows stays selectable, so opening the panel never silently changes the label.
    const fonts = settings.fontFamily === DEFAULT_FONT || panel.fonts.includes(settings.fontFamily) ? panel.fonts : [...panel.fonts, settings.fontFamily];
    replacePreservingFocus(root, [
        labelledTextArea(labels.text, settings.text, 'label-text', TEXT_ROWS, (text) => {
            set({ ...settings, text });
        }),
        labelledInput(labels.fontSize, 'number', String(settings.fontSize), 'label-font-size', (typed) => {
            const size = validFontSize(typed.trim() === '' ? Number.NaN : Number(typed));
            if (size !== null) {
                set({ ...settings, fontSize: size });
            }
            return size !== null;
        }),
        labelledInput(labels.colour, 'color', settings.colour, 'label-colour', (colour) => {
            set({ ...settings, colour: colour.toLowerCase() });
            return true;
        }),
        choice(
            'zc-label-font',
            labels.fontFamily,
            [[DEFAULT_FONT, labels.defaultFont] as const, ...fonts.map((font) => [font, font] as const)],
            settings.fontFamily,
            (fontFamily) => {
                set({ ...settings, fontFamily });
            },
        ),
        labelledInput(labels.rotation, 'number', String(settings.rotation), 'label-rotation', (typed) => {
            const rotation = typed.trim() === '' ? Number.NaN : Number(typed);
            if (Number.isFinite(rotation)) {
                set({ ...settings, rotation });
            }
            return Number.isFinite(rotation);
        }),
        labelledCheckbox(labels.hidden, settings.hidden, 'label-hidden', (hidden) => {
            set({ ...settings, hidden });
        }),
    ]);
}
