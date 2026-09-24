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
 * A labelled input (the label wraps it, so no id is needed). `accept` applies a
 * committed value and returns whether it was valid; a rejected value reverts
 * the input.
 */
export function labelledInput(label: string, type: 'text' | 'number', value: string, key: string, accept: (value: string) => boolean): HTMLLabelElement {
    const wrap = el('label', 'tw-flex tw-items-center tw-gap-1 tw-text-xs', label);
    const input = el('input', 'tw-text-xs tw-w-24');
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
    const wrap = el('div', 'tw-flex tw-items-center tw-gap-2');
    const labelEl = el('label', 'tw-text-xs', label);
    labelEl.htmlFor = id;
    const select = el('select', 'tw-text-xs');
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

/** Replace `root`'s children, returning keyboard focus (and an input's caret) to the control that had it. */
export function replacePreservingFocus(root: HTMLElement, children: readonly HTMLElement[]): void {
    const active = root.ownerDocument.activeElement;
    const focused = active instanceof HTMLElement && root.contains(active) ? active.getAttribute(FOCUS_ATTR) : null;
    const caret = active instanceof HTMLInputElement && active.type !== 'number' ? active.selectionStart : null;
    root.replaceChildren(...children);
    if (focused === null) {
        return;
    }
    const target = [...root.querySelectorAll<HTMLElement>(`[${FOCUS_ATTR}]`)].find((node) => node.getAttribute(FOCUS_ATTR) === focused);
    target?.focus();
    if (target instanceof HTMLInputElement && caret !== null) {
        target.setSelectionRange(caret, caret);
    }
}
