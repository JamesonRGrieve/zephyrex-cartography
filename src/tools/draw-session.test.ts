// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DrawSession } from './draw-session';

describe('DrawSession', () => {
    it('accumulates points', () => {
        const s = new DrawSession('road', 'click');
        s.addPoint({ x: 0, y: 0 });
        s.addPoint({ x: 10, y: 0 });
        expect(s.pointCount).toBe(2);
    });

    it('finalises a click path verbatim', () => {
        const s = new DrawSession('road', 'click');
        s.addPoint({ x: 0, y: 0 });
        s.addPoint({ x: 10, y: 0 });
        s.addPoint({ x: 20, y: 0 });
        const p = s.finalize('id1', 8, true);
        expect(p?.kind).toBe('road');
        expect(p?.points).toHaveLength(3);
        expect(p?.halfWidths).toEqual([8, 8, 8]);
        expect(p?.walls).toBe(true);
    });

    it('simplifies a dense freehand stream', () => {
        const s = new DrawSession('river', 'freehand');
        for (let i = 0; i <= 10; i++) {
            s.addPoint({ x: i, y: 0.01 * (i % 2) });
        }
        const p = s.finalize('id2');
        expect(p).not.toBeNull();
        expect(p?.points.length ?? 99).toBeLessThan(11);
    });

    it('returns null when too short', () => {
        const s = new DrawSession('road', 'click');
        s.addPoint({ x: 0, y: 0 });
        expect(s.finalize('x')).toBeNull();
    });
});
