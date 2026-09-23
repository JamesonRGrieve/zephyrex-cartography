// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Zephyrex Cartography: Foundry entry / runtime seam.
 *
 * All authoring logic lives in the pure, unit-tested modules (geometry, tools,
 * stamps, canvas/controller, canvas/renderer). This file is the thin glue that
 * wires the live Foundry canvas, scene, and PIXI into that logic and registers
 * the scene-control tools (paths, biome regions/strokes, rooms, doors, stamps,
 * editing). Pointer input is routed by one {@link Mode} per active tool.
 */
import './styles/entry.css';
import { type Brush, CartographyController } from './canvas/controller';
import { IDLE, type Mode, modeForTool } from './canvas/modes';
import { GraphicsFeatureRenderer } from './canvas/renderer';
import { FoundryDocumentSink } from './foundry/documents';
import { registerLevelRuntime, regionName } from './foundry/level-runtime';
import { createLevelStore } from './foundry/levels';
import { registerPackRuntime } from './foundry/pack-runtime';
import { createPixiSurface } from './foundry/pixi-surface';
import { activeScene } from './foundry/scene-bridge';
import { FoundrySceneStore } from './foundry/scene-store';
import { createWorldScenes } from './foundry/scenes';
import { createSilhouetteSource } from './foundry/silhouette';
import { registerSubmapRuntime } from './foundry/submap-runtime';
import { NATIVE_LEVELS_GENERATION } from './foundry/translate';
import { distance, type Point } from './geometry/spline';
import { BIOME_TITLE_KEYS, I18N } from './i18n';
import { MODULE_ID } from './module-id';
import { BIOMES, type BiomeKind } from './tools/region';

interface DrawState {
    controller: CartographyController;
    container: PIXI.Container;
    mode: Mode;
    drag: { id: string; index: number } | null;
    down: Point | null;
    painting: boolean;
}

let state: DrawState | null = null;

const packs = registerPackRuntime(() => state?.controller ?? null);

const levels = registerLevelRuntime(() => state?.controller ?? null);

registerSubmapRuntime(() => state?.controller ?? null, packs.catalog);

// Newly loaded packs or another texture set re-render the layer.
packs.onChange(() => {
    if (canvas?.ready === true) {
        setupDrawLayer();
    }
});

/** Shared across canvases so a stamp variant's silhouette is traced once per session. */
const silhouettes = createSilhouetteSource();

/** Scene-px radius within which a click grabs a control-point handle in edit mode. */
const EDIT_PICK_TOL = 10;

/** Scene-px radius within which a click grabs a room wall segment in door mode. */
const WALL_PICK_TOL = 16;

/** Drag distance (scene px) past which a biome click becomes a freehand paint stroke. */
const PAINT_THRESHOLD = 8;

/** Pointer button ids. */
const PRIMARY_BUTTON = 0;
const SECONDARY_BUTTON = 2;

const BIOME_ICONS: Record<BiomeKind, string> = {
    water: 'fa-solid fa-water',
    grassland: 'fa-solid fa-seedling',
    forest: 'fa-solid fa-tree',
    sand: 'fa-solid fa-sun',
    rock: 'fa-solid fa-mountain',
    snow: 'fa-solid fa-snowflake',
    dirt: 'fa-solid fa-mound',
    lava: 'fa-solid fa-volcano',
    marsh: 'fa-solid fa-frog',
    ice: 'fa-solid fa-icicles',
    ash: 'fa-solid fa-smog',
    tundra: 'fa-solid fa-wind',
    ocean: 'fa-solid fa-anchor',
};

function localPoint(pointerEvent: PIXI.FederatedPointerEvent, container: PIXI.Container): Point {
    const p = pointerEvent.getLocalPosition(container);
    return { x: p.x, y: p.y };
}

function teardown(): void {
    if (state) {
        state.container.destroy({ children: true });
        state = null;
    }
}

