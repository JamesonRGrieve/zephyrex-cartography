// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The stamp browser's state and view model, as a pure reducer plus a
 * projection. The DOM view renders a {@link BrowserView} and dispatches
 * {@link BrowserAction}s. It holds no logic of its own, so everything the
 * browser does is unit-tested here.
 */
import { buildCategoryTree, type CatalogStamp, clampVariantIndex, filterStamps, tagsForCategory } from './catalog';
import type { Stamp } from './schema';

/** Rotation steps (degrees) the rotate control cycles through. */
const ROTATION_STEPS = [0, 90, 180, 270] as const;

/**
 * Tag prefix marking the setting a stamp suits (`setting-fantasy`, ...). Setting
 * tags are a global filter across every category, not a category's sub-tags.
 */
const SETTING_PREFIX = 'setting-';

function settingOf(tag: string): string | null {
    return tag.startsWith(SETTING_PREFIX) && tag.length > SETTING_PREFIX.length ? tag.slice(SETTING_PREFIX.length) : null;
}

/** A stamp passes when no setting is checked, or when it suits any checked one. */
function suitsSettings(stamp: CatalogStamp, settings: readonly string[]): boolean {
    return (
        settings.length === 0 ||
        stamp.tags.some((tag) => {
            const setting = settingOf(tag);
            return setting !== null && settings.includes(setting);
        })
    );
}

type Scale = Stamp['scale'];
type Perspective = Stamp['perspective'];

export interface BrowserState {
    readonly category: string | null;
    readonly query: string;
    readonly tags: readonly string[];
    /** Checked settings; a stamp shows if it suits any of them (none checked: all show). */
    readonly settings: readonly string[];
    readonly scale: Scale | null;
    readonly perspective: Perspective | null;
    /** Catalog key of the selected (armed) stamp. */
    readonly selected: string | null;
    /** Chosen variant per catalog key. */
    readonly variants: Readonly<Record<string, number>>;
    readonly rotation: number;
}

export const INITIAL_BROWSER: BrowserState = {
    category: null,
    query: '',
    tags: [],
    settings: [],
    scale: null,
    perspective: null,
    selected: null,
    variants: {},
    rotation: 0,
};

export type BrowserAction =
    | { readonly type: 'category'; readonly category: string | null }
    | { readonly type: 'query'; readonly query: string }
    | { readonly type: 'toggleTag'; readonly tag: string }
    | { readonly type: 'clearTags' }
    | { readonly type: 'toggleSetting'; readonly setting: string }
    | { readonly type: 'scale'; readonly scale: Scale | null }
    | { readonly type: 'perspective'; readonly perspective: Perspective | null }
    | { readonly type: 'select'; readonly key: string }
    | { readonly type: 'variant'; readonly key: string; readonly index: number }
    | { readonly type: 'rotate' };

function nextRotation(rotation: number): number {
    const i = ROTATION_STEPS.findIndex((step) => step === rotation);
    return ROTATION_STEPS[(i + 1) % ROTATION_STEPS.length] ?? 0;
}

export function reduceBrowser(state: BrowserState, action: BrowserAction): BrowserState {
    switch (action.type) {
        case 'category':
            return { ...state, category: action.category };
        case 'query':
            return { ...state, query: action.query };
        case 'toggleTag':
            return { ...state, tags: state.tags.includes(action.tag) ? state.tags.filter((t) => t !== action.tag) : [...state.tags, action.tag] };
        case 'clearTags':
            return { ...state, tags: [] };
        case 'toggleSetting':
            return {
                ...state,
                settings: state.settings.includes(action.setting) ? state.settings.filter((s) => s !== action.setting) : [...state.settings, action.setting],
            };
        case 'scale':
            return { ...state, scale: action.scale };
        case 'perspective':
            return { ...state, perspective: action.perspective };
        case 'select':
            return { ...state, selected: action.key };
        case 'variant':
            return { ...state, selected: action.key, variants: { ...state.variants, [action.key]: action.index } };
        case 'rotate':
            return { ...state, rotation: nextRotation(state.rotation) };
        default:
            // Unreachable while the switch is exhaustive; an unknown action from untyped input is ignored.
            return state;
    }
}

interface TagEntry {
    readonly tag: string;
    readonly count: number;
    readonly active: boolean;
}

interface SettingEntry {
    readonly setting: string;
    /** Stamps in the current scale band that suit it. */
    readonly count: number;
    readonly active: boolean;
}

interface CategoryEntry {
    readonly name: string;
    readonly count: number;
    readonly active: boolean;
    readonly tags: readonly TagEntry[];
}

export interface CardEntry {
    readonly stamp: CatalogStamp;
    /** The variant the card shows and places. */
    readonly variant: number;
    readonly selected: boolean;
}

export interface BrowserView {
    readonly total: number;
    /** Stamps in the current scale band that suit the checked settings (what "All" counts). */
    readonly inScale: number;
    readonly categories: readonly CategoryEntry[];
    /** Every setting the stamps in the scale band declare, alphabetically. */
    readonly settings: readonly SettingEntry[];
    readonly cards: readonly CardEntry[];
    readonly activeTags: readonly string[];
    readonly selected: CardEntry | null;
    readonly state: BrowserState;
}

/** Most sub-tags a category lists. */
const MAX_CATEGORY_TAGS = 12;

export function variantFor(state: BrowserState, stamp: CatalogStamp): number {
    return clampVariantIndex(stamp, state.variants[stamp.key] ?? stamp.defaultVariant);
}

function settingEntries(scoped: readonly CatalogStamp[], checked: readonly string[]): SettingEntry[] {
    const counts = new Map<string, number>();
    for (const stamp of scoped) {
        for (const setting of new Set(stamp.tags.map(settingOf))) {
            if (setting !== null) {
                counts.set(setting, (counts.get(setting) ?? 0) + 1);
            }
        }
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([setting, count]) => ({ setting, count, active: checked.includes(setting) }));
}

export function browserView(catalog: readonly CatalogStamp[], state: BrowserState): BrowserView {
    // The scale band regroups the whole browser, not only the grid.
    const scoped = state.scale === null ? catalog : filterStamps(catalog, { scale: state.scale });
    // Checked settings narrow everything below them: category counts, sub-tags and the grid.
    const suited = scoped.filter((stamp) => suitsSettings(stamp, state.settings));
    const categories = buildCategoryTree(suited).map(({ name: category, count }) => ({
        name: category,
        count,
        active: state.category === category,
        tags: tagsForCategory(suited, category)
            .filter(({ tag }) => settingOf(tag) === null)
            .slice(0, MAX_CATEGORY_TAGS)
            .map(({ tag, count: tagCount }) => ({ tag, count: tagCount, active: state.tags.includes(tag) })),
    }));
    const shown = filterStamps(suited, {
        ...(state.category === null ? {} : { category: state.category }),
        ...(state.perspective === null ? {} : { perspective: state.perspective }),
        tags: state.tags,
        query: state.query,
    });
    const card = (stamp: CatalogStamp): CardEntry => ({ stamp, variant: variantFor(state, stamp), selected: stamp.key === state.selected });
    const selectedStamp = catalog.find((stamp) => stamp.key === state.selected);
    return {
        total: catalog.length,
        inScale: suited.length,
        categories,
        settings: settingEntries(scoped, state.settings),
        cards: shown.map(card),
        activeTags: state.tags,
        selected: selectedStamp ? card(selectedStamp) : null,
        state,
    };
}
