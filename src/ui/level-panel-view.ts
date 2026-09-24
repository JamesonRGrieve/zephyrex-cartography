// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The levels panel: the scene's floors top to bottom. The GM picks the level
 * being edited, renames it and sets its elevation band, adds floors above or
 * below, and removes empty ones. A pure function from a {@link LevelPanel} to
 * elements; unit-tested under happy-dom.
 */
import type { Level, LevelArt, LevelPanel, LevelRow } from '../tools/levels';
import { button, el, labelledInput, pressable, replacePreservingFocus } from './dom';

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
    readonly art: Readonly<Record<keyof LevelArt, string>>;
    /** Formats the browse button's label for one of the images. */
    readonly browse: (image: string) => string;
}

export interface LevelPanelHandlers {
    /** Edit on this level (null: every level). */
    readonly select: (id: string | null) => void;
    readonly add: (position: 'above' | 'below') => void;
    readonly rename: (id: string, name: string) => void;
    readonly setBand: (id: string, bottom: number, top: number) => void;
    readonly setArt: (id: string, art: LevelArt) => void;
    /** Pick one of the level's images with Foundry's file picker. */
    readonly browse: (id: string, image: keyof LevelArt) => void;
    readonly remove: (id: string) => void;
}

const ART_IMAGES: readonly (keyof LevelArt)[] = ['background', 'foreground', 'fog'];

/** A level's image paths, each typed in or browsed for; clearing a path removes the image. */
function artFields(level: Level, labels: LevelPanelLabels, handlers: LevelPanelHandlers): HTMLElement {
    const fields = el('div', 'tw-flex tw-flex-wrap tw-items-center tw-gap-2 tw-w-full');
    for (const image of ART_IMAGES) {
        const path = labelledInput(labels.art[image], 'text', level.art[image] ?? '', `${image}:${level.id}`, (typed) => {
            handlers.setArt(level.id, { ...level.art, [image]: typed.trim() === '' ? null : typed.trim() });
            return true;
        });
        const browse = button('tw-text-xs', '…', `browse-${image}:${level.id}`, () => {
            handlers.browse(level.id, image);
        });
        browse.setAttribute('aria-label', labels.browse(labels.art[image]));
        browse.title = labels.browse(labels.art[image]);
        fields.append(path, browse);
    }
    return fields;
}

function levelRow(row: LevelRow, labels: LevelPanelLabels, handlers: LevelPanelHandlers): HTMLLIElement {
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
        list.append(levelRow(row, labels, handlers));
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
