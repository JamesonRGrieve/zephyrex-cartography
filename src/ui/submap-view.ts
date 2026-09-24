// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The interior panel for an enterable stamp: where it leads, the ways to give
 * it an interior (create a new scene, or link an existing one, imported ones
 * included), and, once linked, how tokens travel through: where they land and
 * whether they snap there, whether players see where it leads, the scene
 * transition and its length, and the question asked first. Or,
 * instead, its floors in this scene: Levels above it, reached by stairs. A
 * pure function from a {@link SubmapPanel} to elements; unit-tested under
 * happy-dom.
 */
import { type SubmapTravel, TRAVEL_PLACEMENTS, type TravelPlacement } from '../tools/documents';
import { validDuration } from '../tools/submap';
import { button, choice, el, focusKey, labelledCheckbox, labelledInput, replacePreservingFocus } from './dom';

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
    /** How tokens travel through the link; shown once there is one. */
    readonly travel: SubmapTravel;
    /** Foundry's scene transitions (`CONFIG.Canvas.sceneTransitions`), by key and name. */
    readonly transitions: readonly (readonly [string, string])[];
    /** The names of the building's floors in this scene, bottom to top; empty for none. */
    readonly floors: readonly string[];
}

interface FloorLabels {
    readonly heading: string;
    readonly count: string;
    readonly add: string;
    readonly remove: string;
    readonly none: string;
    readonly list: (floors: string) => string;
}

interface TravelLabels {
    readonly heading: string;
    readonly placement: string;
    readonly placements: Readonly<Record<TravelPlacement, string>>;
    readonly snap: string;
    readonly revealed: string;
    readonly transition: string;
    readonly noTransition: string;
    readonly duration: string;
    /** The prompt field, with Foundry's placeholders named in its hint. */
    readonly prompt: string;
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
    readonly travel: TravelLabels;
    readonly floors: FloorLabels;
}

export interface SubmapHandlers {
    readonly createInterior: () => void;
    readonly link: (sceneId: string) => void;
    readonly open: () => void;
    readonly unlink: () => void;
    readonly setTravel: (travel: SubmapTravel) => void;
    /** Add this many floors above the building. */
    readonly addFloors: (count: number) => void;
    readonly removeFloors: () => void;
}

/** How many floors a building gets at once, at most. */
const MAX_FLOORS_AT_ONCE = 10;

function floorsSection(panel: SubmapPanel, labels: FloorLabels, handlers: SubmapHandlers): HTMLElement {
    const section = el('section', 'tw-flex tw-flex-wrap tw-items-center tw-gap-2');
    section.append(el('h4', 'tw-text-xs tw-font-bold tw-w-full', labels.heading));
    section.append(el('p', 'tw-text-xs tw-w-full', panel.floors.length === 0 ? labels.none : labels.list(panel.floors.join(', '))));
    let count = 1;
    section.append(
        labelledInput(labels.count, 'number', String(count), 'floor-count', (typed) => {
            const wanted = Number(typed);
            const valid = Number.isInteger(wanted) && wanted >= 1 && wanted <= MAX_FLOORS_AT_ONCE;
            if (valid) {
                count = wanted;
            }
            return valid;
        }),
        button('tw-text-xs', labels.add, 'add-floors', () => {
            handlers.addFloors(count);
        }),
    );
    if (panel.floors.length > 0) {
        section.append(button('tw-text-xs', labels.remove, 'remove-floors', handlers.removeFloors));
    }
    return section;
}

/** The transition select's value standing for "none" (no transition key is empty). */
const NO_TRANSITION = '';

function travelSection(panel: SubmapPanel, labels: TravelLabels, setTravel: (travel: SubmapTravel) => void): HTMLElement {
    const { travel } = panel;
    const section = el('fieldset', 'tw-flex tw-flex-col tw-gap-1');
    section.append(
        el('legend', 'tw-text-xs tw-font-bold', labels.heading),
        choice(
            'zc-travel-placement',
            labels.placement,
            TRAVEL_PLACEMENTS.map((placement) => [placement, labels.placements[placement]] as const),
            travel.placement,
            (placement) => {
                setTravel({ ...travel, placement });
            },
        ),
        labelledCheckbox(labels.snap, travel.snap, 'travel-snap', (snap) => {
            setTravel({ ...travel, snap });
        }),
        labelledCheckbox(labels.revealed, travel.revealed, 'travel-revealed', (revealed) => {
            setTravel({ ...travel, revealed });
        }),
        choice(
            'zc-travel-transition',
            labels.transition,
            [[NO_TRANSITION, labels.noTransition] as const, ...panel.transitions],
            travel.transition ?? NO_TRANSITION,
            (transition) => {
                setTravel({ ...travel, transition: transition === NO_TRANSITION ? null : transition });
            },
        ),
        labelledInput(labels.duration, 'number', String(travel.duration), 'travel-duration', (typed) => {
            const duration = validDuration(Number(typed));
            if (duration !== null) {
                setTravel({ ...travel, duration });
            }
            return duration !== null;
        }),
        labelledInput(labels.prompt, 'text', travel.prompt ?? '', 'travel-prompt', (typed) => {
            setTravel({ ...travel, prompt: typed.trim() === '' ? null : typed });
            return true;
        }),
    );
    return section;
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
    const travel = panel.linkedScene === null ? [] : [travelSection(panel, labels.travel, handlers.setTravel)];
    replacePreservingFocus(root, [
        heading,
        statusLine,
        actions,
        ...travel,
        linkExisting(panel, labels, handlers),
        floorsSection(panel, labels.floors, handlers),
    ]);
}
