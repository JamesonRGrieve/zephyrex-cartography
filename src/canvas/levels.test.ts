// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { catalogStamps, makeHarness } from './test-fakes';

const stairs = catalogStamps([
    {
        id: 'stairs',
        name: 'Stairs',
        category: 'Access',
        scale: 'interior',
        perspective: 'top-down',
        transition: { kind: 'stairs', direction: 'up' },
        variants: [{ state: 'stone', image: 'stairs.png', width: 100, height: 100 }],
    },
    {
        id: 'well',
        name: 'Stairwell',
        category: 'Access',
        scale: 'interior',
        perspective: 'top-down',
        transition: { kind: 'stairs', direction: 'both' },
        variants: [{ state: 'stone', image: 'well.png', width: 100, height: 100 }],
    },
]);

async function drawRoom(c: ReturnType<typeof makeHarness>['c']): Promise<void> {
    c.begin({ type: 'room', floor: 'dirt' }, 'click');
    for (const p of [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
    ]) {
        c.addPoint(p);
    }
    await c.commit();
}

describe('CartographyController levels', () => {
    it('adds levels at the level height it is given', async () => {
        const { c } = makeHarness();
        c.levelHeight = 20;
        await c.addLevel('above', 'Ground');
        await c.addLevel('above', 'Upper');
        expect(c.levels.map((l) => [l.bottom, l.top])).toEqual([
            [0, 20],
            [20, 40],
        ]);
    });

    it('adds levels above and below, making each active', async () => {
        const { c } = makeHarness();
        const ground = await c.addLevel('above', 'Ground');
        const upper = await c.addLevel('above', 'Upper');
        const cellar = await c.addLevel('below', 'Cellar');
        expect(c.levels.map((l) => [l.name, l.bottom, l.top])).toEqual([
            ['Cellar', -10, 0],
            ['Ground', 0, 10],
            ['Upper', 10, 20],
        ]);
        expect([ground, upper, cellar]).toEqual(['lv1', 'lv2', 'lv3']);
        expect(c.activeLevel).toBe('lv3');
    });

    it('puts new features on the active level, at its elevation', async () => {
        const { c, d } = makeHarness();
        await c.addLevel('above', 'Ground');
        await c.addLevel('above', 'Upper');
        await drawRoom(c); // on Upper (lv2)
        expect(c.getFeature('p1')?.level).toBe('lv2');
        expect(d.walls[0]?.every((w) => w.level === 'lv2')).toBe(true);
        expect(d.lights[0]?.[0]?.elevation).toBe(10);
        expect(c.levelCounts()).toEqual({ lv2: 1 });
    });

    it('shows and picks only the active level, plus level-less features', async () => {
        const { c, r } = makeHarness();
        await drawRoom(c); // p1, no level
        await c.addLevel('above', 'Ground'); // active lv1
        await drawRoom(c); // p2 on lv1
        await c.addLevel('above', 'Upper'); // active lv2
        r.setIds.length = 0;
        c.setActiveLevel('lv2');
        expect(r.setIds).toEqual(['p1']);
        expect(c.hitTest({ x: 90, y: 10 })).toBe('p1');
        c.setActiveLevel('lv1');
        expect(c.hitTest({ x: 90, y: 10 })).toBe('p2');
        c.setActiveLevel(null);
        expect(r.setIds.slice(-2)).toEqual(['p1', 'p2']);
        c.setActiveLevel('missing');
        expect(c.activeLevel).toBeNull();
    });

    it('drops the features of a level deleted outside the plugin, from the scene and the undo history', async () => {
        const { c, l, s } = makeHarness();
        await drawRoom(c); // p1, no level
        await c.addLevel('above', 'Ground');
        await drawRoom(c); // p2 on lv1
        await c.addLevel('above', 'Upper');
        await drawRoom(c); // p3 on lv2
        // A GM deletes Ground natively; Foundry deletes its documents with it.
        await l.remove('lv1');
        await c.reloadLevels();
        expect(s.last().map((f) => f.id)).toEqual(['p1', 'p3']);
        expect(c.getFeature('p2')).toBeNull();
        await c.undo(); // takes back p3, and cannot bring p2 back onto the missing level
        expect(s.last().map((f) => f.id)).toEqual(['p1']);
        await c.undo();
        expect(s.last().map((f) => f.id)).toEqual(['p1']);
    });

    it('refuses to remove a level with features on it', async () => {
        const { c } = makeHarness();
        await c.addLevel('above', 'Ground');
        await drawRoom(c);
        expect(await c.removeLevel('lv1')).toBe(false);
        await c.remove('p1');
        expect(await c.removeLevel('lv1')).toBe(true);
        expect(c.levels).toEqual([]);
        expect(c.activeLevel).toBeNull();
    });

    it('renames, re-bands (re-syncing what sits on the level) and rejects inverted bands', async () => {
        const { c, d } = makeHarness();
        await c.addLevel('above', 'Ground');
        await drawRoom(c);
        await c.renameLevel('lv1', '  Hall  ');
        await c.renameLevel('lv1', ' ');
        expect(c.levels[0]?.name).toBe('Hall');
        expect(await c.setLevelBand('lv1', 5, 15)).toBe(true);
        expect(d.lights[d.lights.length - 1]?.[0]?.elevation).toBe(5);
        expect(await c.setLevelBand('lv1', 15, 5)).toBe(false);
        expect(await c.setLevelBand('nope', 0, 5)).toBe(false);
    });

    it('connects a stair to the level above with paired teleport regions', async () => {
        const { c, d } = makeHarness(stairs);
        c.grid = { size: 100, originX: 0, originY: 0 };
        await c.addLevel('above', 'Ground');
        await c.addLevel('above', 'Upper');
        c.setActiveLevel('lv1');
        await c.placeStamp({ stamp: 'pack:stairs', x: 50, y: 50 });
        const [start, end] = d.regions[0] ?? [];
        expect(start).toMatchObject({
            level: 'lv1',
            bottom: 0,
            top: 10,
            teleport: { targets: [{ plan: 1 }] },
            label: { kind: 'stairs', from: 'Ground', to: ['Upper'] },
        });
        expect(end).toMatchObject({ level: 'lv2', bottom: 10, top: 20, teleport: { targets: [{ plan: 0 }] } });
        expect(start?.polygon).toEqual(end?.polygon);
        expect(c.getFeature('p1')?.docs.regions).toEqual(['r0', 'r1']);
    });

    it('plans no regions for a stair with nowhere to go, and adds them when a level appears', async () => {
        const { c, d } = makeHarness(stairs);
        await c.addLevel('above', 'Ground');
        await c.placeStamp({ stamp: 'pack:stairs', x: 50, y: 50 });
        expect(d.regions).toEqual([]);
        await c.addLevel('above', 'Upper');
        expect(d.regions[0]?.map((r) => r.level)).toEqual(['lv1', 'lv2']);
    });

    it('offers both ways from a stairwell', async () => {
        const { c, d } = makeHarness(stairs);
        await c.addLevel('above', 'Ground');
        await c.addLevel('above', 'Upper');
        await c.addLevel('below', 'Cellar');
        c.setActiveLevel('lv1');
        await c.placeStamp({ stamp: 'pack:well', x: 50, y: 50 });
        const regions = d.regions[d.regions.length - 1] ?? [];
        expect(regions.map((r) => r.level)).toEqual(['lv1', 'lv2', 'lv3']);
        expect(regions[0]?.teleport).toEqual({ targets: [{ plan: 1 }, { plan: 2 }] });
    });
});
