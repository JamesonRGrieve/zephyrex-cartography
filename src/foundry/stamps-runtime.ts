// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Foundry wiring for the stamp engine: pack loading, the stamp settings, the
 * browser window, canvas drops, the tile HUD variant bar, and adopting GM edits
 * to stamp tiles. Every decision is delegated to the controller and the pure
 * stamp core; this only translates Foundry events into controller calls.
 */
import type { CartographyController, StampCatalog } from '../canvas/controller';
import type { Point } from '../geometry/spline';
import { I18N } from '../i18n';
import { MODULE_ID } from '../module-id';
import { type CatalogStamp, loadPacks, resolveVariant } from '../stamps/catalog';
import { parseStampDrop } from '../stamps/drop';
import { isRecord, stringOrNull } from '../tools/guards';
import type { BrowserLabels } from '../ui/stamp-browser-view';
import { fetchPacks } from './packs';
import { type ArmedStamp, createStampBrowser } from './stamp-browser';

const SNAP_SETTING = 'stampSnap';
const SCALE_SETTING = 'stampScale';

/** Range of the stamp scale setting slider. */
const SCALE_RANGE = { min: 0.25, max: 4, step: 0.05 } as const;

declare global {
    interface SettingConfig {
        'zephyrex-cartography.stampSnap': boolean;
        'zephyrex-cartography.stampScale': number;
    }
}

export interface StampRuntime {
    readonly catalog: StampCatalog;
    /** Open the stamp browser window. */
    readonly openBrowser: () => void;
    /** Place the stamp selected in the browser at a world point. */
    readonly placeArmedAt: (point: Point) => void;
}

function localize(key: string): string {
    return game.i18n?.localize(key) ?? key;
}

function format(key: string, data: Record<string, string>): string {
    return game.i18n?.format(key, data) ?? key;
}

function browserLabels(): BrowserLabels {
    const b = I18N.browser;
    return {
        search: localize(b.search),
        scale: localize(b.scale),
        perspective: localize(b.perspective),
        any: localize(b.any),
        all: localize(b.all),
        rotate: localize(b.rotate),
        clearTags: localize(b.clearTags),
        place: localize(b.place),
        variants: localize(b.variants),
        empty: localize(b.empty),
        noSelection: localize(b.noSelection),
        categories: localize(b.categories),
        stamps: localize(b.stamps),
        status: (shown, total) => format(b.status, { shown: String(shown), total: String(total) }),
        cardHint: localize(b.cardHint),
    };
}

function registerSettings(): void {
    game.settings?.register(MODULE_ID, SNAP_SETTING, {
        name: I18N.settings.stampSnapName,
        hint: I18N.settings.stampSnapHint,
        scope: 'client',
        config: true,
        type: Boolean,
        default: true,
    });
    game.settings?.register(MODULE_ID, SCALE_SETTING, {
        name: I18N.settings.stampScaleName,
        hint: I18N.settings.stampScaleHint,
        scope: 'client',
        config: true,
        type: Number,
        default: 1,
        range: { ...SCALE_RANGE },
    });
}

