// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { Brush } from './controller';
import { makeHarness } from './test-fakes';

/** A room (p1), then a painted area (p2). */
async function scene(): Promise<ReturnType<typeof makeHarness>> {
    const h = makeHarness();
    const brushes: Brush[] = [
        { type: 'room', floor: 'dirt' },
        { type: 'region', biome: 'marsh' },
    ];
    await brushes.reduce(async (previous, brush) => {
        await previous;
        h.c.begin(brush, 'click');
        for (const at of [
            { x: 0, y: 0 },
            { x: 200, y: 0 },
            { x: 200, y: 200 },
        ]) {
            h.c.addPoint(at);
        }
        await h.c.commit();
    }, Promise.resolve());
    return h;
}

describe('area settings', () => {
    it('are a room’s or painted ground’s movement cost and effects, and nothing else’s', async () => {
        const { c } = await scene();
        expect(c.areaSettings('p1')).toEqual({ movementCost: 1, effects: [] });
        expect(c.areaSettings('p2')).toEqual({ movementCost: 1, effects: [] });
        expect(c.areaSettings('nope')).toBeNull();
        expect(await c.setAreaSettings('nope', { movementCost: 1, effects: [] })).toBe(false);
    });

    it('re-sync the area’s region when set, stored only when not ordinary, and undo as one step', async () => {
        const { c, d, s } = await scene();
        const dark = { kind: 'darkness', mode: 'darken', modifier: 0.6 } as const;
        expect(await c.setAreaSettings('p1', { movementCost: 2, effects: [dark] })).toBe(true);
        expect(c.areaSettings('p1')).toEqual({ movementCost: 2, effects: [dark] });
        expect(d.regions.flat()).toEqual([
            expect.objectContaining({ label: { kind: 'room' }, behaviour: { kind: 'terrain', difficulties: { walk: 2 } }, effects: [dark] }),
        ]);
        expect(await c.setAreaSettings('p1', { movementCost: 1, effects: [] })).toBe(true);
        const stored = s.last().find((f) => f.id === 'p1');
        expect(stored).not.toHaveProperty('movementCost', 1);
        expect(stored?.type === 'room' ? stored.effects : 'x').toBeUndefined();
        expect(c.getFeature('p1')?.docs.regions).toEqual([]);
        await c.undo();
        expect(c.areaSettings('p1')).toEqual({ movementCost: 2, effects: [dark] });
    });

    it('refuse a movement cost Foundry does not take', async () => {
        const { c } = await scene();
        expect(await c.setAreaSettings('p2', { movementCost: 9, effects: [] })).toBe(false);
        expect(c.areaSettings('p2')?.movementCost).toBe(1);
    });
});
