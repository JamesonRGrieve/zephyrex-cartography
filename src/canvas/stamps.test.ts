// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { catalogStamps, FAKE_SILHOUETTE, makeHarness } from './test-fakes';

const stamps = catalogStamps([
    {
        id: 'door',
        name: 'Door',
        category: 'Doors',
        scale: 'interior',
        perspective: 'top-down',
        variants: [
            { state: 'closed', image: 'closed.png', width: 100, height: 100 },
            { state: 'open', image: 'open.png', width: 100, height: 200 },
            { state: 'broken', image: 'broken.png', width: 100, height: 100 },
        ],
    },
]);

const walled = catalogStamps([
    {
        id: 'pillar',
        name: 'Pillar',
        category: 'Structural',
        scale: 'interior',
        perspective: 'top-down',
        occlusion: { shape: 'bounds', sound: false },
        variants: [{ state: 'whole', image: 'pillar.png', width: 100, height: 100 }],
    },
    {
        id: 'statue',
        name: 'Statue',
        category: 'Decor',
        scale: 'interior',
        perspective: 'top-down',
        occlusion: { shape: 'alpha' },
        variants: [
            { state: 'standing', image: 'standing.png', width: 100, height: 100 },
            { state: 'rubble', image: 'rubble.png', width: 100, height: 100, occlusion: { shape: 'none' } },
        ],
    },
]);

describe('CartographyController stamp occlusion', () => {
    it('wraps a bounds stamp in four walls blocking the declared senses', async () => {
        const { c, d } = makeHarness(walled);
        c.grid = { size: 100, originX: 0, originY: 0 };
        await c.placeStamp({ stamp: 'pack:pillar', x: 50, y: 50 });
        const walls = d.walls[0] ?? [];
        expect(walls.map((w) => [w.a, w.b])).toEqual([
            [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
            ],
            [
                { x: 100, y: 0 },
                { x: 100, y: 100 },
            ],
            [
                { x: 100, y: 100 },
                { x: 0, y: 100 },
            ],
            [
                { x: 0, y: 100 },
                { x: 0, y: 0 },
            ],
        ]);
        expect(walls[0]?.blocks).toEqual({ sight: true, movement: true, light: true, sound: false });
        expect(c.getFeature('p1')?.docs.walls).toEqual(['w0', 'w1', 'w2', 'w3']);
    });

    it('walls an alpha stamp along its traced silhouette, and drops them for a variant without occlusion', async () => {
        const { c, d } = makeHarness(walled);
        c.grid = { size: 100, originX: 0, originY: 0 };
        await c.placeStamp({ stamp: 'pack:statue', x: 50, y: 50 });
        expect(d.walls[0]?.[0]).toMatchObject({ a: { x: 25, y: 25 }, b: { x: 75, y: 25 } });
        const placed = c.getFeature('p1');
        expect(placed?.type === 'stamp' ? placed.silhouette : null).toEqual(FAKE_SILHOUETTE);
        await c.setStampVariant('p1', 1);
        const rubble = c.getFeature('p1');
        expect(rubble?.type === 'stamp' ? rubble.silhouette : 'x').toBeNull();
        expect(rubble?.docs.walls).toEqual([]);
        expect(d.deletedIds()).toEqual(['w0', 'w1', 'w2', 'w3']);
    });

    it('falls back to the footprint when the image cannot be traced', async () => {
        const { c, d } = makeHarness(walled, null);
        c.grid = { size: 100, originX: 0, originY: 0 };
        await c.placeStamp({ stamp: 'pack:statue', x: 50, y: 50 });
        expect(d.walls[0]?.[0]).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } });
    });

    it('moves the walls with the stamp', async () => {
        const { c, d } = makeHarness(walled);
        c.grid = { size: 100, originX: 0, originY: 0 };
        await c.placeStamp({ stamp: 'pack:pillar', x: 50, y: 50 });
        await c.syncStampFrame('p1', { x: 200, y: 0, width: 100, height: 100, rotation: 0 });
        expect(d.walls[1]?.[0]).toMatchObject({ a: { x: 200, y: 0 }, b: { x: 300, y: 0 } });
        expect(c.getFeature('p1')?.docs.walls).toEqual(['w4', 'w5', 'w6', 'w7']);
    });
});

