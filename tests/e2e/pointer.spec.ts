// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The tools as a GM uses them: a real mouse on the canvas, through the scene
 * controls. The other specs drive the controller's API, which cannot catch a
 * tool that never receives the pointer.
 */
import type { Page } from '@playwright/test';
import { expect, frameScene, test } from './lib/foundry';

type Point = { readonly x: number; readonly y: number };

const MODULE_ID = 'zephyrex-cartography';

/** Hold the view still (the canvas otherwise settles after load), so scene points stay where the mouse is sent. */
async function holdView(page: Page): Promise<void> {
    await page.evaluate(async () => {
        await canvas?.animatePan({ x: 1000, y: 750, scale: 0.5, duration: 0 });
    });
}

/** Where scene point `at` is in the viewport, for a real mouse. */
async function clientPoint(page: Page, at: Point): Promise<Point> {
    return page.evaluate((scenePoint) => {
        const point = canvas?.clientCoordinatesFromCanvas(scenePoint);
        return { x: point?.x ?? 0, y: point?.y ?? 0 };
    }, at);
}

async function clickScene(page: Page, at: Point, button: 'left' | 'right' = 'left'): Promise<void> {
    const client = await clientPoint(page, at);
    await page.mouse.click(client.x, client.y, { button });
}

/** Past Foundry's long-press threshold (`MouseInteractionManager.LONG_PRESS_DURATION_MS`, 500). */
const LONG_PRESS_MS = 700;

/** Press at `from`, move through `path`, release at the last point; with Shift held, and the press held first, if asked. */
async function dragScene(page: Page, from: Point, path: readonly Point[], options: { shift?: boolean; holdMs?: number } = {}): Promise<void> {
    const shift = options.shift === true;
    if (shift) {
        await page.keyboard.down('Shift');
    }
    const start = await clientPoint(page, from);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    if (options.holdMs !== undefined) {
        await page.waitForTimeout(options.holdMs);
    }
    for (const at of path) {
        // eslint-disable-next-line no-await-in-loop -- a drag is sequential by nature
        const next = await clientPoint(page, at);
        // eslint-disable-next-line no-await-in-loop -- see above
        await page.mouse.move(next.x, next.y, { steps: 4 });
    }
    await page.mouse.up();
    if (shift) {
        await page.keyboard.up('Shift');
    }
}

/** Where a module tool sits among Foundry's groups; any other is in the module's own group. */
const NATIVE_HOME: Readonly<Record<string, string>> = { room: 'walls', door: 'walls', materials: 'walls', stamp: 'tiles', link: 'lighting' };

async function activate(page: Page, control: string, tool: string): Promise<void> {
    await page.evaluate(
        async ({ group, toolName }) => {
            await ui.controls?.activate({ control: group, tool: toolName });
        },
        { group: control, toolName: tool },
    );
}

/** The panels tools open when picked. */
const TOOL_PANELS = ['paint', 'paths'] as const;

/** Tuck the tool panels away, as a GM would, so clicks land on the canvas; the choices made in them stand. */
async function tuckPanels(page: Page): Promise<void> {
    await page.evaluate(
        async (ids) => {
            await Promise.all(ids.map(async (id) => foundry.applications.instances.get(id)?.minimize()));
        },
        TOOL_PANELS.map((panel) => `${MODULE_ID}-${panel}`),
    );
}

/**
 * Pick module tool `tool` from wherever it sits: rooms and doors with the
 * Walls tools, stamps with the Tiles tools. A panel the tool opens is tucked
 * away unless the test is to use it.
 */
async function useTool(page: Page, tool: string, options: { panel?: boolean } = {}): Promise<void> {
    const home = NATIVE_HOME[tool];
    await (home === undefined ? activate(page, MODULE_ID, tool) : activate(page, home, `zephyrex-${tool}`));
    if (options.panel !== true) {
        await tuckPanels(page);
    }
}

/** Click each point, then right-click to finish the shape. */
async function drawShape(page: Page, points: readonly Point[]): Promise<void> {
    for (const at of points) {
        // eslint-disable-next-line no-await-in-loop -- clicks are sequential by nature
        await clickScene(page, at);
    }
    await clickScene(page, points[0] ?? { x: 0, y: 0 }, 'right');
}

