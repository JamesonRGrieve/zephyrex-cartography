// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Hosts one of the plugin's DOM views in a Foundry ApplicationV2 window. The
 * view renders itself into a root element the window owns; `refresh`
 * re-renders it in place without a full application re-render, and does
 * nothing while the window is closed.
 */
import { MODULE_ID } from '../module-id';

export interface ViewWindowOptions {
    /** Suffix of the window's element id. */
    readonly id: string;
    readonly title: () => string;
    readonly width: number;
    readonly height: number;
    /** Render the view into `root`, replacing what is there. */
    readonly render: (root: HTMLElement) => void;
}

export interface ViewWindow {
    open: () => void;
    refresh: () => void;
}

export function createViewWindow(options: ViewWindowOptions): ViewWindow {
    const root = document.createElement('div');
    root.className = 'tw-flex tw-flex-col tw-h-full tw-gap-2';

    class ViewApplication extends foundry.applications.api.ApplicationV2 {
        static override DEFAULT_OPTIONS = {
            id: `${MODULE_ID}-${options.id}`,
            classes: [MODULE_ID],
            window: { title: options.title(), resizable: true },
            position: { width: options.width, height: options.height },
        };

        protected override _renderHTML(): HTMLElement {
            options.render(root);
            return root;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 passes _renderHTML's result back as unknown; it is always our root element
        protected override _replaceHTML(result: unknown, content: HTMLElement): void {
            if (result instanceof HTMLElement && result.parentElement !== content) {
                content.replaceChildren(result);
            }
        }
    }

    let app: ViewApplication | null = null;
    return {
        open: (): void => {
            app ??= new ViewApplication();
            void app.render({ force: true });
        },
        refresh: (): void => {
            if (app?.rendered === true) {
                options.render(root);
            }
        },
    };
}

export interface SettingsWindowOptions<S> extends Omit<ViewWindowOptions, 'render'> {
    readonly initial: S;
    /** Runs after every choice, to put it in the tool's hand. */
    readonly onChange: (settings: S) => void;
    /** Render the view for `settings`; `choose` applies a new choice and re-renders. */
    readonly render: (root: HTMLElement, settings: S, choose: (settings: S) => void) => void;
}

export interface SettingsWindow<S> extends ViewWindow {
    readonly current: () => S;
}

/** A window over a tool's settings: it holds the current choice, which the tool reads when it next draws. */
export function createSettingsWindow<S>(options: SettingsWindowOptions<S>): SettingsWindow<S> {
    let settings = options.initial;
    const choose = (next: S): void => {
        settings = next;
        options.onChange(settings);
        view.refresh();
    };
    const view = createViewWindow({
        ...options,
        render: (root) => {
            options.render(root, settings, choose);
        },
    });
    return { ...view, current: () => settings };
}
