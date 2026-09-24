// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, frameScene, test } from './lib/foundry';

test('a stamp’s tile and light take its pack’s occlusion, restrictions and light technique', async ({ world }) => {
    const placed = await world.evaluate(async () => {
        await game.modules?.get('zephyrex-cartography').api.controller()?.placeStamp({ stamp: 'zc-e2e-pack:brazier', x: 500, y: 400 });
        const tile = canvas?.scene?.tiles.contents[0];
        const light = canvas?.scene?.lights.contents[0];
        return {
            tile: tile && {
                modes: [...tile.occlusion.modes].sort((a, b) => (a ?? 0) - (b ?? 0)),
                alpha: tile.occlusion.alpha,
                alphaThreshold: tile.texture.alphaThreshold,
                light: tile.restrictions.light,
            },
            light: light && { coloration: light.config.coloration, luminosity: light.config.luminosity, walls: light.walls },
        };
    });
    // CONST.OCCLUSION_MODES: FADE 1, VISION 8. SHADER_TECHNIQUES.ADAPTIVE_ATTENUATION is id 101.
    expect(placed.tile).toEqual({ modes: [1, 8], alpha: 0.25, alphaThreshold: 0.5, light: true });
    expect(placed.light).toEqual({ coloration: 101, luminosity: 0.3, walls: false });
});

test('a stamp’s terrain and surface become native Modify Movement Cost and Define Surface regions', async ({ world }) => {
    await world.evaluate(async () => {
        const controller = game.modules?.get('zephyrex-cartography').api.controller();
        const crate = await controller?.placeStamp({ stamp: 'zc-e2e-pack:crate', x: 300, y: 300 });
        await controller?.setStampVariant(crate ?? '', 1); // smashed: rubble underfoot
        await controller?.placeStamp({ stamp: 'zc-e2e-pack:canopy', x: 800, y: 500 });
    });
    const regions = await world.evaluate(() =>
        (canvas?.scene?.regions.contents ?? []).map((r) => ({
            name: r.name,
            bottom: r.elevation.bottom,
            top: r.elevation.top,
            // The behaviours' source data, plain for the trip out of the page.
            behaviors: r.behaviors.contents.map((b) => b.toObject()),
        })),
    );
    const byName = Object.fromEntries(regions.map((r) => [r.name, r]));
    expect(byName['Crate terrain']).toMatchObject({ behaviors: [{ type: 'modifyMovementCost', system: { difficulties: { walk: 2 } } }] });
    // The canopy's roof sits atop its 2-square height: 10 distance units on the fixture's 5-unit grid.
    expect(byName['Canopy surface']).toMatchObject({
        bottom: 0,
        top: 10,
        behaviors: [{ type: 'defineSurface', system: { placement: 'top', exposure: true } }],
    });
});

test('a placed stamp is a native tile centred on its point, with its light', async ({ world }) => {
    const placed = await world.evaluate(async () => {
        const controller = game.modules?.get('zephyrex-cartography').api.controller();
        const id = await controller?.placeStamp({ stamp: 'zc-e2e-pack:lamp', x: 500, y: 400 });
        const tile = canvas?.scene?.tiles.contents[0];
        const light = canvas?.scene?.lights.contents[0];
        return {
            id,
            tile: tile && {
                name: tile.name,
                x: tile.x,
                y: tile.y,
                width: tile.width,
                height: tile.height,
                anchorX: tile.texture.anchorX,
                anchorY: tile.texture.anchorY,
            },
            light: light && { name: light.name, x: light.x, y: light.y },
        };
    });
    expect(placed.id).toEqual(expect.any(String));
    // v14 places a tile by its anchor: the stamp's centre, not its top-left.
    // Named after the stamp, so they read clearly in Foundry's Placeables tab.
    expect(placed.tile).toEqual({ name: 'Lamp', x: 500, y: 400, width: 100, height: 100, anchorX: 0.5, anchorY: 0.5 });
    expect(placed.light).toEqual({ name: 'Lamp light', x: 500, y: 400 });
    await frameScene(world);
    await expect(world.locator('#board')).toHaveScreenshot('lamp-placed.png');
});

test('a stamp emits its ambient sound as a native AmbientSound, silenced by a variant that sets none', async ({ world }) => {
    const sound = await world.evaluate(async () => {
        const controller = game.modules?.get('zephyrex-cartography').api.controller();
        const id = await controller?.placeStamp({ stamp: 'zc-e2e-pack:lamp', x: 500, y: 400 });
        const placed = canvas?.scene?.sounds.contents[0];
        const before = placed && { name: placed.name, x: placed.x, y: placed.y, radius: placed.radius, path: placed.path, volume: placed.volume };
        if (id !== undefined && id !== null) {
            await controller?.setStampVariant(id, 1);
        }
        return { before, after: canvas?.scene?.sounds.size };
    });
    // 3 grid units at the scene's 5 distance units per square; the path served from the pack module.
    expect(sound.before).toEqual({ name: 'Lamp sound', x: 500, y: 400, radius: 15, path: 'modules/zc-e2e-pack/sounds/silence.wav', volume: 0.5 });
    expect(sound.after).toBe(0);
});

test('switching to an unlit variant swaps the image and removes the light', async ({ world }) => {
    const after = await world.evaluate(async () => {
        const controller = game.modules?.get('zephyrex-cartography').api.controller();
        const id = await controller?.placeStamp({ stamp: 'zc-e2e-pack:lamp', x: 300, y: 300 });
        if (id !== undefined && id !== null) {
            await controller?.setStampVariant(id, 1);
        }
        return { src: canvas?.scene?.tiles.contents[0]?.texture.src, lights: canvas?.scene?.lights.size };
    });
    expect(after.src).toContain('lamp-unlit.svg');
    expect(after.lights).toBe(0);
});

test('a GM moving the tile moves the stamp and its light', async ({ world }) => {
    await world.evaluate(async () => {
        const controller = game.modules?.get('zephyrex-cartography').api.controller();
        await controller?.placeStamp({ stamp: 'zc-e2e-pack:lamp', x: 500, y: 500 });
        await canvas?.scene?.tiles.contents[0]?.update({ x: 800, y: 600 });
    });
    // The update hook re-syncs the stamp's documents asynchronously.
    await expect
        .poll(async () =>
            world.evaluate(() => {
                const light = canvas?.scene?.lights.contents[0];
                return light && { x: light.x, y: light.y };
            }),
        )
        .toEqual({ x: 800, y: 600 });
});
