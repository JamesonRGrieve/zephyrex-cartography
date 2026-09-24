// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { BLOCKS_ALL, type RegionDoc } from '../tools/documents';
import { DEFAULT_TRAVEL } from '../tools/submap';
import {
    doorStateFromDs,
    drawingCreateData,
    lightCreateData,
    noteCreateData,
    pxToDistance,
    regionCreateData,
    regionShape,
    regionUuid,
    sceneSettingsData,
    soundCreateData,
    tileCreateData,
    tileFrame,
    wallCreateData,
} from './translate';

const GRID = { size: 100, distance: 5 };

const BLOCKS_WALL = { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, door: 'none' as const, doorState: 'closed' as const, blocks: BLOCKS_ALL, level: null };

describe('wallCreateData', () => {
    it('translates a plain wall blocking every sense', () => {
        expect(wallCreateData({ a: { x: 0, y: 0 }, b: { x: 10, y: 5 }, door: 'none', doorState: 'closed', blocks: BLOCKS_ALL, level: null }, GRID)).toEqual({
            c: [0, 0, 10, 5],
            door: 0,
            ds: 0,
            sight: 20,
            light: 20,
            sound: 20,
            move: 20,
        });
    });

    it('translates door type, door state and unblocked senses', () => {
        const data = wallCreateData(
            {
                a: { x: 0, y: 0 },
                b: { x: 1, y: 0 },
                door: 'secret',
                doorState: 'locked',
                blocks: { sight: 'none', movement: true, light: 'none', sound: 'normal' },
                level: null,
            },
            GRID,
        );
        expect(data).toMatchObject({ door: 2, ds: 2, sight: 0, light: 0, sound: 20, move: 20 });
    });

    it('gives a door its sound and animation, leaves unset ones to Foundry, and a plain wall neither', () => {
        const door = { ...BLOCKS_WALL, door: 'door' as const };
        expect(wallCreateData({ ...door, look: { sound: 'slidingMetal', animation: { type: 'slide', duration: 500 } } }, GRID)).toMatchObject({
            doorSound: 'slidingMetal',
            animation: { type: 'slide', duration: 500 },
        });
        const defaults = wallCreateData({ ...door, look: { sound: null, animation: null } }, GRID);
        expect(defaults).not.toHaveProperty('doorSound');
        expect(defaults).not.toHaveProperty('animation');
        const plain = wallCreateData({ ...BLOCKS_WALL, look: { sound: 'metal', animation: { type: 'swing' } } }, GRID);
        expect(plain).not.toHaveProperty('doorSound');
    });

    it('flags a light switch’s wall, so its door control shows a light, and no other wall', () => {
        const door = { ...BLOCKS_WALL, door: 'door' as const };
        expect(wallCreateData({ ...door, lightSwitch: true }, GRID).flags).toEqual({ 'zephyrex-cartography': { lightSwitch: true } });
        expect(wallCreateData(door, GRID)).not.toHaveProperty('flags');
    });

    it('translates every sense level, one-way walls and thresholds in scene distance units', () => {
        const data = wallCreateData(
            {
                a: { x: 0, y: 0 },
                b: { x: 1, y: 0 },
                door: 'none',
                doorState: 'closed',
                blocks: { sight: 'limited', movement: false, light: 'proximity', sound: 'distance' },
                direction: 'left',
                threshold: { light: 2, attenuation: true },
                level: null,
            },
            GRID,
        );
        expect(data).toMatchObject({ sight: 10, light: 30, sound: 40, move: 0, dir: 1, threshold: { light: 10, sight: null, sound: null, attenuation: true } });
        expect(wallCreateData({ ...BLOCKS_WALL, direction: 'right' }, GRID).dir).toBe(2);
        expect(wallCreateData(BLOCKS_WALL, GRID)).not.toHaveProperty('dir');
    });

    it('puts a levelled wall on its native Level, and a level-less one on every level', () => {
        const wall = { ...BLOCKS_WALL, level: 'L1' };
        expect(wallCreateData(wall, GRID).levels).toEqual(['L1']);
        expect(wallCreateData({ ...wall, level: null }, GRID).levels).toBeUndefined();
    });
});

