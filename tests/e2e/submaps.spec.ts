// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './lib/foundry';

test('an enterable stamp opens into a new interior scene, each side teleporting to the other', async ({ world }) => {
    const result = await world.evaluate(async () => {
        const controller = game.modules?.get('zephyrex-cartography').api.controller();
        const stamp = await controller?.placeStamp({ stamp: 'zc-e2e-pack:hab', x: 600, y: 600 });
        const interior = stamp === null || stamp === undefined ? null : await controller?.createInterior(stamp, 'Hab interior');
        const here = canvas?.scene;
        const there = interior === null || interior === undefined ? undefined : game.scenes?.get(interior);
        // fvtt-types still describes v13's single `destination`; v14 holds a set of `destinations`.
        const destinations = (region: RegionDocument | undefined): string[] => {
            const system: object | undefined = region?.behaviors.contents[0]?.system;
            return system !== undefined && 'destinations' in system && system.destinations instanceof Set ? [...system.destinations].map(String) : [];
        };
        const entrance = here?.regions.contents[0];
        const exit = there?.regions.contents[0];
        return {
            interiorName: there?.name,
            entranceTo: destinations(entrance),
            exitTo: destinations(exit),
            entranceUuid: entrance?.uuid,
            exitUuid: exit?.uuid,
            locked: [entrance?.locked, exit?.locked],
            visibility: [entrance?.visibility, exit?.visibility],
        };
    });
    expect(result.interiorName).toBe('Hab interior');
    expect(result.entranceTo).toEqual([result.exitUuid]);
    expect(result.exitTo).toEqual([result.entranceUuid]);
    // The entrance follows the stamp, so it is locked; the exit is the GM's to place. Both show on the Regions layer.
    expect(result.locked).toEqual([true, false]);
    expect(result.visibility).toEqual([0, 0]);

    // Moving the stamp redraws the entrance in place, under the same id and with its teleport, so the exit still reaches it.
    await world.evaluate(async () => {
        await canvas?.scene?.tiles.contents[0]?.update({ x: 900, y: 700 });
    });
    await expect
        .poll(async () =>
            world.evaluate(() => {
                const entrance = canvas?.scene?.regions.contents[0];
                const xs = entrance?.shapes.flatMap((shape) => ('points' in shape ? [...shape.points].filter((_, i) => i % 2 === 0) : [])) ?? [];
                const system: object | undefined = entrance?.behaviors.contents[0]?.system;
                const destinations =
                    system !== undefined && 'destinations' in system && system.destinations instanceof Set ? [...system.destinations].map(String) : [];
                return { uuid: entrance?.uuid, count: canvas?.scene?.regions.size, moved: xs.length > 0 && Math.min(...xs) > 600, destinations };
            }),
        )
        .toEqual({ uuid: result.entranceUuid, count: 1, moved: true, destinations: [result.exitUuid] });
});
