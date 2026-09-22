// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DrawSession } from './draw-session';

describe('DrawSession', () => {
    it('accumulates points', () => {
        const s = new DrawSession('click');
        s.addPoint({ x: 0, y: 0 });
        s.addPoint({ x: 1, y: 1 });
        expect(s.pointCount).toBe(2);
    });

    it('returns click points verbatim', () => {
        const s = new DrawSession('click');
        s.addPoint({ x: 0, y: 0 });
        s.addPoint({ x: 5, y: 5 });
        expect(s.simplified()).toHaveLength(2);
    });

    it('simplifies a dense freehand stream', () => {
        const s = new DrawSession('freehand');
        for (let i = 0; i <= 10; i++) {
            s.addPoint({ x: i, y: 0.01 * (i % 2) });
        }
        expect(s.simplified().length).toBeLessThan(11);
    });
});
