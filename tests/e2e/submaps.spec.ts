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
        };
    });
    expect(result.interiorName).toBe('Hab interior');
    expect(result.entranceTo).toEqual([result.exitUuid]);
    expect(result.exitTo).toEqual([result.entranceUuid]);
});
