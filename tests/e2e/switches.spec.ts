// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Light switches in Foundry: a switch stamp's wall is a native door that
 * blocks nothing, and opening or closing it (as a player does with Foundry's
 * own door control) turns what it controls on and off.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './lib/foundry';

/** Place a switch and a lamp, add a plain light, and link both to the switch; returns the plain light's id. */
async function wireSwitch(page: Page): Promise<string> {
    return page.evaluate(async () => {
        const controller = game.modules?.get('zephyrex-cartography').api.controller();
        const switchId = await controller?.placeStamp({ stamp: 'zc-e2e-pack:switch', x: 300, y: 300 });
        const lampId = await controller?.placeStamp({ stamp: 'zc-e2e-pack:lamp', x: 700, y: 300 });
        const [plain] = (await canvas?.scene?.createEmbeddedDocuments('AmbientLight', [{ x: 1000, y: 600, config: { dim: 10, bright: 5 } }])) ?? [];
        const plainId = plain?.id ?? '';
        await controller?.toggleSwitchTarget(switchId ?? '', { kind: 'feature', id: lampId ?? '' });
        await controller?.toggleSwitchTarget(switchId ?? '', { kind: 'light', id: plainId });
        return plainId;
    });
}

/** Open (on) or close (off) the switch's door, as Foundry's own door control does. */
async function flip(page: Page, on: boolean): Promise<void> {
    await page.evaluate(async (switchedOn) => {
        const wall = canvas?.scene?.walls.contents.find((w) => w.door === CONST.WALL_DOOR_TYPES.DOOR);
        await wall?.update({ ds: switchedOn ? CONST.WALL_DOOR_STATES.OPEN : CONST.WALL_DOOR_STATES.CLOSED });
    }, on);
}

async function lampAndLight(page: Page, plainId: string): Promise<{ lamp: string; plainHidden: boolean | undefined }> {
    return page.evaluate((id) => {
        const lamp = canvas?.scene?.tiles.contents.find((t) => t.name === 'Lamp')?.texture.src;
        return { lamp: lamp?.split('/').at(-1) ?? '', plainHidden: canvas?.scene?.lights.get(id).hidden };
    }, plainId);
}

test('a light switch’s wall is a door that blocks nothing', async ({ world }) => {
    await wireSwitch(world);
    const wall = await world.evaluate(() => {
        const found = canvas?.scene?.walls.contents.find((w) => w.door === CONST.WALL_DOOR_TYPES.DOOR);
        return found && { sight: found.sight, light: found.light, sound: found.sound, move: found.move };
    });
    expect(wall).toEqual({ sight: 0, light: 0, sound: 0, move: 0 });
});

test('flipping a switch in play turns its lamp and its plain light off and on', async ({ world }) => {
    const plainId = await wireSwitch(world);
    // The switch starts off; opening its door turns it on, which shows the plain light and keeps the lamp lit.
    await flip(world, true);
    await expect.poll(async () => lampAndLight(world, plainId)).toEqual({ lamp: 'lamp-lit.svg', plainHidden: false });
    await flip(world, false);
    await expect.poll(async () => lampAndLight(world, plainId)).toEqual({ lamp: 'lamp-unlit.svg', plainHidden: true });
    await flip(world, true);
    await expect.poll(async () => lampAndLight(world, plainId)).toEqual({ lamp: 'lamp-lit.svg', plainHidden: false });
});