const SQUARE: readonly Point[] = [
    { x: 300, y: 300 },
    { x: 600, y: 300 },
    { x: 600, y: 600 },
    { x: 300, y: 600 },
];

async function wallCount(page: Page): Promise<number> {
    return page.evaluate(() => canvas?.scene?.walls.size ?? 0);
}

/** The feature under scene point `at`, as the controller sees it. */
async function featureAt(page: Page, at: Point): Promise<{ type: string; halfWidths: readonly number[]; biome: string | null; radius: number | null } | null> {
    return page.evaluate((point) => {
        const controller = game.modules?.get('zephyrex-cartography').api.controller();
        const id = controller?.hitTest(point) ?? null;
        const feature = id === null ? undefined : controller?.getFeature(id);
        if (!feature) {
            return null;
        }
        return {
            type: feature.type,
            halfWidths: feature.type === 'path' ? feature.halfWidths : [],
            biome: feature.type === 'region' || feature.type === 'stroke' ? feature.biome : null,
            radius: feature.type === 'stroke' ? feature.radius : null,
        };
    }, at);
}

test('the room, door and materials tools sit with the Walls tools, and the stamp tool with the Tiles tools', async ({ world }) => {
    const placed = await world.evaluate(() => {
        const toolsOf = (group: string): string[] => Object.keys(ui.controls?.controls[group]?.tools ?? {});
        return { walls: toolsOf('walls'), tiles: toolsOf('tiles'), own: toolsOf('zephyrex-cartography') };
    });
    expect(placed.walls).toEqual(expect.arrayContaining(['wall', 'zephyrex-room', 'zephyrex-door', 'zephyrex-materials', 'zephyrex-edit', 'zephyrex-erase']));
    expect(placed.tiles).toEqual(expect.arrayContaining(['tile', 'zephyrex-stamp', 'zephyrex-erase']));
    expect(placed.own).toEqual(expect.arrayContaining(['road', 'river', 'edit', 'erase']));
    expect(placed.own).not.toContain('room');
});

// A redraw re-activates the layer that was active, keeping the tool selected in its group.
test('a tool in a native group stays in hand across a redraw of the scene', async ({ world }) => {
    await useTool(world, 'room');
    await world.evaluate(async () => {
        await canvas?.draw();
    });
    await holdView(world);
    await drawShape(world, SQUARE.slice(0, 3));
    await expect.poll(async () => wallCount(world)).toBe(3);
});

// The module's own group has no canvas layer, so a redraw falls back to Tokens: the draw layer must come back idle.
test('a redraw under a tool of the module group leaves the pointer to Foundry', async ({ world }) => {
    await useTool(world, 'road');
    await world.evaluate(async () => {
        await canvas?.draw();
    });
    const after = await world.evaluate(() => ({ control: ui.controls?.control?.name, layerMode: canvas?.stage?.children.at(-1)?.eventMode }));
    expect(after).toEqual({ control: 'tokens', layerMode: 'none' });
});

// A group the module shares still has Foundry's own tools: with one of those in hand, a redraw must not wake the layer.
test('a redraw under Foundry’s own Walls tool leaves the pointer to Foundry', async ({ world }) => {
    await activate(world, 'walls', 'wall');
    await world.evaluate(async () => {
        await canvas?.draw();
    });
    const after = await world.evaluate(() => ({
        control: ui.controls?.control?.name,
        tool: ui.controls?.tool?.name,
        layerMode: canvas?.stage?.children.at(-1)?.eventMode,
    }));
    expect(after).toEqual({ control: 'walls', tool: 'wall', layerMode: 'none' });
});

// Choosing another texture set rebuilds the draw layer while Foundry's controls stay put.
test('a tool stays in hand when the draw layer rebuilds for another texture set', async ({ world }) => {
    await useTool(world, 'road');
    await world.evaluate(async () => {
        await game.settings?.set('zephyrex-cartography', 'textureSet', 'another-set');
    });
    await holdView(world);
    await drawShape(world, [
        { x: 300, y: 1000 },
        { x: 900, y: 1000 },
    ]);
    await expect.poll(async () => (await featureAt(world, { x: 600, y: 1000 }))?.type).toBe('path');
});