describe('doorStateFromDs', () => {
    it('maps Foundry door states back, and rejects unknown values', () => {
        expect([0, 1, 2].map(doorStateFromDs)).toEqual(['closed', 'open', 'locked']);
        expect(doorStateFromDs(7)).toBeNull();
    });
});

describe('pxToDistance', () => {
    it('converts px to scene distance units via the grid', () => {
        expect(pxToDistance(250, GRID)).toBe(12.5);
        expect(pxToDistance(250, { size: 0, distance: 5 })).toBe(0);
    });
});

describe('lightCreateData', () => {
    it('converts radii to distance units and passes optional styling through', () => {
        expect(
            lightCreateData(
                {
                    source: { kind: 'stamp', name: 'Lamp' },
                    x: 1,
                    y: 2,
                    dim: 400,
                    bright: 200,
                    color: '#ff0000',
                    angle: 90,
                    rotation: 45,
                    animation: { type: 'torch' },
                    elevation: 3,
                    level: 'L2',
                },
                GRID,
                'Lamp light',
            ),
        ).toEqual({
            name: 'Lamp light',
            x: 1,
            y: 2,
            elevation: 3,
            rotation: 45,
            config: { dim: 20, bright: 10, color: '#ff0000', angle: 90, animation: { type: 'torch' } },
            levels: ['L2'],
        });
    });

    it('omits absent optional styling and defaults rotation to 0', () => {
        expect(lightCreateData({ source: { kind: 'room' }, x: 0, y: 0, dim: 100, bright: 0, elevation: 0, level: null }, GRID, 'Room light')).toEqual({
            name: 'Room light',
            x: 0,
            y: 0,
            elevation: 0,
            rotation: 0,
            config: { dim: 5, bright: 0 },
        });
    });
});

describe('tileCreateData', () => {
    it('places the tile by its centre anchor, with its level and owning feature flag', () => {
        expect(
            tileCreateData({ name: 'Lamp', src: 'a.png', x: 10, y: 20, width: 30, height: 40, rotation: 90, elevation: 5, level: 'L1', featureId: 'f1' }),
        ).toEqual({
            name: 'Lamp',
            texture: { src: 'a.png', anchorX: 0.5, anchorY: 0.5 },
            x: 25,
            y: 40,
            width: 30,
            height: 40,
            rotation: 90,
            elevation: 5,
            flags: { 'zephyrex-cartography': { featureId: 'f1' } },
            levels: ['L1'],
        });
    });
});

