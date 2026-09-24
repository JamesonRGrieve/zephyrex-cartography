// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The levels panel: the scene's floors top to bottom. The GM picks the level
 * being edited, renames it and sets its elevation band and images, adds
 * floors above or below, and removes empty ones. Each level's look (tints,
 * thresholds, placement, visible levels) is a section that opens on demand.
 * A pure function from a {@link LevelPanel} to elements; unit-tested under
 * happy-dom.
 */
import {
    editLevelArt,
    LEVEL_IMAGES,
    PLACEMENT_NUMBERS,
    TEXTURE_FITS,
    THRESHOLD_IMAGES,
    type Level,
    type LevelArt,
    type LevelArtEdit,
    type LevelImage,
    type LevelPanel,
    type LevelRow,
    type PlacementNumber,
    type TextureFit,
    type ThresholdImage,
} from '../tools/levels';
import { button, choice, disclosure, el, labelledCheckbox, labelledInput, pressable, replacePreservingFocus } from './dom';

/** Labels for how Foundry draws a level: named as Foundry's own Level sheet names them where it has a name. */
interface LevelLookLabels {
    /** The section's summary. */
    readonly title: string;
    readonly backgroundColor: string;
    readonly tints: Readonly<Record<LevelImage, string>>;
    readonly thresholds: Readonly<Record<ThresholdImage, string>>;
    readonly fit: string;
    readonly fits: Readonly<Record<TextureFit, string>>;
    readonly placement: Readonly<Record<PlacementNumber, string>>;
    readonly visibleLevels: string;
}

export interface LevelPanelLabels {
    readonly allLevels: string;
    readonly addAbove: string;
    readonly addBelow: string;
    readonly remove: string;
    readonly name: string;
    readonly bottom: string;
    readonly top: string;
    /** Formats a level's feature count. */
    readonly features: (count: number) => string;
    readonly empty: string;
    readonly removeBlocked: string;
    readonly list: string;
    readonly art: Readonly<Record<LevelImage, string>>;
    /** Formats the browse button's label for one of the images. */
    readonly browse: (image: string) => string;
    readonly look: LevelLookLabels;
}

export interface LevelPanelHandlers {
    /** Edit on this level (null: every level). */
    readonly select: (id: string | null) => void;
    readonly add: (position: 'above' | 'below') => void;
    readonly rename: (id: string, name: string) => void;
    readonly setBand: (id: string, bottom: number, top: number) => void;
    readonly setArt: (id: string, art: LevelArt) => void;
    /** Pick one of the level's images with Foundry's file picker. */
    readonly browse: (id: string, image: LevelImage) => void;
    readonly remove: (id: string) => void;
}

/** Apply `edit` to the level's art; false when what was typed is not valid, and the field reverts. */
function applyEdit(level: Level, handlers: LevelPanelHandlers, edit: LevelArtEdit): boolean {
    const next = editLevelArt(level.art, edit);
    if (next !== null) {
        handlers.setArt(level.id, next);
    }
    return next !== null;
}

/** A level's image paths, each typed in or browsed for; clearing a path removes the image. */
function artFields(level: Level, labels: LevelPanelLabels, handlers: LevelPanelHandlers): HTMLElement {
    const fields = el('div', 'tw-flex tw-flex-wrap tw-items-center tw-gap-2 tw-w-full');
    for (const image of LEVEL_IMAGES) {
        const path = labelledInput(labels.art[image], 'text', level.art[image] ?? '', `${image}:${level.id}`, (typed) =>
            applyEdit(level, handlers, { kind: 'image', image, path: typed }),
        );
        const browse = button('tw-text-xs', '…', `browse-${image}:${level.id}`, () => {
            handlers.browse(level.id, image);
        });
        browse.setAttribute('aria-label', labels.browse(labels.art[image]));
        browse.title = labels.browse(labels.art[image]);
        fields.append(path, browse);
    }
    return fields;
}

/**
 * How Foundry draws the level, collapsed until opened: the background colour,
 * each image's tint, the alpha thresholds, where the images sit, and which of
 * the other levels are seen from this one.
 */
