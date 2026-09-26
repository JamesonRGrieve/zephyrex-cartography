// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The stamp browser window. It owns only the browser state: each action is
 * reduced and the view re-rendered in place. Filtering, selection and
 * variants live in the pure `stamps/browser` reducer; the DOM lives in
 * `ui/stamp-browser-view`.
 */
import { browserView, INITIAL_BROWSER, reduceBrowser, variantFor, type BrowserState } from '../stamps/browser';
import type { CatalogStamp } from '../stamps/catalog';
import { renderBrowser, type BrowserLabels } from '../ui/stamp-browser-view';
import { createViewWindow } from './view-window';

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
/** Fixed, so the category list, grid and details scroll inside the window instead of it growing off screen. */
const BROWSER_HEIGHT = 640;

export function createStampBrowser(deps: StampBrowserDeps): StampBrowser {
    let state: BrowserState = INITIAL_BROWSER;
    const render = (root: HTMLElement): void => {
        renderBrowser(root, browserView(deps.catalog(), state), deps.labels(), {
            dispatch: (action) => {
                state = reduceBrowser(state, action);
                render(root);
            },
            place: (stamp, variant) => {
                deps.placeAtViewCentre({ stamp, variant, rotation: state.rotation });
            },
        });
    };
    const browserWindow = createViewWindow({ id: 'stamp-browser', title: deps.title, width: BROWSER_WIDTH, height: BROWSER_HEIGHT, render });
    return {
        open: browserWindow.open,
        armed: (): ArmedStamp | null => {
            const stamp = deps.catalog().find((s) => s.key === state.selected);
            return stamp ? { stamp: stamp.key, variant: variantFor(state, stamp), rotation: state.rotation } : null;
        },
    };
}