/** Enter `mode`, dropping any in-flight gesture. */
function enterMode(st: DrawState, mode: Mode): void {
    st.mode = mode;
    st.drag = null;
    st.down = null;
    st.painting = false;
    st.controller.cancel();
    if (mode.kind === 'brush') {
        st.controller.begin(mode.brush, 'click');
    }
}

/** Finish the shape being drawn, then start the next one with the same brush. */
async function commitAndContinue(st: DrawState, brush: Brush): Promise<void> {
    await st.controller.commit();
    st.controller.begin(brush, 'click');
}

function onPointerDown(st: DrawState, pointerEvent: PIXI.FederatedPointerEvent): void {
    const mode = st.mode;
    const pt = localPoint(pointerEvent, st.container);
    switch (mode.kind) {
        case 'idle':
            return;
        case 'stamp':
            if (pointerEvent.button === PRIMARY_BUTTON) {
                packs.placeArmedAt(pt);
            }
            return;
        case 'door': {
            const seg = st.controller.pickWallSegment(pt, WALL_PICK_TOL);
            if (seg) {
                void st.controller.toggleDoor(seg.id, seg.index);
            }
            return;
        }
        case 'edit': {
            const hit = st.controller.pickVertex(pt, EDIT_PICK_TOL);
            if (hit && pointerEvent.button === SECONDARY_BUTTON) {
                void st.controller.deleteVertex(hit.id, hit.index);
            } else if (hit) {
                st.drag = hit;
            }
            return;
        }
        case 'erase':
            void st.controller.erase(pt);
            return;
        case 'brush':
            if (pointerEvent.button === SECONDARY_BUTTON) {
                void commitAndContinue(st, mode.brush);
                return;
            }
            if (mode.brush.type === 'region') {
                // A click drops a region vertex; a drag paints a freehand stroke (decided on move).
                st.down = pt;
                st.painting = false;
                return;
            }
            st.controller.addPoint(pt);
    }
}

function onPointerMove(st: DrawState, pointerEvent: PIXI.FederatedPointerEvent): void {
    const pt = localPoint(pointerEvent, st.container);
    if (st.drag) {
        st.controller.previewVertexMove(st.drag.id, st.drag.index, pt);
        return;
    }
    const mode = st.mode;
    if (!st.down || mode.kind !== 'brush' || mode.brush.type !== 'region') {
        return;
    }
    if (!st.painting && distance(st.down, pt) > PAINT_THRESHOLD) {
        st.controller.cancel();
        st.controller.begin({ type: 'stroke', biome: mode.brush.biome }, 'freehand');
        st.controller.addPoint(st.down);
        st.painting = true;
    }
    if (st.painting) {
        st.controller.addPoint(pt);
    }
}

function onPointerUp(st: DrawState, pointerEvent: PIXI.FederatedPointerEvent): void {
    const pt = localPoint(pointerEvent, st.container);
    if (st.drag) {
        const { id, index } = st.drag;
        st.drag = null;
        void st.controller.moveVertex(id, index, pt);
        st.controller.clearPreview();
        return;
    }
    if (!st.down) {
        return;
    }
    const mode = st.mode;
    if (st.painting) {
        void st.controller.commit();
        if (mode.kind === 'brush') {
            st.controller.begin(mode.brush, 'click');
        }
        st.painting = false;
    } else {
        st.controller.addPoint(st.down);
    }
    st.down = null;
}

