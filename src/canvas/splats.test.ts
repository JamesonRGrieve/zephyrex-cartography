// SPDX-License-Identifier: AGPL-3.0-or-later
/** The controller's splat maps: blending textures with the brush, level by level, with undo. */
import { describe, expect, it } from 'vitest';
import { makeHarness } from './test-fakes';

const dab = { at: { x: 500, y: 400 }, radius: 100, strength: 1, erase: false };

/** The weight of `channel` at mask pixel (x, y) of a saved mask. */
function weight(mask: Uint8ClampedArray | undefined, width: number, x: number, y: number, channel: number): number {
    return mask?.[(y * width + x) * 4 + channel] ?? -1;
}

describe('splat maps', () => {
    it('blend on the level being edited: a map made over the scene, a channel per texture, drawn as it goes', async () => {
        const { c, sp, spr } = makeHarness();
        expect(c.blend({ ...dab, role: 'grassland' })).toBe(true);
        expect(c.blend({ ...dab, at: { x: 520, y: 400 }, role: 'sand' })).toBe(true);
        const layer = c.splatLayer();
        // The fake scene is 1000×800 at 100px squares: 80×64 mask pixels.
        expect(layer).toMatchObject({ level: null, path: 'splats/all.png', width: 80, height: 64, roles: ['grassland', 'sand', null, null] });
        expect(spr.shown.get('')).toEqual(['grassland', 'sand', null, null]);
        // Nothing is saved until the stroke ends.
        expect(sp.maskWrites).toEqual([]);
        await c.endBlend();
        expect(sp.maskWrites).toEqual(['splats/all.png']);
        expect(sp.layers).toEqual([layer]);
        expect(weight(sp.masks.get('splats/all.png'), 80, 41, 32, 1)).toBeGreaterThan(200);
    });

    it('undo a whole stroke at once, and redo it', async () => {
        const { c, sp } = makeHarness();
        c.blend({ ...dab, role: 'grassland' });
        c.blend({ ...dab, at: { x: 600, y: 400 }, role: 'grassland' });
        await c.endBlend();
        const painted = weight(sp.masks.get('splats/all.png'), 80, 40, 32, 0);
        expect(painted).toBeGreaterThan(200);
        await c.undo();
        expect(weight(sp.masks.get('splats/all.png'), 80, 40, 32, 0)).toBe(0);
        expect(c.splatLayer()?.roles).toEqual([null, null, null, null]);
        await c.redo();
        expect(weight(sp.masks.get('splats/all.png'), 80, 40, 32, 0)).toBe(painted);
        expect(c.splatLayer()?.roles[0]).toBe('grassland');
    });

    it('keep one map per level, showing only the level being edited', async () => {
        const { c, spr } = makeHarness();
        await c.addLevel('above', 'Ground');
        await c.addLevel('above', 'Upper');
        c.setActiveLevel('lv1');
        c.blend({ ...dab, role: 'grassland' });
        await c.endBlend();
        c.setActiveLevel('lv2');
        expect(spr.shown.has('lv1')).toBe(false);
        expect(c.splatLayer()).toBeNull();
        c.blend({ ...dab, role: 'rock' });
        expect(c.splatLayer()?.level).toBe('lv2');
        c.setActiveLevel('lv1');
        expect([...spr.shown.keys()]).toEqual(['lv1']);
    });

    it('refuse a fifth texture, and read saved maps back in', async () => {
        const first = makeHarness();
        for (const role of ['a', 'b', 'c', 'd']) {
            expect(first.c.blend({ ...dab, role })).toBe(true);
        }
        expect(first.c.blend({ ...dab, role: 'e' })).toBe(false);
        await first.c.endBlend();

        const second = makeHarness();
        second.sp.layers = first.sp.layers;
        second.sp.masks.set('splats/all.png', first.sp.masks.get('splats/all.png') ?? new Uint8ClampedArray(0));
        await second.c.loadSplats();
        expect(second.c.splatLayer()?.roles).toEqual(['a', 'b', 'c', 'd']);
        expect(second.spr.shown.get('')).toEqual(['a', 'b', 'c', 'd']);
    });

    it('end a stroke that never started as nothing', async () => {
        const { c, sp } = makeHarness();
        await c.endBlend();
        await c.undo();
        expect(sp.maskWrites).toEqual([]);
    });
});
