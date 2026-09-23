// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The map builder panel. Generate a floor plan from a few settings and a seed,
 * or build any scene spec pasted in as JSON. The outcome of the last build,
 * or why a spec was refused, is announced in a live status line. A pure
 * function from the panel state to elements; unit-tested under happy-dom.
 */
import type { GeneratorField, GeneratorForm } from '../generate/form';
import { button, el, focusKey, labelledInput, replacePreservingFocus } from './dom';

export interface GeneratorPanel {
    readonly form: GeneratorForm;
    /** The scene spec JSON being edited. */
    readonly specText: string;
    /** What the last build did, or why it could not run; null before any. */
    readonly status: readonly string[] | null;
    /** A build is in progress: the build buttons are disabled. */
    readonly busy: boolean;
}

export interface GeneratorLabels {
    readonly floorPlan: string;
    readonly seed: string;
    readonly newSeed: string;
    readonly width: string;
    readonly height: string;
    readonly minRoom: string;
    readonly maxRoom: string;
    readonly entrance: string;
    readonly generate: string;
    readonly spec: string;
    readonly buildSpec: string;
}

export interface GeneratorHandlers {
    /** Apply a typed setting; false rejects it (the input reverts). */
    readonly setField: (field: GeneratorField, typed: string) => boolean;
    readonly setEntrance: (on: boolean) => void;
    readonly newSeed: () => void;
    readonly generate: () => void;
    readonly setSpecText: (text: string) => void;
    readonly buildSpec: () => void;
}

const FIELDS: readonly { readonly field: GeneratorField; readonly label: keyof GeneratorLabels }[] = [
    { field: 'width', label: 'width' },
    { field: 'height', label: 'height' },
    { field: 'minRoom', label: 'minRoom' },
    { field: 'maxRoom', label: 'maxRoom' },
];

function section(title: string, children: readonly HTMLElement[]): HTMLElement {
    const fieldset = el('fieldset', 'tw-flex tw-flex-wrap tw-items-center tw-gap-2');
    fieldset.append(el('legend', 'tw-text-xs tw-font-bold', title), ...children);
    return fieldset;
}

function floorPlanSection(panel: GeneratorPanel, labels: GeneratorLabels, handlers: GeneratorHandlers): HTMLElement {
    const { form } = panel;
    const entrance = el('label', 'tw-flex tw-items-center tw-gap-1 tw-text-xs', labels.entrance);
    const checkbox = el('input', '');
    checkbox.type = 'checkbox';
    checkbox.checked = form.entrance;
    focusKey(checkbox, 'entrance');
    checkbox.addEventListener('change', () => {
        handlers.setEntrance(checkbox.checked);
    });
    entrance.prepend(checkbox);
    const generate = button('tw-text-xs', labels.generate, 'generate', handlers.generate);
    generate.disabled = panel.busy;
    return section(labels.floorPlan, [
        labelledInput(labels.seed, 'number', String(form.seed), 'seed', (typed) => handlers.setField('seed', typed)),
        button('tw-text-xs', labels.newSeed, 'new-seed', handlers.newSeed),
        ...FIELDS.map(({ field, label }) => labelledInput(labels[label], 'number', String(form[field]), field, (typed) => handlers.setField(field, typed))),
        entrance,
        generate,
    ]);
}

function specSection(panel: GeneratorPanel, labels: GeneratorLabels, handlers: GeneratorHandlers): HTMLElement {
    const wrap = el('label', 'tw-flex tw-flex-col tw-gap-1 tw-text-xs tw-w-full', labels.spec);
    const area = el('textarea', 'tw-text-xs tw-font-mono tw-w-full');
    area.rows = 6;
    area.spellcheck = false;
    area.value = panel.specText;
    focusKey(area, 'spec');
    area.addEventListener('change', () => {
        handlers.setSpecText(area.value);
    });
    wrap.append(area);
    const build = button('tw-text-xs', labels.buildSpec, 'build-spec', () => {
        handlers.setSpecText(area.value);
        handlers.buildSpec();
    });
    build.disabled = panel.busy;
    return section(labels.spec, [wrap, build]);
}

/** Replace `root`'s contents with the panel, keeping keyboard focus in place. */
export function renderGeneratorPanel(root: HTMLElement, panel: GeneratorPanel, labels: GeneratorLabels, handlers: GeneratorHandlers): void {
    const outcome = el('ul', 'tw-text-xs tw-m-0 tw-p-0 tw-list-none');
    outcome.setAttribute('role', 'status');
    outcome.setAttribute('aria-live', 'polite');
    for (const line of panel.status ?? []) {
        outcome.append(el('li', '', line));
    }
    replacePreservingFocus(root, [floorPlanSection(panel, labels, handlers), specSection(panel, labels, handlers), outcome]);
}