test('the Undo and Redo buttons take a drawn room back and bring it back', async ({ world }) => {
    await useTool(world, 'room');
    await holdView(world);
    await drawShape(world, SQUARE);
    await expect.poll(async () => wallCount(world)).toBe(4);
    await activate(world, MODULE_ID, 'road');
    await world.locator('button[data-tool="undo"]').click();
    await expect.poll(async () => wallCount(world)).toBe(0);
    await world.locator('button[data-tool="redo"]').click();
    await expect.poll(async () => wallCount(world)).toBe(4);
});

test('the room tool draws on empty canvas with the real mouse', async ({ world }) => {
    await useTool(world, 'room');
    await holdView(world);
    await drawShape(world, SQUARE.slice(0, 3));
    await expect.poll(async () => wallCount(world)).toBe(3);
});

test('the layer takes the pointer only while one of its tools is active', async ({ world }) => {
    await holdView(world);
    const probe = await clientPoint(world, { x: 1000, y: 750 });
    const ours = async (): Promise<boolean> =>
        world.evaluate(({ x, y }) => {
            // The draw layer is the last child of the stage; is it what a click at (x, y) lands on?
            const layer = canvas?.stage?.children.at(-1);
            let hit = canvas?.app?.renderer.events.rootBoundary.hitTest(x, y) ?? null;
            while (hit && hit !== layer) {
                hit = hit.parent;
            }
            return hit !== null && hit === layer;
        }, probe);
    await useTool(world, 'road');
    expect(await ours()).toBe(true);
    await activate(world, 'walls', 'wall');
    expect(await ours()).toBe(false);
});

test('the paint tool paints the texture and brush size picked in its panel: an area by clicks, a stroke by dragging', async ({ world }) => {
    await useTool(world, 'paint', { panel: true });
    const panel = world.locator(`#${MODULE_ID}-paint`);
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Forest' }).click();
    await expect(panel.getByRole('button', { name: 'Forest' })).toHaveAttribute('aria-pressed', 'true');
    await panel.getByLabel('Brush size (px)').fill('60');
    await panel.getByLabel('Brush size (px)').press('Enter');
    await tuckPanels(world);
    await holdView(world);
    await drawShape(world, SQUARE);
    await dragScene(world, { x: 1000, y: 300 }, [
        { x: 1100, y: 320 },
        { x: 1200, y: 300 },
        { x: 1300, y: 340 },
    ]);
    await expect.poll(async () => featureAt(world, { x: 450, y: 450 })).toMatchObject({ type: 'region', biome: 'forest' });
    await expect.poll(async () => featureAt(world, { x: 1100, y: 320 })).toMatchObject({ type: 'stroke', biome: 'forest', radius: 60 });
});