describe('CartographyController stamps', () => {
    it('places a stamp as a tracked native tile and removes it with the feature', async () => {
        const { c, d, s } = makeHarness(stamps);
        c.grid = { size: 100, originX: 0, originY: 0 };
        const id = await c.placeStamp({ stamp: 'pack:door', x: 250, y: 250 });
        expect(id).toBe('p1');
        expect(d.tiles).toEqual([
            [{ src: 'modules/pack/closed.png', x: 200, y: 200, width: 100, height: 100, rotation: 0, elevation: 0, level: null, featureId: 'p1' }],
        ]);
        expect(c.getFeature('p1')?.docs.tiles).toEqual(['t0']);
        expect(s.last()[0]?.docs.tiles).toEqual(['t0']);
        expect(c.featureForTile('t0')).toBe('p1');
        await c.remove('p1');
        expect(d.deletedIds()).toEqual(['t0']);
    });

    it('refuses a stamp no loaded pack provides', async () => {
        const { c, d } = makeHarness(stamps);
        expect(await c.placeStamp({ stamp: 'pack:missing', x: 0, y: 0 })).toBeNull();
        expect(d.tiles).toEqual([]);
    });

    it('uses the pack reference grid on a gridless scene', async () => {
        const { c, d } = makeHarness(stamps);
        await c.placeStamp({ stamp: 'pack:door', x: 0, y: 0, scale: 0.5 });
        expect(d.tiles[0]?.[0]?.width).toBe(50);
    });

    it('cycles variants by updating the same tile in place', async () => {
        const { c, d } = makeHarness(stamps);
        await c.placeStamp({ stamp: 'pack:door', x: 0, y: 0 });
        expect(await c.cycleStampVariant('p1')).toBe(true);
        expect(await c.cycleStampVariant('p1', -1)).toBe(true);
        expect(await c.cycleStampVariant('p1', -1)).toBe(true);
        expect(d.tiles).toHaveLength(1);
        expect(d.deleted.every((batch) => batch.tiles.length === 0)).toBe(true);
        expect(d.tileUpdates.map((batch) => batch[0]?.tile.src)).toEqual(['modules/pack/open.png', 'modules/pack/closed.png', 'modules/pack/broken.png']);
        expect(d.tileUpdates.map((batch) => batch[0]?.id)).toEqual(['t0', 't0', 't0']);
        expect(c.getFeature('p1')?.docs.tiles).toEqual(['t0']);
    });

    it('sets an explicit variant, and refuses non-stamps and unknown ids', async () => {
        const { c } = makeHarness(stamps);
        await c.placeStamp({ stamp: 'pack:door', x: 0, y: 0 });
        expect(await c.setStampVariant('p1', 1)).toBe(true);
        const feature = c.getFeature('p1');
        expect(feature?.type === 'stamp' ? feature.height : 0).toBe(200);
        expect(await c.setStampVariant('nope', 1)).toBe(false);
        expect(await c.cycleStampVariant('nope')).toBe(false);
        c.begin({ type: 'path', kind: 'road' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 0 });
        await c.commit(); // p2
        expect(await c.setStampVariant('p2', 0)).toBe(false);
    });

    it('adopts a native tile edit once, ending the update loop on the echo', async () => {
        const { c, d } = makeHarness(stamps);
        c.grid = { size: 100, originX: 0, originY: 0 };
        await c.placeStamp({ stamp: 'pack:door', x: 50, y: 50 });
        const frame = { x: 300, y: 400, width: 200, height: 100, rotation: 90 };
        expect(await c.syncStampFrame('p1', frame)).toBe(true);
        expect(c.getFeature('p1')?.points).toEqual([{ x: 400, y: 450 }]);
        expect(d.tileUpdates[0]?.[0]?.tile).toMatchObject({ x: 300, y: 400, width: 200, height: 100, rotation: 90 });
        expect(await c.syncStampFrame('p1', frame)).toBe(false);
        expect(d.tileUpdates).toHaveLength(1);
        expect(await c.syncStampFrame('missing', frame)).toBe(false);
    });

    it('moves a stamp by dragging its centre', async () => {
        const { c, d } = makeHarness(stamps);
        c.grid = { size: 100, originX: 0, originY: 0 };
        await c.placeStamp({ stamp: 'pack:door', x: 50, y: 50 });
        expect(c.pickVertex({ x: 52, y: 49 }, 5)).toEqual({ id: 'p1', index: 0 });
        await c.moveVertex('p1', 0, { x: 150, y: 50 });
        expect(d.tileUpdates[0]?.[0]?.tile).toMatchObject({ x: 100, y: 0 });
    });
});