function lookSection(level: Level, others: readonly Level[], labels: LevelLookLabels, handlers: LevelPanelHandlers): HTMLElement {
    const { art } = level;
    const edit = (change: LevelArtEdit): boolean => applyEdit(level, handlers, change);
    const key = (field: string): string => `${field}:${level.id}`;
    return disclosure(labels.title, key('look'), [
        labelledInput(labels.backgroundColor, 'color', art.backgroundColor, key('background-color'), (typed) => edit({ kind: 'backgroundColor', typed })),
        ...LEVEL_IMAGES.map((image) =>
            labelledInput(labels.tints[image], 'color', art.tints[image], key(`tint-${image}`), (typed) => edit({ kind: 'tint', image, typed })),
        ),
        ...THRESHOLD_IMAGES.map((image) =>
            labelledInput(labels.thresholds[image], 'number', String(art.alphaThresholds[image]), key(`threshold-${image}`), (typed) =>
                edit({ kind: 'threshold', image, typed }),
            ),
        ),
        choice(
            key('fit'),
            labels.fit,
            TEXTURE_FITS.map((fit) => [fit, labels.fits[fit]] as const),
            art.placement.fit,
            (fit) => {
                edit({ kind: 'fit', fit });
            },
        ),
        ...PLACEMENT_NUMBERS.map((field) =>
            labelledInput(labels.placement[field], 'number', String(art.placement[field]), key(field), (typed) => edit({ kind: 'placement', field, typed })),
        ),
        visibleLevels(level, others, labels, edit),
    ]);
}

/** The other levels, each checked when it is seen from `level`. */
function visibleLevels(level: Level, others: readonly Level[], labels: LevelLookLabels, edit: (change: LevelArtEdit) => boolean): HTMLElement {
    const group = el('fieldset', 'tw-flex tw-flex-wrap tw-gap-2 tw-box-border tw-w-full tw-mx-0');
    group.append(
        el('legend', 'tw-text-xs', labels.visibleLevels),
        ...others.map((other) =>
            labelledCheckbox(other.name, level.art.visibleLevels.includes(other.id), `visible-${other.id}:${level.id}`, (visible) => {
                edit({ kind: 'visible', level: other.id, visible });
            }),
        ),
    );
    return group;
}

function levelRow(row: LevelRow, others: readonly Level[], labels: LevelPanelLabels, handlers: LevelPanelHandlers): HTMLLIElement {
    const { level } = row;
    const item = el('li', 'tw-list-none tw-flex tw-flex-wrap tw-items-center tw-gap-2 tw-p-1');
    const select = pressable('tw-text-xs tw-font-bold', level.name, row.active, `select:${level.id}`, () => {
        handlers.select(level.id);
    });
    const band = (bottom: number, ceiling: number): boolean => {
        const valid = Number.isFinite(bottom) && Number.isFinite(ceiling) && ceiling > bottom;
        if (valid) {
            handlers.setBand(level.id, bottom, ceiling);
        }
        return valid;
    };
    const remove = button('tw-text-xs', labels.remove, `remove:${level.id}`, () => {
        handlers.remove(level.id);
    });
    remove.disabled = !row.removable;
    remove.title = row.removable ? labels.remove : labels.removeBlocked;
    item.append(
        select,
        labelledInput(labels.name, 'text', level.name, `name:${level.id}`, (typed) => {
            const valid = typed.trim() !== '';
            if (valid) {
                handlers.rename(level.id, typed.trim());
            }
            return valid;
        }),
        labelledInput(labels.bottom, 'number', String(level.bottom), `bottom:${level.id}`, (value) =>
            band(value === '' ? Number.NaN : Number(value), level.top),
        ),
        labelledInput(labels.top, 'number', String(level.top), `top:${level.id}`, (value) => band(level.bottom, value === '' ? Number.NaN : Number(value))),
        el('span', 'tw-text-xs', labels.features(row.count)),
        remove,
        artFields(level, labels, handlers),
        lookSection(level, others, labels.look, handlers),
    );
    return item;
}

/** Replace `root`'s contents with the panel for `panel`, keeping keyboard focus in place. */
export function renderLevelPanel(root: HTMLElement, panel: LevelPanel, labels: LevelPanelLabels, handlers: LevelPanelHandlers): void {
    const all = pressable('tw-text-xs', labels.allLevels, panel.allActive, 'select:all', () => {
        handlers.select(null);
    });
    const list = el('ul', 'tw-flex tw-flex-col tw-gap-1 tw-p-0 tw-m-0');
    list.setAttribute('aria-label', labels.list);
    for (const row of panel.rows) {
        const others = panel.rows.map((r) => r.level).filter((level) => level.id !== row.level.id);
        list.append(levelRow(row, others, labels, handlers));
    }
    const actions = el('div', 'tw-flex tw-gap-2');
    actions.append(
        button('tw-text-xs', labels.addAbove, 'add:above', () => {
            handlers.add('above');
        }),
        button('tw-text-xs', labels.addBelow, 'add:below', () => {
            handlers.add('below');
        }),
    );
    const body = panel.rows.length > 0 ? list : el('p', 'tw-italic tw-text-xs', labels.empty);
    replacePreservingFocus(root, [all, body, actions]);
}
