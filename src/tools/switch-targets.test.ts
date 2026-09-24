// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { parseSwitchTargets, sameTarget, toggleTarget } from './switch-targets';

describe('switch targets', () => {
    it('are the same only with the same kind and id', () => {
        expect(sameTarget({ kind: 'feature', id: 'a' }, { kind: 'feature', id: 'a' })).toBe(true);
        expect(sameTarget({ kind: 'feature', id: 'a' }, { kind: 'light', id: 'a' })).toBe(false);
        expect(sameTarget({ kind: 'light', id: 'a' }, { kind: 'light', id: 'b' })).toBe(false);
    });

    it('toggle: a new target links, a linked one unlinks', () => {
        const linked = toggleTarget([], { kind: 'feature', id: 'lamp' });
        expect(linked).toEqual([{ kind: 'feature', id: 'lamp' }]);
        const both = toggleTarget(linked, { kind: 'light', id: 'L1' });
        expect(both).toEqual([
            { kind: 'feature', id: 'lamp' },
            { kind: 'light', id: 'L1' },
        ]);
        expect(toggleTarget(both, { kind: 'feature', id: 'lamp' })).toEqual([{ kind: 'light', id: 'L1' }]);
    });

    it('parse persisted targets, dropping malformed entries', () => {
        expect(parseSwitchTargets([{ kind: 'feature', id: 'a' }, { kind: 'light', id: 'b' }, { kind: 'wall', id: 'c' }, { kind: 'light' }, 'x'])).toEqual([
            { kind: 'feature', id: 'a' },
            { kind: 'light', id: 'b' },
        ]);
        expect(parseSwitchTargets(undefined)).toEqual([]);
    });
});
