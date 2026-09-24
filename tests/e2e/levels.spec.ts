// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './lib/foundry';

test('a stair is one native changeLevel region spanning the floors it joins', async ({ world }) => {
    const result = await world.evaluate(async () => {
        const controller = game.modules?.get('zephyrex-cartography').api.controller();
        const ground = await controller?.addLevel('above', 'Ground');
        const upper = await controller?.addLevel('above', 'Upper');
        controller?.setActiveLevel(ground ?? null);
        await controller?.placeStamp({ stamp: 'zc-e2e-pack:stairs', x: 600, y: 600 });
        const regions = canvas?.scene?.regions.contents ?? [];
        const byName = (a: string, b: string): number => a.localeCompare(b);
        return {
            count: regions.length,
            behaviours: regions.flatMap((region) => region.behaviors.contents.map((behaviour) => behaviour.type)),
            levels: regions.flatMap((region) => [...region.levels]).sort(byName),
            // A fresh v14 scene has a default Level, so Ground sits between it and Upper, and a two-way stair joins all three.
            expected: (canvas?.scene?.levels.contents ?? []).map((level) => level.id).sort(byName),
            joins: [ground, upper],
        };
    });
    expect(result.count).toBe(1);
    expect(result.behaviours).toEqual(['changeLevel']);
    expect(result.expected).toHaveLength(3);
    expect(result.levels).toEqual(result.expected);
    expect(result.levels).toEqual(expect.arrayContaining(result.joins));
});

test('a room on an upper level has a floor Foundry treats as a solid surface from both levels', async ({ world }) => {
    const result = await world.evaluate(async () => {
        const controller = game.modules?.get('zephyrex-cartography').api.controller();
        const ground = await controller?.addLevel('above', 'Ground');
        const upper = await controller?.addLevel('above', 'Upper');
        controller?.setActiveLevel(upper ?? null);
        controller?.begin({ type: 'room', floor: 'dirt' }, 'click');
        for (const at of [
            { x: 200, y: 200 },
            { x: 600, y: 200 },
            { x: 600, y: 600 },
            { x: 200, y: 600 },
        ]) {
            controller?.addPoint(at);
        }
        await controller?.commit();
        const scene = canvas?.scene;
        const base = scene?.levels.contents.find((level) => level.id === upper)?.elevation.bottom ?? null;
        // Foundry refreshes its surfaces when a surface comes into view, as it does when a GM views a level it is on.
        const seen = async (level: string | null | undefined): Promise<{ elevation: number; move: boolean; sight: boolean }[]> => {
            await scene?.view({ level: level ?? '' });
            return (canvas?.scene?.getSurfaces({ level: level ?? '' }) ?? []).map((surface) => ({
                elevation: surface.elevation,
                move: surface.move,
                sight: surface.sight,
            }));
        };
        return { base, fromUpper: await seen(upper), fromGround: await seen(ground) };
    });
    const floor = { elevation: result.base, move: true, sight: true };
    expect(result.fromUpper).toEqual([floor]);
    expect(result.fromGround).toEqual([floor]);
});

test('a level’s own images are its native Level background, foreground and fog', async ({ world }) => {
    const result = await world.evaluate(async () => {
        const art = { background: 'modules/zc-e2e-pack/stamps/hab.svg', foreground: null, fog: 'modules/zc-e2e-pack/stamps/crate.svg' };
        await game.modules
            ?.get('zephyrex-cartography')
            .api.buildSpec({ schemaVersion: 1, levels: [{ key: 'g', name: 'Painted', background: art.background, fog: art.fog }], features: [] });
        const level = canvas?.scene?.levels.contents.find((l) => l.name === 'Painted');
        return { expected: art, actual: { background: level?.background.src ?? null, foreground: level?.foreground.src ?? null, fog: level?.fog.src ?? null } };
    });
    expect(result.actual).toEqual(result.expected);
});

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

test('a new level, above or below, is 4 grid squares tall, as Foundry v14 makes them', async ({ world }) => {
    const heights = await world.evaluate(async () => {
        const controller = game.modules?.get('zephyrex-cartography').api.controller();
        const loft = await controller?.addLevel('above', 'Loft');
        const cellar = await controller?.addLevel('below', 'Cellar');
        return [loft, cellar].map((id) => {
            const level = canvas?.scene?.levels.contents.find((l) => l.id === id);
            return level ? (level.elevation.top ?? 0) - (level.elevation.bottom ?? 0) : null;
        });
    });
    // The e2e system's grid is 5 distance units per square.
    expect(heights).toEqual([20, 20]);
});

test('a Level a GM makes with an open ceiling is read as 4 grid squares tall', async ({ world }) => {
    await world.evaluate(async () => {
        await canvas?.scene?.createEmbeddedDocuments('Level', [{ name: 'Sky', elevation: { bottom: 100, top: null } }]);
    });
    // The createLevel hook re-reads the levels asynchronously.
    await expect
        .poll(async () =>
            world.evaluate(() => {
                const sky = game.modules
                    ?.get('zephyrex-cartography')
                    .api.controller()
                    ?.levels.find((l) => l.name === 'Sky');
                return sky && { bottom: sky.bottom, top: sky.top };
            }),
        )
        .toEqual({ bottom: 100, top: 120 });
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
