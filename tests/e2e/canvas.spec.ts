// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the canvas shows for what a GM draws, beyond which documents exist: a
 * painted stroke is the round swath a brush leaves, and a river ends square at
 * its full width. Each is measured where the scene records it and kept as a
 * screenshot of the real canvas.
 */
import { expect, frameScene, test } from './lib/foundry';
import { dragScene, drawShape, holdView, MODULE_ID, tuckPanels, useTool } from './lib/pointer';

test('a painted stroke is a round brush’s swath: its ground reaches a brush radius past both ends, no wider', async ({ world }) => {
    await useTool(world, 'paint', { panel: true });
    const panel = world.locator(`#${MODULE_ID}-paint`);
    await panel.getByRole('button', { name: 'Forest' }).click();
    await panel.getByLabel('Brush size (px)').fill('50');
    await panel.getByLabel('Brush size (px)').press('Enter');
    // Difficult ground gets its own Scene Region over exactly what is painted, which Foundry records.
    await panel.getByLabel('Movement cost (×)').fill('2');
    await panel.getByLabel('Movement cost (×)').press('Enter');
    await tuckPanels(world);
    await holdView(world);
    await dragScene(world, { x: 500, y: 1000 }, [
        { x: 800, y: 1000 },
        { x: 1100, y: 1000 },
        { x: 1300, y: 1000 },
    ]);
    const extent = async (): Promise<{ left: number; right: number; top: number; bottom: number } | null> =>
        world.evaluate(() => {
            const region = canvas?.scene?.regions.contents.find((r) => r.shapes.some((shape) => shape.type === 'polygon'));
            const points = region?.shapes.flatMap((shape) => (shape.type === 'polygon' && 'points' in shape ? [...shape.points] : [])) ?? [];
            if (points.length === 0) {
                return null;
            }
            const xs = points.filter((_, i) => i % 2 === 0);
            const ys = points.filter((_, i) => i % 2 === 1);
            return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
        });
    await expect.poll(extent).not.toBeNull();
    const box = await extent();
    // Rounded past each end by the brush's radius (a square end would stop at the press and release), and never wider than it.
    expect(box?.left).toBeLessThanOrEqual(455);
    expect(box?.right).toBeGreaterThanOrEqual(1345);
    expect(box?.top).toBeGreaterThanOrEqual(948);
    expect(box?.bottom).toBeLessThanOrEqual(1052);
    await frameScene(world);
    await expect(world.locator('#board')).toHaveScreenshot('round-brush-stroke.png');
});

test('a river ends square at its full width, as a road does', async ({ world }) => {
    await useTool(world, 'river', { panel: true });
    const panel = world.locator(`#${MODULE_ID}-paths`);
    await panel.getByLabel('Width (px)').fill('120');
    await panel.getByLabel('Width (px)').press('Enter');
    await tuckPanels(world);
    await holdView(world);
    await drawShape(world, [
        { x: 300, y: 750 },
        { x: 1000, y: 750 },
        { x: 1700, y: 750 },
    ]);
    await expect
        .poll(async () =>
            world.evaluate(() => {
                const controller = game.modules?.get('zephyrex-cartography').api.controller();
                // Just inside each end, off the centerline by most of the half-width: full width reaches there.
                return [
                    { x: 310, y: 800 },
                    { x: 1690, y: 700 },
                ].map((at) => controller?.getFeature(controller.hitTest(at) ?? '')?.type ?? null);
            }),
        )
        .toEqual(['path', 'path']);
    await frameScene(world);
    await expect(world.locator('#board')).toHaveScreenshot('river-square-ends.png');
});
