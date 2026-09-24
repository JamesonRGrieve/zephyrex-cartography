// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { cssHex, parseCssHex, tintToward } from './colour';

describe('colours', () => {
    it('writes a colour as a padded #rrggbb', () => {
        expect(cssHex(0x2f5d7c)).toBe('#2f5d7c');
        expect(cssHex(0x0000ff)).toBe('#0000ff');
        expect(cssHex(0)).toBe('#000000');
    });

    it('tints toward a colour by a strength, from white to the colour itself', () => {
        expect(tintToward(0x2f5d7c, 0)).toBe(0xffffff);
        expect(tintToward(0x2f5d7c, 1)).toBe(0x2f5d7c);
        expect(tintToward(0x000000, 0.5)).toBe(0x808080);
        expect(tintToward(0xff0000, 0.5)).toBe(0xff8080);
    });

    it('reads #rrggbb back, in either case, and refuses anything else', () => {
        expect(parseCssHex('#2F5D7C')).toBe(0x2f5d7c);
        expect(parseCssHex(cssHex(0xc1440e))).toBe(0xc1440e);
        expect(['', '#fff', '2f5d7c', '#2f5d7g', 'red'].map(parseCssHex)).toEqual([null, null, null, null, null]);
    });
});
