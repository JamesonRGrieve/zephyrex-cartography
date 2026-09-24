// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, frameScene, test } from './lib/foundry';

test('a room of window walls gets Foundry’s window walls, and its door stays solid', async ({ world }) => {
    const walls = await world.evaluate(async () => {
        await game.modules?.get('zephyrex-cartography').api.buildSpec({
            schemaVersion: 1,
            features: [
                {
                    type: 'room',
                    wallKind: 'window',
                    points: [
                        { x: 2, y: 2 },
                        { x: 6, y: 2 },
                        { x: 6, y: 6 },
                        { x: 2, y: 6 },
                    ],
                    doors: [{ segment: 0 }],
                },
            ],
        });
        return (canvas?.scene?.walls.contents ?? []).map((w) => ({ door: w.door, sight: w.sight, light: w.light, lightThreshold: w.threshold.light }));
    });
    // EDGE_SENSE_TYPES: NORMAL 20, PROXIMITY 30. A window reaches 2 squares: 10 distance units at the scene's 5 per square.
    expect(walls.filter((w) => w.door === 0)).toEqual(Array.from({ length: 3 }, () => ({ door: 0, sight: 30, light: 30, lightThreshold: 10 })));
    expect(walls.filter((w) => w.door === 1)).toEqual([{ door: 1, sight: 20, light: 20, lightThreshold: null }]);
});

test('a spec sets the scene’s own darkness, fog, vision, weather and transition', async ({ world }) => {
    const scene = await world.evaluate(async () => {
        await game.modules?.get('zephyrex-cartography').api.buildSpec({
            schemaVersion: 1,
            scene: { darkness: 0.75, darknessLock: true, globalLight: true, tokenVision: false, fog: 'shared', transition: { type: 'fade', duration: 800 } },
            features: [],
        });
        const s = canvas?.scene;
        return (
            s && {
                darkness: s.environment.darknessLevel,
                lock: s.environment.darknessLock,
                globalLight: s.environment.globalLight.enabled,
                tokenVision: s.tokenVision,
                fog: s.fog.mode,
                transition: { type: s.transition.type, duration: s.transition.duration },
            }
        );
    });
    // CONST.FOG_EXPLORATION_MODES.SHARED is 2.
    expect(scene).toEqual({ darkness: 0.75, lock: true, globalLight: true, tokenVision: false, fog: 2, transition: { type: 'fade', duration: 800 } });
});

test('a spec sets the scene’s day and night environments, their cycle and the fog’s colours, leaving the rest', async ({ world }) => {
    const scene = await world.evaluate(async () => {
        await game.modules?.get('zephyrex-cartography').api.buildSpec({
            schemaVersion: 1,
            scene: {
                cycle: false,
                base: { hue: 0.1, intensity: 0.4 },
                dark: { luminosity: -0.6, shadows: 0.3 },
                fogColours: { unexplored: '#102030' },
            },
            features: [],
        });
        const s = canvas?.scene;
        return (
            s && {
                cycle: s.environment.cycle,
                base: { hue: s.environment.base.hue, intensity: s.environment.base.intensity, luminosity: s.environment.base.luminosity },
                dark: { hue: s.environment.dark.hue, luminosity: s.environment.dark.luminosity, shadows: s.environment.dark.shadows },
                unexplored: s.fog.colors.unexplored?.css ?? null,
            }
        );
    });
    // Values left out keep Foundry's defaults: the dark environment's hue is 257/360.
    expect(scene?.cycle).toBe(false);
    expect(scene?.base).toEqual({ hue: 0.1, intensity: 0.4, luminosity: 0 });
    expect(scene?.dark.luminosity).toBe(-0.6);
    expect(scene?.dark.shadows).toBe(0.3);
    expect(scene?.dark.hue).toBeCloseTo(257 / 360);
    expect(scene?.unexplored).toBe('#102030');
});

test('difficult painted ground becomes a Modify Movement Cost region, with terrain mirroring off', async ({ world }) => {
    const regions = await world.evaluate(async () => {
        await game.modules?.get('zephyrex-cartography').api.buildSpec({
            schemaVersion: 1,
            features: [
                {
                    type: 'region',
                    biome: 'marsh',
                    movementCost: 2,
                    points: [
                        { x: 1, y: 1 },
                        { x: 5, y: 1 },
                        { x: 5, y: 5 },
                    ],
                },
                {
                    type: 'region',
                    biome: 'grassland',
                    points: [
                        { x: 7, y: 1 },
                        { x: 11, y: 1 },
                        { x: 11, y: 5 },
                    ],
                },
            ],
        });
        return (canvas?.scene?.regions.contents ?? []).map((r) => ({ name: r.name, behaviors: r.behaviors.contents.map((b) => b.toObject()) }));
    });
    expect(regions).toEqual([
        expect.objectContaining({
            behaviors: [
                expect.objectContaining({
                    type: 'modifyMovementCost',
                    system: expect.objectContaining({ difficulties: expect.objectContaining({ walk: 2 }) }),
                }),
            ],
        }),
    ]);
});

