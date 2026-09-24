// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Small DOM builders shared by the views. Content goes in as text nodes, never
 * markup. Controls carry a focus key so a view can be rebuilt without losing
 * the keyboard user's place.
 */

/** Attribute naming a control so focus can be restored to it after a re-render. */
const FOCUS_ATTR = 'data-zc-focus';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

export function focusKey(node: HTMLElement, key: string): void {
    node.setAttribute(FOCUS_ATTR, key);
}

/** A native button with a label, a click handler and a focus key. */
export function button(className: string, text: string, key: string, onClick: () => void): HTMLButtonElement {
    const node = el('button', className, text);
    node.type = 'button';
    focusKey(node, key);
    node.addEventListener('click', onClick);
    return node;
}

/** A toggle-style button announcing its state via `aria-pressed`. */
export function pressable(className: string, text: string, pressed: boolean, key: string, onClick: () => void): HTMLButtonElement {
    const node = button(className, text, key, onClick);
    node.setAttribute('aria-pressed', String(pressed));
    return node;
}

/**
 * A field row: its label text in the label column, its control beside it
 * (the stylesheet's `zc-field` grid). The label wraps the control, so no id
 * is needed.
 */
function fieldLabel(label: string): HTMLLabelElement {
    const wrap = el('label', 'zc-field');
    wrap.append(el('span', 'zc-field-label', label));
    return wrap;
}

/**
 * A labelled input. `accept` applies a committed value and returns whether it
 * was valid; a rejected value reverts the input.
 */
export function labelledInput(
    label: string,
    type: 'text' | 'number' | 'color',
    value: string,
    key: string,
    accept: (value: string) => boolean,
): HTMLLabelElement {
    const wrap = fieldLabel(label);
    const input = el('input', 'zc-control');
    input.type = type;
    input.value = value;
    focusKey(input, key);
    input.addEventListener('change', () => {
        if (!accept(input.value)) {
            input.value = value;
        }
    });
    wrap.append(input);
    return wrap;
}

/** A labelled monospace text area, full width; `onChange` gets its text once edited. */
export function labelledTextArea(label: string, value: string, key: string, rows: number, onChange: (text: string) => void): HTMLLabelElement {
    return checkedTextArea(label, value, key, rows, (text) => {
        onChange(text);
        return true;
    });
}

/** A labelled monospace text area whose edit `accept` may refuse, putting the text back as it was. */
export function checkedTextArea(label: string, value: string, key: string, rows: number, accept: (text: string) => boolean): HTMLLabelElement {
    const wrap = el('label', 'zc-field zc-field-wide');
    wrap.append(el('span', 'zc-field-label', label));
    const area = el('textarea', 'zc-control tw-font-mono');
    area.rows = rows;
    area.spellcheck = false;
    area.value = value;
    focusKey(area, key);
    area.addEventListener('change', () => {
        if (!accept(area.value)) {
            area.value = value;
        }
    });
    wrap.append(area);
    return wrap;
}

/** A labelled checkbox (the label wraps it); `onChange` gets whether it is now checked. */
export function labelledCheckbox(label: string, checked: boolean, key: string, onChange: (checked: boolean) => void): HTMLLabelElement {
    const wrap = el('label', 'zc-check', label);
    const checkbox = el('input', '');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    focusKey(checkbox, key);
    checkbox.addEventListener('change', () => {
        onChange(checkbox.checked);
    });
    wrap.prepend(checkbox);
    return wrap;
}

/**
 * A labelled select over typed `[value, shown]` entries; `onChange` gets the
 * picked entry's value (never a string the entries do not hold).
 */
export function choice<T extends string>(
    id: string,
    label: string,
    entries: readonly (readonly [T, string])[],
    value: T,
    onChange: (v: T) => void,
): HTMLElement {
    const wrap = el('div', 'zc-field');
    const labelEl = el('label', 'zc-field-label', label);
    labelEl.htmlFor = id;
    const select = el('select', 'zc-control');
    select.id = id;
    focusKey(select, id);
    for (const [option, shown] of entries) {
        const node = el('option', '', shown);
        node.value = option;
        select.append(node);
    }
    select.value = value;
    select.addEventListener('change', () => {
        const picked = entries.find(([option]) => option === select.value);
        if (picked !== undefined) {
            onChange(picked[0]);
        }
    });
    wrap.append(labelEl, select);
    return wrap;
}

/** A field and the button that acts on it (a path and its file picker, a seed and a new one), kept together as one. */
export function fieldWithAction(field: HTMLElement, action: HTMLButtonElement): HTMLElement {
    const pair = el('div', 'zc-inline');
    pair.append(field, action);
    return pair;
}

/** A row of buttons, spaced apart, that wraps onto a new line as a whole when the panel is narrow. */
export function actionRow(buttons: readonly HTMLElement[]): HTMLElement {
    const row = el('div', 'zc-actions');
    row.append(...buttons);
    return row;
}

/** A collapsed section (a native disclosure) whose `summary` opens it; it stays open across re-renders. */
export function disclosure(summary: string, key: string, children: readonly HTMLElement[]): HTMLDetailsElement {
    const details = el('details', 'zc-disclosure');
    focusKey(details, key);
    const body = el('div', 'zc-fields');
    body.append(...children);
    details.append(el('summary', 'zc-disclosure-summary', summary), body);
    return details;
}

/**
 * Replace `root`'s children, returning keyboard focus (and an input's caret)
 * to the control that had it, and reopening the disclosures that were open.
 */
export function replacePreservingFocus(root: HTMLElement, children: readonly HTMLElement[]): void {
    const active = root.ownerDocument.activeElement;
    const focused = active instanceof HTMLElement && root.contains(active) ? active.getAttribute(FOCUS_ATTR) : null;
    const caret = active instanceof HTMLInputElement && active.type !== 'number' ? active.selectionStart : null;
    const opened = new Set([...root.querySelectorAll<HTMLDetailsElement>('details[open]')].map((details) => details.getAttribute(FOCUS_ATTR)));
    root.replaceChildren(...children);
    for (const details of root.querySelectorAll<HTMLDetailsElement>(`details[${FOCUS_ATTR}]`)) {
        details.open = opened.has(details.getAttribute(FOCUS_ATTR));
    }
    if (focused === null) {
        return;
    }
    const target = [...root.querySelectorAll<HTMLElement>(`[${FOCUS_ATTR}]`)].find((node) => node.getAttribute(FOCUS_ATTR) === focused);
    target?.focus();
    if (target instanceof HTMLInputElement && caret !== null) {
        target.setSelectionRange(caret, caret);
    }
}