test('the paint tool blends texture into the level’s splat map, saved as an exact mask and undone as one stroke', async ({ world }) => {
    await useTool(world, 'paint', { panel: true });
    const panel = world.locator(`#${MODULE_ID}-paint`);
    await panel.getByLabel('Brush', { exact: true }).selectOption('blend');
    await panel.getByRole('button', { name: 'Sand' }).click();
    await panel.getByLabel('Brush size (px)').fill('150');
    await panel.getByLabel('Brush size (px)').press('Enter');
    await panel.getByLabel('Strength (0.05–1)').fill('1');
    await panel.getByLabel('Strength (0.05–1)').press('Enter');
    await tuckPanels(world);
    await holdView(world);
    await dragScene(world, { x: 500, y: 700 }, [
        { x: 800, y: 720 },
        { x: 1100, y: 700 },
        { x: 1400, y: 740 },
    ]);
    // The stroke is saved as it ends: the layer on the scene, the mask in the world's data.
    const saved = async (): Promise<{ roles: readonly (string | null)[]; weight: number } | null> =>
        world.evaluate(async () => {
            const layer = game.modules?.get('zephyrex-cartography').api.controller()?.splatLayer();
            if (!layer) {
                return null;
            }
            const response = await fetch(layer.path, { cache: 'no-store' });
            // The upload may still be on its way.
            if (!response.ok || response.headers.get('content-type') !== 'image/png') {
                return null;
            }
            const bytes = new Uint8Array(await response.arrayBuffer());
            // Read the saved PNG back with the browser's own decoder: the red channel of the pixel under the stroke's middle.
            // Through WebGL, unpremultiplied: a 2D canvas would zero every channel where the unused fourth one (alpha) is 0.
            const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
            const gl = new OffscreenCanvas(1, 1).getContext('webgl2');
            if (!gl) {
                return null;
            }
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
            gl.bindFramebuffer(gl.FRAMEBUFFER, gl.createFramebuffer());
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            const scale = bitmap.width / layer.bounds.width;
            const pixel = new Uint8Array(4);
            gl.readPixels(Math.floor((1100 - layer.bounds.x) * scale), Math.floor((700 - layer.bounds.y) * scale), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            return { roles: layer.roles, weight: pixel[0] ?? -1 };
        });
    await expect.poll(saved).toMatchObject({ roles: ['sand', null, null, null] });
    expect((await saved())?.weight).toBeGreaterThan(150);
    await frameScene(world);
    await expect(world.locator('#board')).toHaveScreenshot('sand-blend.png');

    await world.evaluate(async () => game.modules?.get('zephyrex-cartography').api.controller()?.undo());
    await expect.poll(async () => (await saved())?.weight).toBe(0);
});

test('the river tool draws the liquid, shade, bed and width picked in its panel', async ({ world }) => {
    await useTool(world, 'river', { panel: true });
    const panel = world.locator(`#${MODULE_ID}-paths`);
    await expect(panel).toBeVisible();
    await panel.getByLabel('Liquid').selectOption('lava');
    // A new liquid starts from its own shade and bed.
    await expect(panel.getByLabel('Shade')).toHaveValue('#ff5a1e');
    await expect(panel.getByLabel('Bed')).toHaveValue('rock');
    await panel.getByLabel('Bed').selectOption('sand');
    await panel.getByLabel('Width (px)').fill('80');
    await panel.getByLabel('Width (px)').press('Enter');
    await tuckPanels(world);
    await holdView(world);
    await drawShape(world, [
        { x: 300, y: 600 },
        { x: 900, y: 650 },
        { x: 1500, y: 600 },
    ]);
    await expect
        .poll(async () =>
            world.evaluate(() => {
                const controller = game.modules?.get('zephyrex-cartography').api.controller();
                const id = controller?.hitTest({ x: 900, y: 650 }) ?? null;
                const river = id === null ? null : controller?.getFeature(id);
                return river?.type === 'path' ? { river: river.river, halfWidth: river.halfWidths[1] } : null;
            }),
        )
        .toEqual({ river: { liquid: 'lava', shade: 0xff5a1e, bed: 'sand' }, halfWidth: 40 });
    await frameScene(world);
    await expect(world.locator('#board')).toHaveScreenshot('lava-river-on-sand.png');
});

test('the edit tool drags a room corner, and right-click deletes one', async ({ world }) => {
    await useTool(world, 'room');
    await holdView(world);
    await drawShape(world, SQUARE);
    await expect.poll(async () => wallCount(world)).toBe(4);
    await useTool(world, 'edit');
    await dragScene(world, { x: 600, y: 600 }, [{ x: 700, y: 700 }]);
    const corners = async (): Promise<boolean> =>
        world.evaluate(() => (canvas?.scene?.walls.contents ?? []).some((wall) => wall.c[0] === 700 && wall.c[1] === 700));
    await expect.poll(corners).toBe(true);
    await clickScene(world, { x: 700, y: 700 }, 'right');
    await expect.poll(async () => wallCount(world)).toBe(3);
});

// A GM who holds the press before dragging makes a Shift long-press, which Foundry would turn into a ping that pulls
// every view to the point, mid-drag. The tool's press must be the tool's alone.
test('the edit tool sets a road width by Shift-dragging a point, however long the press', async ({ world }) => {
    await useTool(world, 'road');
    await holdView(world);
    await drawShape(world, [
        { x: 300, y: 1000 },
        { x: 900, y: 1000 },
    ]);
    await expect.poll(async () => (await featureAt(world, { x: 600, y: 1000 }))?.type).toBe('path');
    await useTool(world, 'edit');
    await dragScene(world, { x: 900, y: 1000 }, [{ x: 900, y: 1080 }], { shift: true, holdMs: LONG_PRESS_MS });
    // The pointer maps back from a zoomed view, so the width is 80 to within float error.
    await expect.poll(async () => Math.round((await featureAt(world, { x: 600, y: 1000 }))?.halfWidths[1] ?? 0)).toBe(80);
});

test('the door tool makes a room wall a door, then opens its panel', async ({ world }) => {
    await useTool(world, 'room');
    await holdView(world);
    await drawShape(world, SQUARE);
    await useTool(world, 'door');
    await clickScene(world, { x: 450, y: 300 });
    await expect.poll(async () => world.evaluate(() => (canvas?.scene?.walls.contents ?? []).filter((wall) => wall.door === 1).length)).toBe(1);
    await clickScene(world, { x: 450, y: 300 });
    await expect(world.locator(`#${MODULE_ID}-door`)).toBeVisible();
});

test('the materials tool opens a room’s materials, and the erase tool removes the room', async ({ world }) => {
    await useTool(world, 'room');
    await holdView(world);
    await drawShape(world, SQUARE);
    await expect.poll(async () => wallCount(world)).toBe(4);
    await useTool(world, 'materials');
    await clickScene(world, { x: 450, y: 450 });
    await expect(world.locator(`#${MODULE_ID}-materials`)).toBeVisible();
    await useTool(world, 'erase');
    await clickScene(world, { x: 450, y: 450 });
    await expect.poll(async () => wallCount(world)).toBe(0);
});

test('the stamp tool places the stamp armed in the browser where the GM clicks', async ({ world }) => {
    await useTool(world, 'stamp');
    await holdView(world);
    const card = world.locator(`#${MODULE_ID}-stamp-browser [data-stamp-key="zc-e2e-pack:crate"]`);
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    // Tuck the browser away, as a GM would, so the click lands on the canvas; the stamp stays armed.
    await world.evaluate(async (id) => {
        await foundry.applications.instances.get(id)?.minimize();
    }, `${MODULE_ID}-stamp-browser`);
    await clickScene(world, { x: 350, y: 350 });
    await expect
        .poll(async () =>
            world.evaluate(() => {
                const tile = canvas?.scene?.tiles.contents[0];
                return tile ? { x: tile.x, y: tile.y } : null;
            }),
        )
        .toEqual({ x: 350, y: 350 });
});

test('the link tool, with the Lighting tools, picks a switch and links a lamp and a plain light to it', async ({ world }) => {
    const ids = await world.evaluate(async () => {
        const controller = game.modules?.get('zephyrex-cartography').api.controller();
        const switchId = (await controller?.placeStamp({ stamp: 'zc-e2e-pack:switch', x: 300, y: 300 })) ?? '';
        const lampId = (await controller?.placeStamp({ stamp: 'zc-e2e-pack:lamp', x: 700, y: 300 })) ?? '';
        const [plain] = (await canvas?.scene?.createEmbeddedDocuments('AmbientLight', [{ x: 1000, y: 600, config: { dim: 10, bright: 5 } }])) ?? [];
        return { switchId, lampId, plainId: plain?.id ?? '' };
    });
    await useTool(world, 'link');
    await holdView(world);
    await clickScene(world, { x: 300, y: 300 });
    await clickScene(world, { x: 700, y: 300 });
    await clickScene(world, { x: 1000, y: 600 });
    const targets = async (): Promise<readonly { kind: string; id: string }[]> =>
        world.evaluate((id) => game.modules?.get('zephyrex-cartography').api.controller()?.switchTargets(id) ?? [], ids.switchId);
    await expect.poll(targets).toEqual([
        { kind: 'feature', id: ids.lampId },
        { kind: 'light', id: ids.plainId },
    ]);
    // Clicking a linked target again unlinks it.
    await clickScene(world, { x: 700, y: 300 });
    await expect.poll(targets).toEqual([{ kind: 'light', id: ids.plainId }]);
});