test('an area’s region shows as the spec says, and is shaped by walls only on exactly one level', async ({ world }) => {
    const regions = await world.evaluate(async () => {
        const square = (x: number): { x: number; y: number }[] => [
            { x, y: 1 },
            { x: x + 4, y: 1 },
            { x: x + 4, y: 5 },
            { x, y: 5 },
        ];
        const display = { visibility: 'always', highlight: 'coverage', measurements: true, observed: true, restriction: { type: 'sight', priority: 2 } };
        const outcome = await game.modules?.get('zephyrex-cartography').api.buildSpec({
            schemaVersion: 1,
            levels: [{ key: 'g', name: 'Ground' }],
            features: [
                { type: 'room', points: square(1), level: 'g', display },
                { type: 'region', biome: 'marsh', points: square(7), display },
            ],
        });
        return {
            problems: outcome?.ok === true ? outcome.report.problems : null,
            // The room's floor over the scene's own first level is left out.
            regions: (canvas?.scene?.regions.contents ?? [])
                .filter((r) => r.name === 'Room' || r.name === 'Marsh')
                .map((r) => ({
                    name: r.name,
                    visibility: r.visibility,
                    highlightMode: r.highlightMode,
                    displayMeasurements: r.displayMeasurements,
                    playersObserve: r.ownership['default'] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
                    restriction: { enabled: r.restriction.enabled, type: r.restriction.type, priority: r.restriction.priority },
                })),
        };
    });
    expect(regions.problems).toEqual([]);
    // Foundry's ALWAYS visibility is 2; the marsh shows on every level, which Foundry cannot restrict.
    const shown = { visibility: 2, highlightMode: 'coverage', displayMeasurements: true, playersObserve: true };
    expect(regions.regions).toEqual([
        { name: 'Room', ...shown, restriction: { enabled: true, type: 'sight', priority: 2 } },
        { name: 'Marsh', ...shown, restriction: expect.objectContaining({ enabled: false }) },
    ]);
});

test('a toggle names its area’s other behaviours by UUID, and a token walking in switches a disabled one on', async ({ world }) => {
    const built = await world.evaluate(async () => {
        await game.modules?.get('zephyrex-cartography').api.buildSpec({
            schemaVersion: 1,
            features: [
                {
                    type: 'room',
                    points: [
                        { x: 4, y: 4 },
                        { x: 8, y: 4 },
                        { x: 8, y: 8 },
                        { x: 4, y: 8 },
                    ],
                    // A door on the left wall, for the token to walk through.
                    doors: [{ segment: 3, state: 'open' }],
                    effects: [
                        { kind: 'darkness', modifier: 1, disabled: true },
                        { kind: 'toggle', events: ['tokenEnter'], enable: [0] },
                    ],
                },
            ],
        });
        const room = canvas?.scene?.regions.contents.find((r) => r.name === 'Room');
        const [darkness, toggle] = room?.behaviors.contents ?? [];
        const enable = toggle?.type === 'toggleBehavior' ? [...toggle.system.enable] : [];
        return {
            types: room?.behaviors.contents.map((b) => b.type),
            startsDisabled: darkness?.disabled,
            // The UUID the toggle holds resolves to the darkness behaviour itself.
            resolves: enable.map((uuid) => foundry.utils.fromUuidSync(uuid)?.id === darkness?.id),
        };
    });
    expect(built).toEqual({ types: ['adjustDarknessLevel', 'toggleBehavior'], startsDisabled: true, resolves: [true] });

    await world.evaluate(async () => {
        // Outside the room, level with the door, then into the room through it. Region events need no Actor.
        const [token] = (await canvas?.scene?.createEmbeddedDocuments('Token', [{ name: 'Walker', x: 200, y: 500 }])) ?? [];
        await token?.update({ x: 500, y: 500 });
    });
    const darknessDisabled = async (): Promise<boolean | undefined> =>
        world.evaluate(() => canvas?.scene?.regions.contents.find((r) => r.name === 'Room')?.behaviors.contents[0]?.disabled);
    await expect.poll(darknessDisabled).toBe(false);
});

