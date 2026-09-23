// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The interior panel for an enterable stamp: where it leads, and the ways to
 * give it an interior: create a new scene, or link an existing one (including
 * imported ones). A pure function from a {@link SubmapPanel} to elements;
 * unit-tested under happy-dom.
 */
import { button, el, focusKey, replacePreservingFocus } from './dom';

export interface SceneChoice {
    readonly id: string;
    readonly name: string;
}

export interface SubmapPanel {
    readonly stampName: string;
    /** The linked interior's name, or null when the stamp leads nowhere yet. */
    readonly linkedScene: string | null;
    /** Scenes that can be linked (every scene but the current one). */
    readonly scenes: readonly SceneChoice[];
}

export interface SubmapLabels {
    readonly linkedTo: (scene: string) => string;
    readonly notLinked: string;
    readonly createInterior: string;
    readonly linkExisting: string;
    readonly scene: string;
    readonly link: string;
    readonly open: string;
    readonly unlink: string;
    readonly noScenes: string;
}

export interface SubmapHandlers {
    readonly createInterior: () => void;
    readonly link: (sceneId: string) => void;
    readonly open: () => void;
    readonly unlink: () => void;
}

const SCENE_SELECT_ID = 'zc-submap-scene';

function linkExisting(panel: SubmapPanel, labels: SubmapLabels, handlers: SubmapHandlers): HTMLElement {
    const section = el('section', 'tw-flex tw-flex-wrap tw-items-center tw-gap-2');
    section.append(el('h4', 'tw-text-xs tw-font-bold tw-w-full', labels.linkExisting));
    if (panel.scenes.length === 0) {
        section.append(el('p', 'tw-italic tw-text-xs', labels.noScenes));
        return section;
    }
    const label = el('label', 'tw-text-xs', labels.scene);
    label.htmlFor = SCENE_SELECT_ID;
    const select = el('select', 'tw-text-xs');
    select.id = SCENE_SELECT_ID;
    focusKey(select, SCENE_SELECT_ID);
    for (const scene of panel.scenes) {
        const option = el('option', '', scene.name);
        option.value = scene.id;
        select.append(option);
    }
    section.append(
        label,
        select,
        button('tw-text-xs', labels.link, 'link', () => {
            handlers.link(select.value);
        }),
    );
    return section;
}

export function renderSubmapPanel(root: HTMLElement, panel: SubmapPanel, labels: SubmapLabels, handlers: SubmapHandlers): void {
    const heading = el('h3', 'tw-text-sm tw-font-bold', panel.stampName);
    const statusLine = el('p', 'tw-text-xs', panel.linkedScene === null ? labels.notLinked : labels.linkedTo(panel.linkedScene));
    statusLine.setAttribute('role', 'status');
    const actions = el('div', 'tw-flex tw-flex-wrap tw-gap-2');
    if (panel.linkedScene !== null) {
        actions.append(button('tw-text-xs', labels.open, 'open', handlers.open), button('tw-text-xs', labels.unlink, 'unlink', handlers.unlink));
    }
    actions.append(button('tw-text-xs', labels.createInterior, 'create', handlers.createInterior));
    replacePreservingFocus(root, [heading, statusLine, actions, linkExisting(panel, labels, handlers)]);
}
