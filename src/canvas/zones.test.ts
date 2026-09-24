// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DEFAULT_AREA_DISPLAY } from '../tools/area-effects';
import { NEW_ZONE } from '../tools/zone';
import { makeHarness } from './test-fakes';

const flamer = {
    name: 'Flamer',
    shape: { kind: 'cone', radius: 300, angle: 60, curvature: 'flat' },
    rotation: 45,
    gridBased: true,
    attachedTo: 'tk1',
} as const;

describe('zones', () => {
    it('place a region in their own shape on the level being edited, moving with their token', async () => {
        const { c, d } = makeHarness();
        await c.addLevel('above', 'Ground');
        c.setActiveLevel('lv1');
        const id = await c.placeZone({ x: 400, y: 300 }, flamer);
        expect(id).not.toBeNull();
        expect(c.zoneSettings(id ?? '')).toEqual(flamer);
        expect(d.regions.flat()).toEqual([
            expect.objectContaining({
                label: { kind: 'zone', title: 'Flamer' },
                level: 'lv1',
                behaviour: null,
                geometry: { kind: 'cone', radius: 300, angle: 60, curvature: 'flat', x: 400, y: 300, rotation: 45, gridBased: true },
                attachedTo: 'tk1',
            }),
        ]);
    });

    it('refuse a shape Foundry would not take', async () => {
        const { c } = makeHarness();
        expect(await c.placeZone({ x: 0, y: 0 }, { ...NEW_ZONE, shape: { kind: 'circle', radius: 0 } })).toBeNull();
        const id = (await c.placeZone({ x: 0, y: 0 })) ?? '';
        expect(await c.setZoneSettings(id, { ...NEW_ZONE, shape: { kind: 'cone', radius: 5, angle: 200, curvature: 'semicircle' } })).toBe(false);
        expect(await c.setZoneSettings('nope', NEW_ZONE)).toBe(false);
        expect(c.zoneSettings('nope')).toBeNull();
    });

    it('re-sync their region when reshaped, and are areas the effects panel edits', async () => {
        const { c, d } = makeHarness();
        const id = (await c.placeZone({ x: 0, y: 0 })) ?? '';
        expect(await c.setZoneSettings(id, { ...NEW_ZONE, shape: { kind: 'rectangle', width: 40, height: 20 } })).toBe(true);
        expect(d.deletedIds()).toEqual(['r0']);
        expect(c.areaSettings(id)).toEqual({ movementCost: 1, effects: [], display: DEFAULT_AREA_DISPLAY });
        expect(await c.setAreaSettings(id, { movementCost: 3, effects: [], display: DEFAULT_AREA_DISPLAY })).toBe(true);
        expect(d.regions.at(-1)).toEqual([expect.objectContaining({ behaviour: { kind: 'terrain', difficulties: { walk: 3 } } })]);
    });

    it('follow their region as Foundry moves it with the token, without recreating it', async () => {
        const { c, d, s } = makeHarness();
        const id = (await c.placeZone({ x: 0, y: 0 }, flamer)) ?? '';
        const writes = d.writes.length;
        expect(await c.followZone('r0', { x: 100, y: 50 }, 90)).toBe(true);
        expect(s.last().find((f) => f.id === id)).toMatchObject({ points: [{ x: 100, y: 50 }], rotation: 90 });
        expect(d.writes.length).toBe(writes);
        // Already there, or not a zone's region.
        expect(await c.followZone('r0', { x: 100, y: 50 }, 90)).toBe(false);
        expect(await c.followZone('nope', { x: 0, y: 0 }, 0)).toBe(false);
    });

    it('are picked by their shape, and moved and erased like any feature', async () => {
        const { c, d } = makeHarness();
        const id = (await c.placeZone({ x: 500, y: 500 })) ?? '';
        expect(c.hitTest({ x: 600, y: 500 })).toBe(id);
        expect(c.hitTest({ x: 700, y: 500 })).toBeNull();
        await c.erase({ x: 500, y: 500 });
        expect(c.getFeature(id)).toBeNull();
        expect(d.deletedIds()).toEqual(['r0']);
    });
});
