// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { planDocuments } from '../tools/plan';
import { switchOf, switchOn, SWITCH_BLOCKS } from '../tools/switches';
import { makeHarness, SWITCH_STAMPS as stamps } from './test-fakes';

/** A switch (p1), an unlit lamp (p2), a crate (p3) and a room (p4). */
async function scene(): Promise<ReturnType<typeof makeHarness>> {
    const h = makeHarness(stamps);
    await h.c.placeStamp({ stamp: 'pack:switch', x: 50, y: 500 });
    await h.c.placeStamp({ stamp: 'pack:lamp', x: 300, y: 300 });
    await h.c.placeStamp({ stamp: 'pack:crate', x: 600, y: 600 });
    h.c.begin({ type: 'room', floor: 'dirt' }, 'click');
    for (const at of [
        { x: 800, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 200 },
    ]) {
        h.c.addPoint(at);
    }
    await h.c.commit();
    return h;
}

describe('light switches', () => {
    it('are door stamps whose wall blocks nothing and opens no room wall', async () => {
        const { c } = await scene();
        const lightSwitch = switchOf(c.getFeature('p1'));
        expect(lightSwitch?.id).toBe('p1');
        expect(switchOf(c.getFeature('p2'))).toBeNull();
        expect(lightSwitch && switchOn(lightSwitch)).toBe(false);
        expect(lightSwitch ? planDocuments(lightSwitch).walls : []).toEqual([expect.objectContaining({ door: 'door', blocks: SWITCH_BLOCKS })]);
        expect(c.isLightSwitch('p1')).toBe(true);
        expect(c.isLightSwitch('p2')).toBe(false);
    });

    it('link lamps, rooms and plain lights, toggling each, and refuse anything a switch cannot light', async () => {
        const { c } = await scene();
        expect(await c.toggleSwitchTarget('p1', { kind: 'feature', id: 'p2' })).toBe(true);
        expect(await c.toggleSwitchTarget('p1', { kind: 'feature', id: 'p4' })).toBe(true);
        expect(await c.toggleSwitchTarget('p1', { kind: 'light', id: 'L9' })).toBe(true);
        expect(await c.toggleSwitchTarget('p1', { kind: 'feature', id: 'p3' })).toBe(false);
        expect(await c.toggleSwitchTarget('p2', { kind: 'feature', id: 'p4' })).toBe(false);
        expect(c.switchTargets('p1')).toEqual([
            { kind: 'feature', id: 'p2' },
            { kind: 'feature', id: 'p4' },
            { kind: 'light', id: 'L9' },
        ]);
        expect(await c.toggleSwitchTarget('p1', { kind: 'light', id: 'L9' })).toBe(true);
        expect(c.switchTargets('p1')).toHaveLength(2);
        expect(c.switchTargets('p2')).toEqual([]);
    });

    it('turn everything they control on and off together when flipped in play, as one undo step', async () => {
        const { c, d, s } = await scene();
        await c.toggleSwitchTarget('p1', { kind: 'feature', id: 'p2' });
        await c.toggleSwitchTarget('p1', { kind: 'feature', id: 'p4' });
        await c.toggleSwitchTarget('p1', { kind: 'light', id: 'L9' });
        // The room starts lit; the switch starts off, so flipping it on leaves the room lit and lights the lamp.
        const wall = c.getFeature('p1')?.docs.walls[0] ?? '';
        const writes = d.writes.length;
        expect(await c.applyDoorState(wall, 'open')).toBe(true);
        expect(d.writes).toHaveLength(writes + 1);
        expect(d.writes[d.writes.length - 1]?.lightVisibility).toEqual([{ id: 'L9', hidden: false }]);
        const lamp = c.getFeature('p2');
        expect(lamp?.type === 'stamp' ? lamp.variant : -1).toBe(1);

        expect(await c.applyDoorState(c.getFeature('p1')?.docs.walls[0] ?? '', 'closed')).toBe(true);
        const room = c.getFeature('p4');
        expect(room?.type === 'room' ? room.lit : true).toBe(false);
        expect(d.writes[d.writes.length - 1]?.lightVisibility).toEqual([{ id: 'L9', hidden: true }]);
        const off = c.getFeature('p2');
        expect(off?.type === 'stamp' ? off.variant : -1).toBe(0);
        // An unlit room plans no light.
        expect(room ? planDocuments(room).lights : ['x']).toEqual([]);

        // One undo takes back the whole flip.
        await c.undo();
        const relit = s.last().find((f) => f.id === 'p4');
        expect(relit?.type === 'room' ? relit.lit : false).toBe(true);
    });

    it('forget a target that is removed', async () => {
        const { c } = await scene();
        await c.toggleSwitchTarget('p1', { kind: 'feature', id: 'p2' });
        await c.remove('p2');
        expect(c.switchTargets('p1')).toEqual([]);
    });

    it('place their centres for the link lines: a stamp’s centre, a room’s centroid', async () => {
        const { c } = await scene();
        expect(c.featureCentre('p2')).toEqual({ x: 300, y: 300 });
        expect(c.featureCentre('p4')?.x).toBeCloseTo((800 + 1000 + 1000) / 3);
        expect(c.featureCentre('nope')).toBeNull();
    });
});
