// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Hosts the stamp browser view in a Foundry ApplicationV2 window. The window
 * owns only the browser state. Each action is reduced and the view re-rendered
 * in place, without a full application re-render. Filtering, selection and
 * variants live in the pure `stamps/browser` reducer; the DOM lives in
 * `ui/stamp-browser-view`.
 */
import { MODULE_ID } from '../module-id';
import { browserView, INITIAL_BROWSER, reduceBrowser, variantFor, type BrowserState } from '../stamps/browser';
import type { CatalogStamp } from '../stamps/catalog';
import { renderBrowser, type BrowserLabels } from '../ui/stamp-browser-view';

/** The stamp armed for click-to-place, as the browser currently shows it. */
export interface ArmedStamp {
    readonly stamp: string;
    readonly variant: number;
    readonly rotation: number;
}

export interface StampBrowserDeps {
    readonly title: () => string;
    readonly catalog: () => readonly CatalogStamp[];
    readonly labels: () => BrowserLabels;
    /** Place a stamp at the centre of the current view. */
    readonly placeAtViewCentre: (armed: ArmedStamp) => void;
}

export interface StampBrowser {
    open: () => void;
    /** The selected stamp and variant with the current rotation, or null. */
    armed: () => ArmedStamp | null;
}

const BROWSER_WIDTH = 820;
const BROWSER_HEIGHT = 620;

export function createStampBrowser(deps: StampBrowserDeps): StampBrowser {
    let state: BrowserState = INITIAL_BROWSER;
    const root = document.createElement('div');
    root.className = 'tw-flex tw-flex-col tw-h-full';

    const render = (): void => {
        renderBrowser(root, browserView(deps.catalog(), state), deps.labels(), {
            dispatch: (action) => {
                state = reduceBrowser(state, action);
                render();
            },
            place: (stamp, variant) => {
                deps.placeAtViewCentre({ stamp, variant, rotation: state.rotation });
            },
        });
    };

    class StampBrowserApplication extends foundry.applications.api.ApplicationV2 {
        static override DEFAULT_OPTIONS = {
            id: `${MODULE_ID}-stamp-browser`,
            classes: [MODULE_ID],
            window: { title: deps.title(), resizable: true },
            position: { width: BROWSER_WIDTH, height: BROWSER_HEIGHT },
        };

        protected override _renderHTML(): HTMLElement {
            render();
            return root;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 passes _renderHTML's result back as unknown; it is always our root element
        protected override _replaceHTML(result: unknown, content: HTMLElement): void {
            if (result instanceof HTMLElement && result.parentElement !== content) {
                content.replaceChildren(result);
            }
        }
    }

    let app: StampBrowserApplication | null = null;
    return {
        open: (): void => {
            app ??= new StampBrowserApplication();
            void app.render({ force: true });
        },
        armed: (): ArmedStamp | null => {
            const stamp = deps.catalog().find((s) => s.key === state.selected);
            return stamp ? { stamp: stamp.key, variant: variantFor(state, stamp), rotation: state.rotation } : null;
        },
    };
}
