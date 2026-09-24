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

/** A harness with one level, its background already set, and one blend stroke on it. */
async function blendedOnLevel(): Promise<ReturnType<typeof makeHarness>> {
    const h = makeHarness();
    await h.c.addLevel('above', 'Ground');
    h.c.setActiveLevel('lv1');
    const level = h.c.levels[0];
    if (level) {
        await h.c.setLevelArt(level.id, { ...level.art, background: 'maps/ground.webp' });
    }
    h.c.blend(DAB);
    await h.c.endBlend();
    return h;
}

describe('baking a blend', () => {
    it('has nothing to bake before there is a blend', async () => {
        const { c } = makeHarness();
        expect(c.splatState()).toBe('none');
        expect(await c.bakeSplat()).toBe(false);
        expect(await c.unbakeSplat()).toBe(false);
    });

    it('renders the blend into an image beside its mask, shows it as a Tile, and stops drawing the overlay', async () => {
        const { c, sp, spr } = await blended();
        expect(c.splatState()).toBe('live');
        expect(await c.bakeSplat('tile')).toBe(true);
        expect(new TextDecoder().decode(sp.written.get('splats/all-baked.png'))).toBe('png:');
        expect([...sp.tiles]).toEqual([['bake0', 'splats/all-baked.png']]);
        expect(c.splatLayer()?.baked).toEqual({ into: 'tile', tile: 'bake0' });
        expect(sp.layers[0]?.baked).toEqual({ into: 'tile', tile: 'bake0' });
        expect(spr.shown.has('')).toBe(false);
        expect(c.splatState()).toBe('tile');
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
        expect(c.splatState()).toBe('live');
    });

    it('comes back live on an undo, which a bake does not take a step of', async () => {
        const { c, sp, spr } = await blended();
        c.blend(DAB);
        await c.endBlend();
        await c.bakeSplat();
        await c.undo();
        expect(sp.tiles.size).toBe(0);
        expect(spr.shown.has('')).toBe(true);
        expect(c.splatState()).toBe('live');
    });

    it('bakes into its level’s background, and puts the level’s own image back on unbaking', async () => {
        const { c, sp } = await blendedOnLevel();
        expect(await c.bakeSplat('background')).toBe(true);
        expect(c.splatState()).toBe('background');
        expect(c.levels[0]?.art.background).toBe('splats/lv1-baked.png');
        expect(c.splatLayer()?.baked).toEqual({ into: 'background', previous: 'maps/ground.webp' });
        expect(sp.tiles.size).toBe(0);
        expect(await c.unbakeSplat()).toBe(true);
        expect(c.levels[0]?.art.background).toBe('maps/ground.webp');
    });

    it('leaves a background the GM has set since, and bakes a blend on every level only into a Tile', async () => {
        const { c } = await blendedOnLevel();
        await c.bakeSplat('background');
        const level = c.levels[0];
        if (level) {
            await c.setLevelArt(level.id, { ...level.art, background: 'maps/night.webp' });
        }
        c.blend(DAB);
        await c.endBlend();
        expect(c.levels[0]?.art.background).toBe('maps/night.webp');

        const everywhere = await blended();
        expect(await everywhere.c.bakeSplat('background')).toBe(false);
        expect(everywhere.c.splatState()).toBe('live');
    });
});