test('a fenced road puts Foundry’s terrain walls along its centerline', async ({ world }) => {
    const walls = await world.evaluate(async () => {
        await game.modules?.get('zephyrex-cartography').api.buildSpec({
            schemaVersion: 1,
            features: [
                {
                    type: 'path',
                    kind: 'road',
                    walls: 'terrain',
                    points: [
                        { x: 1, y: 3 },
                        { x: 8, y: 3 },
                    ],
                },
            ],
        });
        return (canvas?.scene?.walls.contents ?? []).map((w) => ({ sight: w.sight, move: w.move }));
    });
    // EDGE_SENSE_TYPES: LIMITED 10, NORMAL 20.
    expect(walls.length).toBeGreaterThan(0);
    expect(new Set(walls.map((w) => JSON.stringify(w)))).toEqual(new Set([JSON.stringify({ sight: 10, move: 20 })]));
});

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
        let deleted = 0;
        const hook = Hooks.on('deleteWall', () => {
            deleted += 1;
        });
        const outcome = await api?.buildSpec(plan);
        Hooks.off('deleteWall', hook);
        const walls = canvas?.scene?.walls.contents ?? [];
        const doorLengths = walls.filter((w) => w.door === 1).map((w) => Math.hypot(w.c[2] - w.c[0], w.c[3] - w.c[1]));
        return { rooms: plan?.features.length ?? 0, ok: outcome?.ok, doorLengths, deleted };
    });
    expect(built.ok).toBe(true);
    // The build is one transaction: a room re-synced by a later neighbour replaces its pending walls, never written ones.
    expect(built.deleted).toBe(0);
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

test('a spec’s splat map blends the textures its mask weights over the whole scene, saved as the scene’s own mask', async ({ world }) => {
    const result = await world.evaluate(async () => {
        const api = game.modules?.get('zephyrex-cartography').api;
        const outcome = await api?.buildSpec({
            schemaVersion: 1,
            splats: [{ mask: 'modules/zc-e2e-pack/masks/sand-rock.png', roles: ['sand', 'rock', null, null] }],
            features: [],
        });
        const layer = api?.controller()?.splatLayer();
        return { problems: outcome?.ok === true ? outcome.report.problems : null, roles: layer?.roles, path: layer?.path, size: [layer?.width, layer?.height] };
    });
    expect(result.problems).toEqual([]);
    expect(result.roles).toEqual(['sand', 'rock', null, null]);
    // Copied to the scene's own mask file, so painting over it leaves the pack's image alone.
    expect(result.path).toMatch(/^worlds\/zc-e2e\/zephyrex-cartography\/splat-.+-all\.png$/u);
    expect(result.size).toEqual([40, 30]);
    await frameScene(world);
    await expect(world.locator('#board')).toHaveScreenshot('spec-splat.png');
});

test('a blend bakes into a native Tile over the scene, drawn without the module’s overlay, and unbakes back', async ({ world }) => {
    const baked = await world.evaluate(async () => {
        const api = game.modules?.get('zephyrex-cartography').api;
        await api?.buildSpec({
            schemaVersion: 1,
            splats: [{ mask: 'modules/zc-e2e-pack/masks/sand-rock.png', roles: ['sand', 'rock', null, null] }],
            features: [],
        });
        const controller = api?.controller();
        const ok = await controller?.bakeSplat();
        const tiles = (canvas?.scene?.tiles.contents ?? []).map((tile) => ({
            src: tile.texture.src ?? '',
            width: tile.width,
            height: tile.height,
            sort: tile.sort,
        }));
        return { ok, tiles, baked: controller?.splatBaked(), scene: { width: canvas?.dimensions?.sceneWidth, height: canvas?.dimensions?.sceneHeight } };
    });
    expect(baked.ok).toBe(true);
    expect(baked.baked).toBe(true);
    expect(baked.tiles).toEqual([{ src: expect.stringMatching(/splat-.+-all-baked\.png$/u), width: baked.scene.width, height: baked.scene.height, sort: -1 }]);
    await frameScene(world);
    // The Tile looks as the overlay did.
    await expect(world.locator('#board')).toHaveScreenshot('baked-splat.png');

    const unbaked = await world.evaluate(async () => {
        const controller = game.modules?.get('zephyrex-cartography').api.controller();
        return { ok: await controller?.unbakeSplat(), tiles: canvas?.scene?.tiles.size, baked: controller?.splatBaked() };
    });
    expect(unbaked).toEqual({ ok: true, tiles: 0, baked: false });
});
