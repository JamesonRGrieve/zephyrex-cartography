// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, frameScene, test } from './lib/foundry';

test('a placed stamp is a native tile centred on its point, with its light', async ({ world }) => {
    const placed = await world.evaluate(async () => {
        const controller = game.modules?.get('zephyrex-cartography').api.controller();
        const id = await controller?.placeStamp({ stamp: 'zc-e2e-pack:lamp', x: 500, y: 400 });
        const tile = canvas?.scene?.tiles.contents[0];
        const light = canvas?.scene?.lights.contents[0];
        return {
            id,
            tile: tile && { x: tile.x, y: tile.y, width: tile.width, height: tile.height, anchorX: tile.texture.anchorX, anchorY: tile.texture.anchorY },
            light: light && { x: light.x, y: light.y },
        };
    });
    expect(placed.id).toEqual(expect.any(String));
    // v14 places a tile by its anchor: the stamp's centre, not its top-left.
    expect(placed.tile).toEqual({ x: 500, y: 400, width: 100, height: 100, anchorX: 0.5, anchorY: 0.5 });
    expect(placed.light).toEqual({ x: 500, y: 400 });
    await frameScene(world);
    await expect(world.locator('#board')).toHaveScreenshot('lamp-placed.png');
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
