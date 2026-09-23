// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { makeHarness } from './test-fakes';

type Harness = ReturnType<typeof makeHarness>;

async function square(h: Harness, x: number, size: number): Promise<void> {
    h.c.begin({ type: 'room', floor: 'dirt' }, 'click');
    for (const p of [
        { x, y: x },
        { x: x + size, y: x },
        { x: x + size, y: x + size },
        { x, y: x + size },
    ]) {
        h.c.addPoint(p);
    }
    await h.c.commit();
}

describe('CartographyController nested rooms', () => {
    it('draws a room above the room drawn around it later, and picks it first', async () => {
        const h = makeHarness();
        await square(h, 100, 100); // p1: closet, drawn first
        await square(h, 0, 400); // p2: hall around it
        const drawn = h.r.setIds.slice(-2);
        expect(drawn).toEqual(['p2', 'p1']);
        expect(h.c.hitTest({ x: 150, y: 150 })).toBe('p1');
        expect(h.c.hitTest({ x: 350, y: 350 })).toBe('p2');
    });
});
