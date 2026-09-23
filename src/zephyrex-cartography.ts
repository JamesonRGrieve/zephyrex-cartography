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
import type { FoundryScene } from './foundry/boundary';
import { FoundryDocumentSink } from './foundry/documents';
import { createPixiSurface } from './foundry/pixi-surface';
import { FoundrySceneStore } from './foundry/scene-store';
import { registerStampRuntime } from './foundry/stamps-runtime';
import { distance, type Point } from './geometry/spline';
import { BIOME_TITLE_KEYS, I18N } from './i18n';
import { MODULE_ID } from './module-id';
import { BIOMES, type BiomeKind } from './tools/region';
import { DEFAULT_PACK, isTexturePack, TEXTURE_PACK_LABELS, type TexturePack } from './tools/texture';

const TEXTURE_PACK_SETTING = 'texturePack';

declare global {
    // Register the setting's type so `game.settings.get/register` are well-typed. The key must be the
    // literal `${MODULE_ID}.${TEXTURE_PACK_SETTING}`; a mismatch fails typecheck at the get/register calls.
    interface SettingConfig {
        'zephyrex-cartography.texturePack': string;
    }
}

interface DrawState {
    controller: CartographyController;
    container: PIXI.Container;
    mode: Mode;
    drag: { id: string; index: number } | null;
    down: Point | null;
    painting: boolean;
}

let state: DrawState | null = null;

const stamps = registerStampRuntime(() => state?.controller ?? null);

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

/**
 * Adapt the live scene to the narrow {@link FoundryScene} the boundary needs.
 * Framework boundary: a Foundry `Scene` structurally provides getFlag / setFlag /
 * the embedded-document methods, so it satisfies our minimal, precisely-typed surface
 * directly — the pure store/document code never depends on fvtt-types flag generics.
 */
function activeScene(): FoundryScene | null {
    const scene = canvas?.scene;
    // fvtt-types over-constrains Scene's flag + embedded-document methods, so tsc requires this assertion to view the
    // live scene as our looser FoundryScene boundary. Runtime-safe; the single irreducible framework-boundary bridge.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- see note above; the rule mis-reports it as unnecessary
    return scene ? (scene as FoundryScene) : null; // type-coverage:ignore-line
}

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

function activePack(): TexturePack {
    const raw = game.settings?.get(MODULE_ID, TEXTURE_PACK_SETTING);
    return isTexturePack(raw) ? raw : DEFAULT_PACK;
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
                stamps.placeArmedAt(pt);
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

    const renderer = new GraphicsFeatureRenderer(createPixiSurface(container, activePack()));
    const controller = new CartographyController(renderer, new FoundrySceneStore(activeScene), new FoundryDocumentSink(activeScene), stamps.catalog, () =>
        foundry.utils.randomID(),
    );
    const gridSize = canvas.grid?.size ?? 0;
    controller.grid = gridSize > 0 ? { size: gridSize, originX: 0, originY: 0 } : null;
    controller.load();

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

Hooks.once('init', () => {
    if (!game.settings) {
        return;
    }
    const choices: Record<string, string> = { ...TEXTURE_PACK_LABELS };
    game.settings.register(MODULE_ID, TEXTURE_PACK_SETTING, {
        name: I18N.settings.texturePackName,
        hint: I18N.settings.texturePackHint,
        scope: 'world',
        config: true,
        type: String,
        choices,
        default: DEFAULT_PACK,
        onChange: (): void => {
            setupDrawLayer();
        },
    });
});

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
                stamps.openBrowser();
            }
        },
    };
});
