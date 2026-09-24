// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { BlendDab } from './controller';
import { makeHarness } from './test-fakes';

const DAB: BlendDab = { at: { x: 100, y: 100 }, role: 'sand', radius: 50, strength: 1, erase: false };

/** A harness with one blend stroke on every level ("" key). */
async function blended(): Promise<ReturnType<typeof makeHarness>> {
    const h = makeHarness();
    h.c.blend(DAB);
    await h.c.endBlend();
    return h;
}

describe('baking a blend', () => {
    it('has nothing to bake before there is a blend', async () => {
        const { c } = makeHarness();
        expect(c.splatBaked()).toBeNull();
        expect(await c.bakeSplat()).toBe(false);
        expect(await c.unbakeSplat()).toBe(false);
    });

    it('renders the blend into an image beside its mask, shows it as a Tile, and stops drawing the overlay', async () => {
        const { c, sp, spr } = await blended();
        expect(c.splatBaked()).toBe(false);
        expect(await c.bakeSplat()).toBe(true);
        expect(new TextDecoder().decode(sp.written.get('splats/all-baked.png'))).toBe('png:');
        expect([...sp.tiles]).toEqual([['bake0', 'splats/all-baked.png']]);
        expect(c.splatLayer()?.baked).toBe('bake0');
        expect(sp.layers[0]?.baked).toBe('bake0');
        expect(spr.shown.has('')).toBe(false);
        expect(c.splatBaked()).toBe(true);
        // Baking twice is refused.
        expect(await c.bakeSplat()).toBe(false);
    });

    it('comes back live, its Tile deleted, when unbaked or blended again', async () => {
        const { c, sp, spr } = await blended();
        await c.bakeSplat();
        expect(await c.unbakeSplat()).toBe(true);
        expect(sp.tiles.size).toBe(0);
        expect(spr.shown.has('')).toBe(true);
        expect(sp.layers[0]?.baked).toBeNull();

        await c.bakeSplat();
        expect(c.blend(DAB)).toBe(true);
        await c.endBlend();
        expect(sp.tiles.size).toBe(0);
        expect(c.splatBaked()).toBe(false);
    });

    it('comes back live on an undo, which a bake does not take a step of', async () => {
        const { c, sp, spr } = await blended();
        await c.bakeSplat();
        await c.undo();
        expect(sp.tiles.size).toBe(0);
        expect(spr.shown.has('')).toBe(true);
        expect(c.splatBaked()).toBe(false);
    });
});
