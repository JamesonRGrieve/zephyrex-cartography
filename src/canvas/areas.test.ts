// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DEFAULT_AREA_DISPLAY } from '../tools/area-effects';
import type { AreaSettings } from '../tools/areas';
import { NO_SPAWN } from '../tools/spawn';
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

/** An area left as it was drawn. */
const PLAIN: AreaSettings = { movementCost: 1, effects: [], display: DEFAULT_AREA_DISPLAY, spawn: NO_SPAWN };

describe('area settings', () => {
    it('are a room’s or painted ground’s movement cost, effects and region display, and nothing else’s', async () => {
        const { c } = await scene();
        expect(c.areaSettings('p1')).toEqual(PLAIN);
        expect(c.areaSettings('p2')).toEqual(PLAIN);
        expect(c.areaSettings('nope')).toBeNull();
        expect(await c.setAreaSettings('nope', PLAIN)).toBe(false);
    });

    it('re-sync the area’s region when set, stored only when not ordinary, and undo as one step', async () => {
        const { c, d, s } = await scene();
        const dark = { kind: 'darkness', mode: 'darken', modifier: 0.6 } as const;
        expect(await c.setAreaSettings('p1', { ...PLAIN, movementCost: 2, effects: [dark] })).toBe(true);
        expect(c.areaSettings('p1')).toEqual({ ...PLAIN, movementCost: 2, effects: [dark] });
        expect(d.regions.flat()).toEqual([
            expect.objectContaining({ label: { kind: 'room' }, behaviour: { kind: 'terrain', difficulties: { walk: 2 } }, effects: [dark] }),
        ]);
        expect(await c.setAreaSettings('p1', PLAIN)).toBe(true);
        const stored = s.last().find((f) => f.id === 'p1');
        expect(stored).not.toHaveProperty('movementCost', 1);
        expect(stored?.type === 'room' ? [stored.effects, stored.display] : 'x').toEqual([undefined, undefined]);
        expect(c.getFeature('p1')?.docs.regions).toEqual([]);
        await c.undo();
        expect(c.areaSettings('p1')).toEqual({ ...PLAIN, movementCost: 2, effects: [dark] });
    });

    it('give an area its own region for tokens to spawn into, and name that region among a room’s others', async () => {
        const { c } = await scene();
        expect(c.areaRegionId('p2')).toBeNull();
        const spawn = { ...NO_SPAWN, actors: [{ uuid: 'Actor.cultist', count: 2 }] };
        expect(await c.setAreaSettings('p2', { ...PLAIN, spawn })).toBe(true);
        expect(c.areaSettings('p2')?.spawn).toEqual(spawn);
        const painted = c.getFeature('p2')?.docs.regions;
        expect(painted).toHaveLength(1);
        expect(c.areaRegionId('p2')).toBe(painted?.[0]);
        expect(await c.setAreaSettings('p1', { ...PLAIN, spawn })).toBe(true);
        expect(c.areaRegionId('p1')).toBe(c.getFeature('p1')?.docs.regions[0]);
        expect(c.areaRegionId('nope')).toBeNull();
    });

    it('give an area a region of its own for a display of its own alone', async () => {
        const { c, d } = await scene();
        const display = {
            visibility: 'always',
            highlight: 'coverage',
            measurements: true,
            observed: false,
            restriction: { type: 'light', priority: 2 },
        } as const;
        expect(await c.setAreaSettings('p2', { ...PLAIN, display })).toBe(true);
        expect(d.regions.flat()).toEqual([expect.objectContaining({ label: { kind: 'terrain', biome: 'marsh' }, behaviour: null, display })]);
    });

    it('refuse a movement cost Foundry does not take', async () => {
        const { c } = await scene();
        expect(await c.setAreaSettings('p2', { ...PLAIN, movementCost: 9 })).toBe(false);
        expect(c.areaSettings('p2')?.movementCost).toBe(1);
    });
});