describe('stamp tile and light behaviour', () => {
    const tile = { name: 'Roof', src: 'roof.webp', x: 0, y: 0, width: 100, height: 100, rotation: 0, elevation: 0, level: null, featureId: 'f' };

    it('gives a tile its pack’s opacity, occlusion modes as Foundry’s values, restrictions and video', () => {
        const data = tileCreateData({
            ...tile,
            look: {
                alpha: 0.9,
                hidden: true,
                occlusion: { modes: ['fade', 'radial'], alpha: 0.25 },
                alphaThreshold: 0.5,
                restrictions: { light: true },
                video: { loop: false },
            },
        });
        expect(data).toMatchObject({
            alpha: 0.9,
            hidden: true,
            occlusion: { modes: [1, 4], alpha: 0.25 },
            texture: { alphaThreshold: 0.5 },
            restrictions: { light: true },
            video: { loop: false },
        });
        // A pack that declares nothing leaves every one of them to Foundry.
        expect(JSON.parse(JSON.stringify(tileCreateData(tile)))).not.toHaveProperty('occlusion');
    });

    it('gives a light its rendering technique, with Foundry’s colouration ids, and its walls and vision', () => {
        const light = { source: { kind: 'room' } as const, x: 0, y: 0, dim: 100, bright: 50, elevation: 0, level: null };
        const attenuating = lightCreateData(
            { ...light, technique: { coloration: 'adaptiveAttenuation', luminosity: 0.3, walls: false, vision: true } },
            GRID,
            'L',
        );
        expect(attenuating).toMatchObject({ config: { coloration: 101, luminosity: 0.3 }, walls: false, vision: true });
        expect(lightCreateData({ ...light, technique: { coloration: 'naturalLight', negative: true } }, GRID, 'L').config).toMatchObject({
            coloration: 10,
            negative: true,
        });
        expect(JSON.parse(JSON.stringify(lightCreateData(light, GRID, 'L')))).not.toHaveProperty('walls');
    });

    it('gives a light the darkness range it is active in, and places it hidden when the pack says so', () => {
        const light = { source: { kind: 'room' } as const, x: 0, y: 0, dim: 100, bright: 50, elevation: 0, level: null };
        const nightLamp = lightCreateData({ ...light, technique: { darkness: { min: 0.5, max: 1 }, hidden: true } }, GRID, 'L');
        expect(nightLamp).toMatchObject({ config: { darkness: { min: 0.5, max: 1 } }, hidden: true });
        const plain = JSON.parse(JSON.stringify(lightCreateData(light, GRID, 'L')));
        expect(plain).not.toHaveProperty('hidden');
        expect(plain).not.toHaveProperty('config.darkness');
    });
});

describe('sceneSettingsData', () => {
    it('writes only the settings given, in the Scene’s own shape and ids', () => {
        expect(
            sceneSettingsData({
                darkness: 0.7,
                darknessLock: true,
                globalLight: false,
                tokenVision: true,
                fog: 'shared',
                weather: 'rain',
                transition: { type: 'fade', duration: 800 },
            }),
        ).toEqual({
            environment: { darknessLevel: 0.7, darknessLock: true, globalLight: { enabled: false } },
            tokenVision: true,
            // CONST.FOG_EXPLORATION_MODES.SHARED
            fog: { mode: 2 },
            weather: 'rain',
            transition: { type: 'fade', duration: 800 },
        });
        expect(sceneSettingsData({ fog: 'disabled' })).toEqual({ fog: { mode: 0 } });
        expect(sceneSettingsData({})).toEqual({});
    });

    it('writes the environments and their cycle, and the fog’s colours, each value only if given', () => {
        expect(
            sceneSettingsData({
                cycle: false,
                base: { hue: 0.1, intensity: 0.3 },
                dark: { luminosity: -0.5, shadows: 0.2, saturation: -0.4 },
                fogColours: { unexplored: '#101820' },
            }),
        ).toEqual({
            environment: { cycle: false, base: { hue: 0.1, intensity: 0.3 }, dark: { luminosity: -0.5, saturation: -0.4, shadows: 0.2 } },
            fog: { colors: { unexplored: '#101820' } },
        });
        expect(sceneSettingsData({ fog: 'individual', fogColours: { explored: '#000000' } })).toEqual({ fog: { mode: 1, colors: { explored: '#000000' } } });
        expect(sceneSettingsData({ fogColours: {} })).toEqual({});
    });
});

describe('noteCreateData', () => {
    const note = { x: 10.4, y: 20.6, elevation: 5, level: 'lv1', text: 'The Sump', entry: 'je1', page: 'pg1', icon: null, global: true };

    it('writes a Note at whole pixels, opening its journal page, with Foundry’s icon when it has none', () => {
        expect(noteCreateData(note)).toEqual({ x: 10, y: 21, elevation: 5, text: 'The Sump', entryId: 'je1', pageId: 'pg1', global: true, levels: ['lv1'] });
        expect(noteCreateData({ ...note, icon: 'icons/svg/tankard.svg', level: null, entry: null, page: null })).toEqual({
            x: 10,
            y: 21,
            elevation: 5,
            text: 'The Sump',
            entryId: null,
            pageId: null,
            global: true,
            texture: { src: 'icons/svg/tankard.svg' },
        });
    });
});

