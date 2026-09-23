// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, frameScene, test } from './lib/foundry';

test('a room spec becomes native walls, a door and a light', async ({ world }) => {
    const result = await world.evaluate(async () => {
        const outcome = await game.modules?.get('zephyrex-cartography').api.buildSpec({
            schemaVersion: 1,
            features: [
                {
                    type: 'room',
                    points: [
                        { x: 2, y: 2 },
                        { x: 7, y: 2 },
                        { x: 7, y: 6 },
                        { x: 2, y: 6 },
                    ],
                    doors: [{ segment: 1, state: 'open' }],
                },
            ],
        });
        const walls = canvas?.scene?.walls.contents ?? [];
        return {
            ok: outcome?.ok,
            walls: walls.length,
            doors: walls.filter((w) => w.door === 1).map((w) => ({ c: w.c, ds: w.ds })),
            lights: canvas?.scene?.lights.size,
        };
    });
    expect(result.ok).toBe(true);
    expect(result.walls).toBe(4);
    // The right-hand wall (grid x = 7) is the door, left open.
    expect(result.doors).toEqual([{ c: [700, 200, 700, 600], ds: 1 }]);
    expect(result.lights).toBe(1);
    await frameScene(world, 'walls');
    await expect(world.locator('#board')).toHaveScreenshot('room-with-door.png');
});

test('a generated floor plan is walled rooms joined by one-square doors, undone in one step', async ({ world }) => {
    const built = await world.evaluate(async () => {
        const api = game.modules?.get('zephyrex-cartography').api;
        const plan = api?.generateFloorPlan({ seed: 7, width: 16, height: 12 });
        const outcome = await api?.buildSpec(plan);
        const walls = canvas?.scene?.walls.contents ?? [];
        const doorLengths = walls.filter((w) => w.door === 1).map((w) => Math.hypot(w.c[2] - w.c[0], w.c[3] - w.c[1]));
        return { rooms: plan?.features.length ?? 0, ok: outcome?.ok, doorLengths };
    });
    expect(built.ok).toBe(true);
    // One door per split (rooms - 1) plus the entrance.
    expect(built.doorLengths).toHaveLength(built.rooms);
    expect(new Set(built.doorLengths)).toEqual(new Set([100]));
    await frameScene(world, 'walls');
    await expect(world.locator('#board')).toHaveScreenshot('floor-plan-seed-7.png');

    const afterUndo = await world.evaluate(async () => {
        await game.modules?.get('zephyrex-cartography').api.controller()?.undo();
        return { walls: canvas?.scene?.walls.size, lights: canvas?.scene?.lights.size };
    });
    expect(afterUndo).toEqual({ walls: 0, lights: 0 });
});

test('a spec with problems reports them instead of throwing', async ({ world }) => {
    const outcome = await world.evaluate(async () =>
        game.modules?.get('zephyrex-cartography').api.buildSpec({ schemaVersion: 1, features: [{ type: 'region', biome: 'quicksand' }] }),
    );
    expect(outcome?.ok).toBe(false);
});
