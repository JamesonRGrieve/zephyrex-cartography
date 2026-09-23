// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { BIOME_TITLE_KEYS, I18N, I18N_ROOT, TRANSITION_KIND_KEYS } from './i18n';
import en from './static/lang/en.json';

type Tree = string | { readonly [key: string]: Tree };

/** Dotted paths of every string leaf in a localisation tree. */
function leafPaths(node: Tree, prefix: string): string[] {
    if (typeof node === 'string') {
        return [prefix];
    }
    return Object.entries(node).flatMap(([k, v]) => leafPaths(v, `${prefix}.${k}`));
}

/** Every string value in a (possibly nested) key map. */
function leafValues(node: Tree): string[] {
    return typeof node === 'string' ? [node] : Object.values(node).flatMap(leafValues);
}

const langKeys = leafPaths(en[I18N_ROOT], I18N_ROOT).sort();
const codeKeys = [...new Set([...leafValues(I18N), ...Object.values(BIOME_TITLE_KEYS), ...Object.values(TRANSITION_KIND_KEYS)])].sort();

describe('localisation keys', () => {
    it('every key the code uses exists in en.json', () => {
        expect(codeKeys.filter((k) => !langKeys.includes(k))).toEqual([]);
    });

    it('en.json carries no keys the code never uses', () => {
        expect(langKeys.filter((k) => !codeKeys.includes(k))).toEqual([]);
    });
});