/** (Re)build the draw layer on the current canvas with the active texture pack. */
function setupDrawLayer(): void {
    teardown();
    if (!canvas?.stage) {
        return;
    }
    const container = new PIXI.Container();
    container.eventMode = 'static';
    canvas.stage.addChild(container);

    const renderer = new GraphicsFeatureRenderer(createPixiSurface(container), packs.textures());
    const makeId = (): string => foundry.utils.randomID();
    const nativeLevels = (game.release?.generation ?? 0) >= NATIVE_LEVELS_GENERATION;
    const controller = new CartographyController({
        renderer,
        store: new FoundrySceneStore(activeScene),
        sink: new FoundryDocumentSink(activeScene, { nativeLevels, makeId, regionName }),
        levels: createLevelStore(activeScene, nativeLevels, makeId),
        scenes: createWorldScenes({ nativeLevels, regionName }),
        catalog: packs.catalog,
        silhouettes,
        makeId,
    });
    const gridSize = canvas.grid?.size ?? 0;
    controller.grid = gridSize > 0 ? { size: gridSize, originX: 0, originY: 0 } : null;
    controller.load();
    levels.refresh();

    const st: DrawState = { controller, container, mode: IDLE, drag: null, down: null, painting: false };
    state = st;

    container.on('pointerdown', (pointerEvent: PIXI.FederatedPointerEvent) => {
        onPointerDown(st, pointerEvent);
    });
    container.on('pointermove', (pointerEvent: PIXI.FederatedPointerEvent) => {
        onPointerMove(st, pointerEvent);
    });
    container.on('pointerup', (pointerEvent: PIXI.FederatedPointerEvent) => {
        onPointerUp(st, pointerEvent);
    });
}

Hooks.on('canvasReady', () => {
    setupDrawLayer();
});

type Tool = foundry.applications.ui.SceneControls.Tool;

/** A scene-control button that runs `action` against the live controller. */
function actionTool(toolName: string, order: number, title: string, icon: string, action: (controller: CartographyController) => void): Tool {
    return {
        name: toolName,
        order,
        title,
        icon,
        button: true,
        onChange: (): void => {
            if (state) {
                action(state.controller);
            }
        },
    };
}

Hooks.on('getSceneControlButtons', (controls) => {
    const modeTools: [string, string, string][] = [
        ['road', I18N.tools.road, 'fa-solid fa-road'],
        ['river', I18N.tools.river, 'fa-solid fa-water'],
        ...BIOMES.map((biome): [string, string, string] => [biome, BIOME_TITLE_KEYS[biome], BIOME_ICONS[biome]]),
        ['room', I18N.tools.room, 'fa-solid fa-vector-square'],
        ['door', I18N.tools.door, 'fa-solid fa-door-open'],
        ['stamp', I18N.tools.stamp, 'fa-solid fa-stamp'],
        ['edit', I18N.tools.edit, 'fa-solid fa-arrows-up-down-left-right'],
        ['erase', I18N.tools.erase, 'fa-solid fa-eraser'],
    ];
    const tools: Record<string, Tool> = {};
    modeTools.forEach(([toolName, title, icon], order) => {
        tools[toolName] = { name: toolName, order, title, icon };
    });
    tools['undo'] = actionTool('undo', modeTools.length, I18N.tools.undo, 'fa-solid fa-rotate-left', (controller) => {
        void controller.undo();
    });
    tools['levels'] = {
        name: 'levels',
        order: modeTools.length + 2,
        title: I18N.tools.levels,
        icon: 'fa-solid fa-layer-group',
        button: true,
        onChange: (): void => {
            levels.openPanel();
        },
    };
    tools['redo'] = actionTool('redo', modeTools.length + 1, I18N.tools.redo, 'fa-solid fa-rotate-right', (controller) => {
        void controller.redo();
    });
    controls[MODULE_ID] = {
        name: MODULE_ID,
        order: 100,
        title: I18N.controlsGroup,
        icon: 'fa-solid fa-map',
        tools,
        activeTool: 'road',
        onChange: (_event, active): void => {
            if (state && !active) {
                enterMode(state, IDLE);
            }
        },
        onToolChange: (_event, tool, active): void => {
            if (!state) {
                return;
            }
            const mode = modeForTool(tool.name, active);
            enterMode(state, mode);
            if (mode.kind === 'stamp') {
                packs.openBrowser();
            }
        },
    };
});
