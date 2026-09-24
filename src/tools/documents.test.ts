// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { senseLevel } from './documents';

describe('sense levels', () => {
    it('reads a pack setting: true blocks, false lets through, a named level stands', () => {
        expect(senseLevel(true)).toBe('normal');
        expect(senseLevel(false)).toBe('none');
        expect(senseLevel('limited')).toBe('limited');
        expect(senseLevel('proximity')).toBe('proximity');
    });
});
