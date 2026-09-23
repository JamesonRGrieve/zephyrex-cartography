// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { WallDoc } from '../tools/documents';
import { makeHarness } from './test-fakes';

type Harness = ReturnType<typeof makeHarness>;

/** A 100 × 100 square room with its left edge at `x`. */
async function square(h: Harness, x: number): Promise<void> {
    h.c.begin({ type: 'room', floor: 'dirt' }, 'click');
    for (const p of [
        { x, y: 0 },
        { x: x + 100, y: 0 },
        { x: x + 100, y: 100 },
        { x, y: 100 },
    ]) {
        h.c.addPoint(p);
    }
    await h.c.commit();
}

/** The walls currently planned for a room: the last batch created for it. */
function wallsOf(h: Harness, id: string): WallDoc[] {
    const ids = h.c.getFeature(id)?.docs.walls ?? [];
    const all = h.d.walls.flat();
    const issued = all.map((_, i) => `w${i}`);
    return ids.map((wid) => all[issued.indexOf(wid)]).filter((w): w is WallDoc => w !== undefined);
}

const onSharedEdge = (w: WallDoc): boolean => w.a.x === 100 && w.b.x === 100;

describe('rooms sharing a wall', () => {
    it('emit the shared edge once, owned by the earlier room', async () => {
        const h = makeHarness();
        await square(h, 0); // p1
        await square(h, 100); // p2, shares x = 100 with p1
        expect(wallsOf(h, 'p1').filter(onSharedEdge)).toHaveLength(1);
        expect(wallsOf(h, 'p2').filter(onSharedEdge)).toHaveLength(0);
        expect(wallsOf(h, 'p2')).toHaveLength(3);
    });

    it('hand the shared edge to the later room when the owner goes', async () => {
        const h = makeHarness();
        await square(h, 0);
        await square(h, 100);
        await h.c.remove('p1');
        expect(wallsOf(h, 'p2').filter((w) => w.a.x === 100 && w.b.x === 100)).toHaveLength(1);
        expect(wallsOf(h, 'p2')).toHaveLength(4);
    });

    it('make the shared edge a door when either room marks it', async () => {
        const h = makeHarness();
        await square(h, 0);
        await square(h, 100);
        await h.c.toggleDoor('p2', 3); // p2's left edge (100,100) → (100,0)
        const shared = wallsOf(h, 'p1').filter(onSharedEdge);
        expect(shared.map((w) => w.door)).toEqual(['door']);
    });

    it('keep rooms on different levels independent', async () => {
        const h = makeHarness();
        await h.c.addLevel('above', 'Ground');
        await square(h, 0);
        await h.c.addLevel('above', 'Upper');
        await square(h, 100);
        expect(wallsOf(h, 'p2')).toHaveLength(4);
    });
});
