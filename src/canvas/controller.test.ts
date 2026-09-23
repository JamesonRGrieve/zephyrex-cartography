// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { makeHarness as make } from './test-fakes';

describe('CartographyController', () => {
    it('commits a road path: renders, persists, no walls by default', async () => {
        const { c, r, s, d } = make();
        c.begin({ type: 'path', kind: 'road' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 0 });
        expect(r.previews).toBeGreaterThanOrEqual(1);
        await c.commit();
        expect(r.setIds).toEqual(['p1']);
        expect(s.saved).toHaveLength(1);
        expect(d.walls).toEqual([]);
    });

    it('commits a freehand brush stroke', async () => {
        const { c, r, s } = make();
        c.begin({ type: 'stroke', biome: 'grassland' }, 'freehand');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 2 });
        c.addPoint({ x: 20, y: 0 });
        await c.commit();
        expect(r.setIds).toEqual(['p1']);
        expect(s.saved).toHaveLength(1);
        expect(s.saved[0]?.[0]?.type).toBe('stroke');
    });

    it('commits a grid-snapped room', async () => {
        const { c, s } = make();
        c.grid = { size: 100, originX: 0, originY: 0 };
        c.begin({ type: 'room', floor: 'dirt' }, 'click');
        c.addPoint({ x: 12, y: 8 });
        c.addPoint({ x: 105, y: 3 });
        c.addPoint({ x: 98, y: 96 });
        await c.commit();
        const saved = s.last()[0];
        expect(saved?.type).toBe('room');
        expect(saved?.points[0]).toEqual({ x: 0, y: 0 });
        expect(saved?.points[1]).toEqual({ x: 100, y: 0 });
        expect(saved?.points[2]).toEqual({ x: 100, y: 100 });
    });

    it('generates native Foundry walls + a light for a room and cleans them up on removal', async () => {
        const { c, d, s } = make();
        c.begin({ type: 'room', floor: 'dirt' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 100, y: 0 });
        c.addPoint({ x: 100, y: 100 });
        await c.commit(); // p1 — a 3-point room => 3 perimeter segments + 1 centre light
        expect(d.walls.map((batch) => batch.length)).toEqual([3]);
        expect(d.lights).toHaveLength(1);
        expect(c.getFeature('p1')?.docs).toEqual({ walls: ['w0', 'w1', 'w2'], lights: ['L0'], tiles: [], regions: [] });
        expect(s.last()[0]?.docs.walls).toEqual(['w0', 'w1', 'w2']);
        await c.remove('p1');
        expect(d.deletedIds()).toEqual(['w0', 'w1', 'w2', 'L0']);
    });

    it('sizes a room light to reach its farthest corner', async () => {
        const { c, d } = make();
        c.begin({ type: 'room', floor: 'dirt' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 60, y: 0 });
        c.addPoint({ x: 60, y: 80 });
        c.addPoint({ x: 0, y: 80 });
        await c.commit();
        const light = d.lights[0]?.[0];
        expect(light?.x).toBe(30);
        expect(light?.y).toBe(40);
        expect(light?.dim).toBe(50);
        expect(light?.bright).toBe(25);
    });

    it('re-syncs native walls when a room vertex moves', async () => {
        const { c, d } = make();
        c.begin({ type: 'room', floor: 'dirt' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 100, y: 0 });
        c.addPoint({ x: 100, y: 100 });
        await c.commit(); // p1 — 3 walls
        await c.moveVertex('p1', 1, { x: 120, y: 0 });
        expect(d.deletedIds()).toEqual(['w0', 'w1', 'w2', 'L0']); // old walls + light dropped
        expect(d.walls.map((batch) => batch.length)).toEqual([3, 3]); // emitted on commit, then re-emitted on edit
        expect(c.getFeature('p1')?.docs.walls).toEqual(['w3', 'w4', 'w5']);
    });

    it('toggles a room wall segment into a Foundry door and back', async () => {
        const { c, d } = make();
        c.begin({ type: 'room', floor: 'dirt' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 100, y: 0 });
        c.addPoint({ x: 100, y: 100 });
        await c.commit(); // p1
        expect(c.pickWallSegment({ x: 50, y: 1 }, 8)).toEqual({ id: 'p1', index: 0 });
        await c.toggleDoor('p1', 0);
        const lastSpecs = d.walls[d.walls.length - 1];
        expect(lastSpecs?.[0]?.door).toBe('door');
        expect(lastSpecs?.[1]?.door).toBe('none');
        await c.toggleDoor('p1', 0);
        const room = c.getFeature('p1');
        const doorCount = room?.type === 'room' ? room.doors.length : -1;
        expect(doorCount).toBe(0);
    });

    it('sets a room door type and state, and refuses segments the room lacks', async () => {
        const { c, d } = make();
        c.begin({ type: 'room', floor: 'dirt' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 100, y: 0 });
        c.addPoint({ x: 100, y: 100 });
        await c.commit();
        expect(await c.setRoomDoor('p1', 1, { type: 'secret', state: 'locked' })).toBe(true);
        expect(c.roomDoor('p1', 1)).toEqual({ segment: 1, type: 'secret', state: 'locked' });
        expect(d.walls[d.walls.length - 1]?.[1]).toMatchObject({ door: 'secret', doorState: 'locked' });
        expect(await c.setRoomDoor('p1', 7, { type: 'door', state: 'closed' })).toBe(false);
        expect(await c.setRoomDoor('nope', 0, null)).toBe(false);
        expect(c.roomDoor('nope', 0)).toBeNull();
    });

    it('records a room door opened in play without recreating its walls', async () => {
        const { c, d, s } = make();
        c.begin({ type: 'room', floor: 'dirt' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 100, y: 0 });
        c.addPoint({ x: 100, y: 100 });
        await c.commit();
        await c.toggleDoor('p1', 1);
        const doorWall = c.getFeature('p1')?.docs.walls[1] ?? '';
        const batches = d.walls.length;
        expect(await c.applyDoorState(doorWall, 'open')).toBe(true);
        expect(c.roomDoor('p1', 1)?.state).toBe('open');
        expect(d.walls.length).toBe(batches);
        expect(s.last()[0]?.type === 'room' ? s.last()[0] : null).toMatchObject({ doors: [{ segment: 1, state: 'open' }] });
        expect(await c.applyDoorState(doorWall, 'open')).toBe(false);
        const plainWall = c.getFeature('p1')?.docs.walls[0] ?? '';
        expect(await c.applyDoorState(plainWall, 'open')).toBe(false);
    });

    it('commits a biome region', async () => {
        const { c, r, s } = make();
        c.begin({ type: 'region', biome: 'water' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 0 });
        c.addPoint({ x: 5, y: 10 });
        await c.commit();
        expect(r.setIds).toEqual(['p1']);
        expect(s.saved).toHaveLength(1);
    });

    it('emits tracked walls for a path when enabled, and deletes them with the path', async () => {
        const { c, d } = make();
        c.emitWalls = true;
        c.begin({ type: 'path', kind: 'river' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 10 });
        await c.commit();
        const created = d.walls[0] ?? [];
        expect(created.length).toBeGreaterThan(0);
        expect(c.getFeature('p1')?.docs.walls).toHaveLength(created.length);
        await c.remove('p1');
        expect(d.deletedIds()).toHaveLength(created.length);
    });

    it('does not commit a region with too few points', async () => {
        const { c, s } = make();
        c.begin({ type: 'region', biome: 'forest' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 0 });
        await c.commit();
        expect(s.saved).toEqual([]);
        expect(c.drawing).toBe(false);
    });

    it('loads and renders existing features', () => {
        const { c, r, s } = make();
        s.data = [
            {
                type: 'path',
                id: 'a',
                kind: 'road',
                points: [
                    { x: 0, y: 0 },
                    { x: 5, y: 5 },
                ],
                halfWidths: [10, 10],
                walls: false,
                docs: { walls: [], lights: [], tiles: [], regions: [] },
                level: null,
            },
        ];
        c.load();
        expect(r.cleared).toBe(1);
        expect(r.setIds).toEqual(['a']);
    });

    it('removes a feature and persists', async () => {
        const { c, r, s, d } = make();
        s.data = [
            {
                type: 'region',
                id: 'a',
                biome: 'sand',
                points: [
                    { x: 0, y: 0 },
                    { x: 5, y: 0 },
                    { x: 5, y: 5 },
                ],
                docs: { walls: [], lights: [], tiles: [], regions: [] },
                level: null,
            },
        ];
        c.load();
        await c.remove('a');
        expect(r.removed).toContain('a');
        expect(s.saved).toHaveLength(1);
        expect(d.deleted).toEqual([]);
    });

    it('undoes and redoes a commit', async () => {
        const { c, s } = make();
        c.begin({ type: 'region', biome: 'water' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 0 });
        c.addPoint({ x: 5, y: 10 });
        await c.commit();
        await c.undo();
        expect(s.last()).toEqual([]);
        await c.redo();
        expect(s.last().map((f) => f.id)).toEqual(['p1']);
    });

    it('reorders features (z-order) and persists the new order', async () => {
        const { c, s } = make();
        c.begin({ type: 'path', kind: 'road' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 0 });
        await c.commit(); // p1
        c.begin({ type: 'path', kind: 'river' }, 'click');
        c.addPoint({ x: 0, y: 20 });
        c.addPoint({ x: 10, y: 20 });
        await c.commit(); // p2, on top
        await c.toBack('p2');
        expect(s.last().map((f) => f.id)).toEqual(['p2', 'p1']);
        await c.raise('p2');
        expect(s.last().map((f) => f.id)).toEqual(['p1', 'p2']);
    });

    it('hit-tests and erases the topmost feature under a point', async () => {
        const { c, r } = make();
        c.begin({ type: 'region', biome: 'grassland' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 100, y: 0 });
        c.addPoint({ x: 100, y: 100 });
        c.addPoint({ x: 0, y: 100 });
        await c.commit(); // p1
        expect(c.hitTest({ x: 50, y: 50 })).toBe('p1');
        expect(c.hitTest({ x: 500, y: 500 })).toBeNull();
        expect(await c.erase({ x: 500, y: 500 })).toBe(false);
        expect(await c.erase({ x: 50, y: 50 })).toBe(true);
        expect(r.removed).toContain('p1');
    });

    it('undo restores an erased feature', async () => {
        const { c, s } = make();
        c.begin({ type: 'path', kind: 'road' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 100, y: 0 });
        await c.commit(); // p1
        await c.erase({ x: 50, y: 0 });
        expect(s.last()).toEqual([]);
        await c.undo();
        expect(s.last().map((f) => f.id)).toEqual(['p1']);
    });

    it('picks and moves a control point, persisting the edit', async () => {
        const { c, r, s } = make();
        c.begin({ type: 'path', kind: 'road' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 100, y: 0 });
        await c.commit(); // p1
        expect(c.pickVertex({ x: 2, y: 1 }, 5)).toEqual({ id: 'p1', index: 0 });
        expect(c.pickVertex({ x: 500, y: 500 }, 5)).toBeNull();
        const setsBefore = r.setIds.length;
        expect(await c.moveVertex('p1', 0, { x: 5, y: 5 })).toBe(true);
        expect(c.getFeature('p1')?.points[0]).toEqual({ x: 5, y: 5 });
        expect(r.setIds.length).toBeGreaterThan(setsBefore);
        expect(s.last()[0]?.points[0]).toEqual({ x: 5, y: 5 });
    });

    it('deletes a control point and undoes the deletion', async () => {
        const { c, s } = make();
        c.begin({ type: 'region', biome: 'sand' }, 'click');
        c.addPoint({ x: 0, y: 0 });
        c.addPoint({ x: 10, y: 0 });
        c.addPoint({ x: 10, y: 10 });
        c.addPoint({ x: 0, y: 10 });
        await c.commit(); // p1, 4 points
        expect(await c.deleteVertex('p1', 0)).toBe(true);
        expect(c.getFeature('p1')?.points).toHaveLength(3);
        // A 3-point region cannot lose another vertex.
        expect(await c.deleteVertex('p1', 0)).toBe(false);
        await c.undo();
        expect(c.getFeature('p1')?.points).toHaveLength(4);
        expect(s.saved.length).toBeGreaterThan(0);
    });
});