/** The client's placement preferences. */
function placementPrefs(): { snap: boolean; scale: number } {
    const snap = game.settings?.get(MODULE_ID, SNAP_SETTING);
    const scale = game.settings?.get(MODULE_ID, SCALE_SETTING);
    return { snap: snap !== false, scale: typeof scale === 'number' && scale > 0 ? scale : 1 };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: a tile document's flags are arbitrary JSON; reads the owning feature id we wrote
function flaggedFeatureId(flags: unknown): string | null {
    const scoped = isRecord(flags) ? flags[MODULE_ID] : null;
    return isRecord(scoped) ? stringOrNull(scoped['featureId']) : null;
}

/** The feature that generated a tile: from the tile's own flag, else the controller's records. */
// eslint-disable-next-line no-restricted-syntax -- boundary: a tile document's flags are arbitrary JSON, narrowed by flaggedFeatureId
function tileOwner(active: CartographyController, tile: { readonly id: string | null; readonly flags: unknown }): string | null {
    return flaggedFeatureId(tile.flags) ?? (tile.id === null ? null : active.featureForTile(tile.id));
}

export function registerStampRuntime(controller: () => CartographyController | null): StampRuntime {
    let stamps: readonly CatalogStamp[] = [];
    let byKey = new Map<string, CatalogStamp>();

    const place = (armed: ArmedStamp, point: Point): void => {
        const active = controller();
        if (!active || !canvas?.scene) {
            ui.notifications?.warn(localize(I18N.notifications.noScene));
            return;
        }
        void active.placeStamp({ stamp: armed.stamp, variant: armed.variant, rotation: armed.rotation, x: point.x, y: point.y, ...placementPrefs() });
    };

    const browser = createStampBrowser({
        title: () => localize(I18N.browser.title),
        catalog: () => stamps,
        labels: browserLabels,
        placeAtViewCentre: (armed) => {
            const pivot = canvas?.stage?.pivot;
            place(armed, { x: pivot?.x ?? 0, y: pivot?.y ?? 0 });
        },
    });

    Hooks.once('init', registerSettings);

    const loadAllPacks = async (): Promise<void> => {
        const fetched = await fetchPacks();
        const loaded = loadPacks(fetched.sources);
        stamps = loaded.stamps;
        byKey = new Map(stamps.map((s) => [s.key, s]));
        for (const failure of fetched.failures) {
            ui.notifications?.error(format(I18N.notifications.packFetchFailed, { module: failure.moduleId, message: failure.message }));
        }
        for (const error of loaded.errors) {
            console.error(`${MODULE_ID} | stamp pack ${error.moduleId} is invalid`, error.issues);
            ui.notifications?.error(format(I18N.notifications.packInvalid, { module: error.moduleId, count: String(error.issues.length) }));
        }
    };

    Hooks.once('ready', () => {
        void loadAllPacks();
    });

    // Returning false claims the drop; true lets Foundry's own handlers see anything that is not a stamp.
    Hooks.on('dropCanvasData', (_canvas, data) => {
        const drop = parseStampDrop(data);
        if (!drop || typeof data.x !== 'number' || typeof data.y !== 'number') {
            return true;
        }
        place(drop, { x: data.x, y: data.y });
        return false;
    });

    Hooks.on('renderTileHUD', (hud, html) => {
        const active = controller();
        const tile = hud.document;
        const featureId = tile && active ? tileOwner(active, tile) : null;
        const feature = featureId !== null && active ? active.getFeature(featureId) : null;
        const stamp = feature?.type === 'stamp' ? byKey.get(feature.stamp) : undefined;
        const column = html.querySelector('.col.right');
        if (!active || feature?.type !== 'stamp' || !stamp || stamp.variants.length < 2 || !column) {
            return;
        }
        const bar = document.createElement('div');
        bar.className = `${MODULE_ID}-hud-variants`;
        stamp.variants.forEach((variant, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'control-icon';
            button.setAttribute('aria-pressed', String(index === feature.variant));
            button.setAttribute('aria-label', format(I18N.hud.variant, { state: resolveVariant(stamp, index).state }));
            button.title = button.getAttribute('aria-label') ?? '';
            const img = document.createElement('img');
            img.src = variant.image;
            img.alt = '';
            button.append(img);
            const choose = async (): Promise<void> => {
                await active.setStampVariant(feature.id, index);
                await hud.render();
            };
            button.addEventListener('click', (clickEvent) => {
                clickEvent.preventDefault();
                void choose();
            });
            bar.append(button);
        });
        column.append(bar);
    });

    Hooks.on('updateTile', (tile, changed, _options, userId) => {
        const active = controller();
        const moved = ['x', 'y', 'width', 'height', 'rotation'].some((field) => field in changed);
        if (!active || !moved || userId !== game.user?.id) {
            return;
        }
        const featureId = tileOwner(active, tile);
        if (featureId !== null) {
            void active.syncStampFrame(featureId, { x: tile.x, y: tile.y, width: tile.width, height: tile.height, rotation: tile.rotation });
        }
    });

    Hooks.on('deleteTile', (tile, _options, userId) => {
        const active = controller();
        if (!active || userId !== game.user?.id) {
            return;
        }
        // A GM deleting a stamp's tile deletes the stamp (and its other documents) too.
        const featureId = tile.id === null ? null : active.featureForTile(tile.id);
        if (featureId !== null) {
            void active.remove(featureId);
        }
    });

    return {
        catalog: { get: (key) => byKey.get(key) ?? null },
        openBrowser: browser.open,
        placeArmedAt: (point) => {
            const armed = browser.armed();
            if (armed) {
                place(armed, point);
            } else {
                ui.notifications?.info(localize(I18N.notifications.noArmedStamp));
            }
        },
    };
}
