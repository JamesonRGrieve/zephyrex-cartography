// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { makeHarness } from './test-fakes';

type Harness = ReturnType<typeof makeHarness>;

async function lake(h: Harness): Promise<void> {
    h.c.begin({ type: 'region', biome: 'water' }, 'click');
    for (const p of [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
    ]) {
        h.c.addPoint(p);
    }
    await h.c.commit();
}

async function swath(h: Harness): Promise<void> {
    h.c.begin({ type: 'stroke', biome: 'forest' }, 'freehand');
    for (const p of [
        { x: 0, y: 200 },
        { x: 50, y: 210 },
        { x: 100, y: 200 },
    ]) {
        h.c.addPoint(p);
    }
    await h.c.commit();
}

describe('terrain as Scene Regions', () => {
    it('plans nothing for terrain while the setting is off', async () => {
        const h = makeHarness();
        await lake(h);
        expect(h.d.regions).toEqual([]);
        expect(h.c.terrainAsRegions).toBe(false);
    });

    it('mirrors existing terrain when turned on, and removes it when turned off', async () => {
        const h = makeHarness();
        await lake(h); // p1
        await swath(h); // p2
        await h.c.setTerrainRegions(true);
        expect(h.d.regions.map((batch) => batch[0]?.label)).toEqual([
            { kind: 'terrain', biome: 'water' },
            { kind: 'terrain', biome: 'forest' },
        ]);
        expect(h.d.regions[0]?.[0]?.teleport).toBeNull();
        expect(h.d.regions[0]?.[0]?.polygon.length).toBeGreaterThan(3);
        expect(h.c.getFeature('p1')?.docs.regions).toEqual(['r0']);
        await h.c.setTerrainRegions(false);
        expect(h.d.deletedIds()).toEqual(['r0', 'r1']);
        expect(h.c.getFeature('p2')?.docs.regions).toEqual([]);
    });

    it('re-syncs only terrain that disagrees with the setting', async () => {
        const h = makeHarness();
        await h.c.setTerrainRegions(true);
        await lake(h); // mirrored on creation
        const batches = h.d.regions.length;
        await h.c.setTerrainRegions(true);
        expect(h.d.regions.length).toBe(batches);
    });

    it('puts a levelled region on its level band', async () => {
        const h = makeHarness();
        await h.c.addLevel('above', 'Ground');
        await h.c.setTerrainRegions(true);
        await lake(h);
        expect(h.d.regions[0]?.[0]).toMatchObject({ level: 'lv1', bottom: 0, top: 10 });
    });
});