describe('drawingCreateData', () => {
    it('writes a text-only rectangle Drawing placed by its top-left corner, turning about its centre', () => {
        const drawing = {
            x: 500,
            y: 300,
            width: 200,
            height: 61,
            rotation: -10,
            elevation: 5,
            level: 'lv1',
            text: 'Hab District 4',
            fontSize: 40,
            colour: '#e0c080',
            fontFamily: 'Amiri',
            hidden: true,
        };
        // CONST.DRAWING_FILL_TYPES.NONE is 0.
        expect(drawingCreateData(drawing)).toEqual({
            shape: { type: 'r', width: 200, height: 61 },
            x: 400,
            y: 270,
            elevation: 5,
            rotation: -10,
            fillType: 0,
            strokeWidth: 0,
            text: 'Hab District 4',
            fontSize: 40,
            fontFamily: 'Amiri',
            textColor: '#e0c080',
            hidden: true,
            levels: ['lv1'],
        });
    });
});

describe('soundCreateData', () => {
    it('converts the radius to distance units and keeps the level', () => {
        expect(
            soundCreateData(
                { name: 'Lamp', x: 1, y: 2, radius: 300, path: 'hum.ogg', volume: 0.4, repeat: true, walls: false, easing: true, elevation: 3, level: 'L1' },
                GRID,
                'Lamp sound',
            ),
        ).toEqual({
            name: 'Lamp sound',
            x: 1,
            y: 2,
            elevation: 3,
            radius: 15,
            path: 'hum.ogg',
            volume: 0.4,
            repeat: true,
            walls: false,
            easing: true,
            levels: ['L1'],
        });
    });
});

describe('tileFrame', () => {
    it('reads back the top-left the tile was created from', () => {
        const tile = { name: 'Lamp', src: 'a.png', x: 10, y: 20, width: 30, height: 40, rotation: 45, elevation: 0, level: null, featureId: 'f1' };
        expect(tileFrame(tileCreateData(tile))).toEqual({ x: 10, y: 20, width: 30, height: 40, rotation: 45 });
    });

    it('honours any anchor a GM set', () => {
        expect(tileFrame({ x: 100, y: 100, width: 50, height: 20, rotation: 0, texture: { anchorX: 0, anchorY: 1 } })).toEqual({
            x: 100,
            y: 80,
            width: 50,
            height: 20,
            rotation: 0,
        });
    });

    it('rounds a fractional centre to the integer Foundry stores', () => {
        const data = tileCreateData({ name: 'Lamp', src: 'a.png', x: 0, y: 0, width: 5, height: 3, rotation: 0, elevation: 0, level: null, featureId: 'f' });
        expect([data.x, data.y]).toEqual([3, 2]);
    });
});

