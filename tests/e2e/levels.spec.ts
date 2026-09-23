// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './lib/foundry';

test('levels are native Level documents, and a room on one has walls on that level only', async ({ world }) => {
    const result = await world.evaluate(async () => {
        const api = game.modules?.get('zephyrex-cartography').api;
        const ground = await api?.controller()?.addLevel('above', 'Ground');
        await api?.controller()?.addLevel('above', 'Upper');
        await api?.buildSpec({
            schemaVersion: 1,
            levels: [{ key: 'attic', name: 'Attic' }],
            features: [
                {
                    type: 'room',
                    level: 'attic',
                    points: [
                        { x: 1, y: 1 },
                        { x: 4, y: 1 },
                        { x: 4, y: 4 },
                        { x: 1, y: 4 },
                    ],
                },
            ],
        });
        const levels = (canvas?.scene?.levels.contents ?? []).map((l) => l.name);
        const attic = canvas?.scene?.levels.contents.find((l) => l.name === 'Attic')?.id;
        const wallLevels = (canvas?.scene?.walls.contents ?? []).map((w) => [...w.levels]);
        return { ground: ground !== null, levels, attic, wallLevels };
    });
    expect(result.ground).toBe(true);
    expect(result.levels).toEqual(expect.arrayContaining(['Ground', 'Upper', 'Attic']));
    expect(result.wallLevels).toHaveLength(4);
    for (const levels of result.wallLevels) {
        expect(levels).toEqual([result.attic]);
    }
});

test('a Level deleted in Foundry takes its features with it', async ({ world }) => {
    const built = await world.evaluate(async () => {
        const api = game.modules?.get('zephyrex-cartography').api;
        const outcome = await api?.buildSpec({
            schemaVersion: 1,
            levels: [{ key: 'cellar', name: 'Cellar' }],
            features: [
                {
                    type: 'room',
                    level: 'cellar',
                    points: [
                        { x: 1, y: 1 },
                        { x: 3, y: 1 },
                        { x: 3, y: 3 },
                    ],
                },
            ],
        });
        const cellar = outcome?.ok === true ? outcome.report.levels['cellar'] : undefined;
        if (cellar !== undefined) {
            await canvas?.scene?.deleteEmbeddedDocuments('Level', [cellar]);
        }
        return cellar !== undefined;
    });
    expect(built).toBe(true);
    // The deleteLevel hook re-syncs asynchronously.
    await expect
        .poll(async () =>
            world.evaluate(() => ({
                features: game.modules?.get('zephyrex-cartography').api.controller()?.levelCounts(),
                walls: canvas?.scene?.walls.size,
            })),
        )
        .toEqual({ features: {}, walls: 0 });
});
