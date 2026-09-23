// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { snapToGrid } from './snap';

describe('snapToGrid', () => {
    const grid = { size: 100, originX: 0, originY: 0 };

    it('snaps to the nearest grid intersection', () => {
        expect(snapToGrid({ x: 140, y: 260 }, grid)).toEqual({ x: 100, y: 300 });
        expect(snapToGrid({ x: 51, y: 49 }, grid)).toEqual({ x: 100, y: 0 });
    });

    it('respects a non-zero grid origin', () => {
        expect(snapToGrid({ x: 55, y: 55 }, { size: 100, originX: 10, originY: 10 })).toEqual({ x: 10, y: 10 });
    });

    it('is a no-op for a non-positive size', () => {
        expect(snapToGrid({ x: 3, y: 7 }, { size: 0, originX: 0, originY: 0 })).toEqual({ x: 3, y: 7 });
    });
});