describe('regionCreateData', () => {
    const square = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
    ];
    const nameOf = (r: RegionDoc): string => `${r.label.kind} ${r.level ?? ''}`;

    it('makes a stair a native changeLevel region on every level it joins', () => {
        const stair: RegionDoc = {
            id: null,
            label: { kind: 'stairs', from: 'A', to: ['B', 'C'] },
            polygon: square,
            bottom: -10,
            top: 20,
            level: 'A',
            spans: ['B', 'C'],
            behaviour: { kind: 'changeLevel' },
        };
        expect(regionCreateData([stair], ['r0'], nameOf)).toEqual([
            {
                _id: 'r0',
                name: 'stairs A',
                color: '#4a90d9',
                shapes: [{ type: 'polygon', points: [0, 0, 10, 0, 10, 10], hole: false }],
                elevation: { bottom: -10, top: 20 },
                behaviors: [{ type: 'changeLevel', system: {} }],
                locked: true,
                visibility: 0,
                levels: ['A', 'B', 'C'],
            },
        ]);
    });

    it('adds an area’s effects as native behaviours after its movement cost, with Foundry’s enum values', () => {
        const room: RegionDoc = {
            id: null,
            label: { kind: 'room' },
            polygon: square,
            bottom: null,
            top: null,
            level: null,
            spans: [],
            behaviour: { kind: 'terrain', difficulties: { walk: 2 } },
            effects: [
                { kind: 'darkness', mode: 'darken', modifier: 0.5 },
                { kind: 'suppressWeather' },
                { kind: 'text', text: 'Hot', colour: '#ff0000', visibility: 'observer', once: true, events: ['tokenTurnStart'] },
                { kind: 'pause', once: true },
                { kind: 'macro', uuid: 'Macro.m', everyone: true, events: ['tokenEnter'] },
                { kind: 'script', source: 'return;', events: ['tokenExit'] },
                { kind: 'activeEffect', effects: ['Item.i.ActiveEffect.e'] },
            ],
        };
        expect(regionCreateData([room], ['r0'], nameOf)[0]?.behaviors).toEqual([
            { type: 'modifyMovementCost', system: { difficulties: { walk: 2 } } },
            { type: 'adjustDarknessLevel', system: { mode: 2, modifier: 0.5 } },
            { type: 'suppressWeather', system: {} },
            { type: 'displayScrollingText', system: { events: ['tokenTurnStart'], text: 'Hot', color: '#ff0000', visibility: 1, once: true } },
            { type: 'pauseGame', system: { once: true } },
            { type: 'executeMacro', system: { events: ['tokenEnter'], uuid: 'Macro.m', everyone: true } },
            { type: 'executeScript', system: { events: ['tokenExit'], source: 'return;' } },
            { type: 'applyActiveEffect', system: { effects: ['Item.i.ActiveEffect.e'] } },
        ]);
    });

    it('sends a rectangular outline, rotated or not, as Foundry’s own rectangle shape centred on its anchor', () => {
        expect(
            regionShape([
                { x: 100, y: 100 },
                { x: 200, y: 100 },
                { x: 300, y: 100 },
                { x: 300, y: 200 },
                { x: 100, y: 200 },
            ]),
        ).toEqual({ type: 'rectangle', x: 200, y: 150, width: 200, height: 100, anchorX: 0.5, anchorY: 0.5, rotation: 0, hole: false });
        expect(
            regionShape([
                { x: 0, y: 0 },
                { x: 0, y: 100 },
                { x: -50, y: 100 },
                { x: -50, y: 0 },
            ]),
        ).toMatchObject({ type: 'rectangle', x: -25, y: 50, width: 100, height: 50, rotation: 90 });
        expect(regionShape(square)).toEqual({ type: 'polygon', points: [0, 0, 10, 0, 10, 10], hole: false });
    });

    it('gives a region without a behaviour none, on its own level', () => {
        const plain: RegionDoc = {
            id: null,
            label: { kind: 'terrain', biome: 'forest' },
            polygon: square,
            bottom: 0,
            top: 10,
            level: 'C',
            spans: [],
            behaviour: null,
        };
        const [data] = regionCreateData([plain], ['r2'], nameOf);
        expect(data?.behaviors).toEqual([]);
        expect(data?.levels).toEqual(['C']);
    });

    it('shows an area’s region as chosen, with Foundry’s visibility ids, and shapes it by walls only on exactly one level', () => {
        const display = {
            visibility: 'observer',
            highlight: 'coverage',
            measurements: true,
            observed: true,
            restriction: { type: 'sight', priority: 3 },
        } as const;
        const area: RegionDoc = { id: null, label: { kind: 'room' }, polygon: square, bottom: 0, top: 10, level: 'C', spans: [], behaviour: null, display };
        const [one, everywhere, spanning] = regionCreateData([area, { ...area, level: null }, { ...area, spans: ['D'] }], ['r1', 'r2', 'r3'], nameOf);
        expect(one).toMatchObject({
            visibility: 3,
            highlightMode: 'coverage',
            displayMeasurements: true,
            restriction: { enabled: true, type: 'sight', priority: 3 },
            // Every player an observer: DOCUMENT_OWNERSHIP_LEVELS.OBSERVER.
            ownership: { default: 2 },
        });
        expect(everywhere).not.toHaveProperty('restriction');
        expect(spanning).not.toHaveProperty('restriction');
        const { display: _shown, ...undisplayed } = area;
        const [plain] = regionCreateData([undisplayed], ['r4'], nameOf);
        expect(plain).toMatchObject({ visibility: 0 });
        expect(plain).not.toHaveProperty('highlightMode');
        expect(plain).not.toHaveProperty('ownership');
    });

    it('makes a floor a solid defineSurface at its bottom, on its level and the one seen from below', () => {
        const floor: RegionDoc = {
            id: null,
            label: { kind: 'floor', level: 'Upper' },
            polygon: square,
            bottom: 10,
            top: 10,
            level: 'B',
            spans: ['A', 'B'],
            behaviour: { kind: 'surface', placement: 'bottom', reveal: false },
        };
        const [data] = regionCreateData([floor], ['r4'], nameOf);
        expect(data?.behaviors).toEqual([
            {
                type: 'defineSurface',
                system: { placement: 'bottom', light: true, move: true, sight: true, sound: true, occlusion: true, exposure: false },
            },
        ]);
        expect(data?.elevation).toEqual({ bottom: 10, top: 10 });
        // Each level once, however it is listed.
        expect(data?.levels).toEqual(['B', 'A']);
    });

    it('teleports to regions in another scene, relative, with a choice when there are several', () => {
        const many: RegionDoc = {
            id: null,
            label: { kind: 'entrance', scene: 'Hab' },
            polygon: square,
            bottom: null,
            top: null,
            level: null,
            spans: [],
            behaviour: {
                kind: 'teleport',
                targets: [
                    { scene: 'hab', region: 'a' },
                    { scene: 'hab', region: 'b' },
                ],
                travel: { placement: 'center', transition: 'swirl', duration: 2000, prompt: 'Enter {scene}?' },
            },
        };
        expect(regionCreateData([many], ['r3'], nameOf)[0]?.behaviors).toEqual([
            {
                type: 'teleportToken',
                system: {
                    destinations: ['Scene.hab.Region.a', 'Scene.hab.Region.b'],
                    placement: 'center',
                    choice: true,
                    dialog: { revealed: 'Enter {scene}?', unrevealed: 'Enter {scene}?' },
                    transition: { type: 'swirl', duration: 2000 },
                },
            },
        ]);
    });

    it('addresses a region in another scene directly, with an open-ended band', () => {
        const entrance: RegionDoc = {
            id: 'in1',
            label: { kind: 'entrance', scene: 'Hab' },
            polygon: square,
            bottom: null,
            top: null,
            level: null,
            spans: [],
            behaviour: { kind: 'teleport', targets: [{ scene: 'hab', region: 'out1' }], travel: DEFAULT_TRAVEL },
        };
        const [data] = regionCreateData([entrance], ['in1'], nameOf);
        expect(data?.elevation).toEqual({ bottom: null, top: null });
        expect(data?.behaviors[0]?.system).toEqual({
            destinations: ['Scene.hab.Region.out1'],
            placement: 'relative',
            choice: false,
            dialog: { revealed: null, unrevealed: null },
            transition: { type: null, duration: 1500 },
        });
        expect(regionUuid('a', 'b')).toBe('Scene.a.Region.b');
    });

    it('locks regions drawn from features, but leaves an interior exit for the GM to move', () => {
        const exit: RegionDoc = {
            id: 'out1',
            label: { kind: 'exit', scene: 'Town' },
            polygon: square,
            bottom: null,
            top: null,
            level: null,
            spans: [],
            behaviour: null,
        };
        const [entrance, back] = regionCreateData([{ ...exit, id: 'in1', label: { kind: 'entrance', scene: 'Hab' } }, exit], ['in1', 'out1'], nameOf);
        expect([entrance?.locked, back?.locked]).toEqual([true, false]);
        expect([entrance?.visibility, back?.visibility]).toEqual([0, 0]);
    });
});
