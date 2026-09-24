// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { linkClick } from './switch-link';

describe('linkClick', () => {
    it('picks a switch, whatever was picked before', () => {
        expect(linkClick(null, { id: 's1', isSwitch: true }, null)).toEqual({ kind: 'select', switchId: 's1' });
        expect(linkClick('s1', { id: 's2', isSwitch: true }, 'L1')).toEqual({ kind: 'select', switchId: 's2' });
    });

    it('does nothing before a switch is picked', () => {
        expect(linkClick(null, { id: 'lamp', isSwitch: false }, null)).toEqual({ kind: 'none' });
        expect(linkClick(null, null, 'L1')).toEqual({ kind: 'none' });
    });

    it('links a feature under the pointer before a plain light there', () => {
        expect(linkClick('s1', { id: 'lamp', isSwitch: false }, 'L1')).toEqual({ kind: 'toggle', switchId: 's1', target: { kind: 'feature', id: 'lamp' } });
    });

    it('links a plain light clicked where no feature is, and ignores empty ground', () => {
        expect(linkClick('s1', null, 'L1')).toEqual({ kind: 'toggle', switchId: 's1', target: { kind: 'light', id: 'L1' } });
        expect(linkClick('s1', null, null)).toEqual({ kind: 'none' });
    });
});
