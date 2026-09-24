// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { catalogStamps } from '../canvas/test-fakes';
import { planDocuments } from './plan';
import { makeStamp } from './stamp';
import { lampVariant, switchOf, switchOn, SWITCH_BLOCKS } from './switches';

const [lightSwitch, lamp, crate] = catalogStamps([
    {
        id: 'switch',
        name: 'Light Switch',
        category: 'Lighting',
        scale: 'interior',
        perspective: 'top-down',
        door: { type: 'door', switch: true },
        variants: [
            { state: 'off', image: 'off.png', width: 20, height: 100, doorState: 'closed' },
            { state: 'on', image: 'on.png', width: 20, height: 100, doorState: 'open' },
        ],
    },
    {
        id: 'lamp',
        name: 'Lamp',
        category: 'Lighting',
        scale: 'interior',
        perspective: 'top-down',
        light: { dim: 4, bright: 2 },
        variants: [
            { state: 'unlit', image: 'unlit.png', width: 100, height: 100, light: null },
            { state: 'lit', image: 'lit.png', width: 100, height: 100 },
        ],
    },
    {
        id: 'crate',
        name: 'Crate',
        category: 'Storage',
        scale: 'interior',
        perspective: 'top-down',
        variants: [{ state: 'shut', image: 'crate.png', width: 100, height: 100 }],
    },
]);

describe('light switches', () => {
    it('are door stamps whose wall blocks nothing, on while their door is open', () => {
        if (!lightSwitch || !lamp) {
            throw new Error('missing fixture');
        }
        const off = switchOf(makeStamp('s', lightSwitch, { stamp: lightSwitch.key, x: 0, y: 0 }, 100));
        const on = switchOf(makeStamp('s', lightSwitch, { stamp: lightSwitch.key, x: 0, y: 0, variant: 1 }, 100));
        expect(off && switchOn(off)).toBe(false);
        expect(on && switchOn(on)).toBe(true);
        expect(off ? planDocuments(off).walls : []).toEqual([expect.objectContaining({ door: 'door', blocks: SWITCH_BLOCKS })]);
        expect(switchOf(makeStamp('l', lamp, { stamp: lamp.key, x: 0, y: 0 }, 100))).toBeNull();
        expect(switchOf(null)).toBeNull();
    });

    it('find a lamp’s lit and unlit variants, and none for a stamp without both', () => {
        expect(lamp ? [lampVariant(lamp, true), lampVariant(lamp, false)] : []).toEqual([1, 0]);
        expect(crate ? lampVariant(crate, true) : 0).toBeNull();
    });
});
