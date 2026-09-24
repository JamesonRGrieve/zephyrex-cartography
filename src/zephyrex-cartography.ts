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
import { inOwnGroup, moduleTool, NATIVE_GROUPS, NATIVE_TOOLS, type NativeTool, nativeToolName } from './canvas/tool-placement';
import { registerApi } from './foundry/api';
import { lightName, regionName, soundName } from './foundry/document-names';
import { FoundryDocumentSink } from './foundry/documents';
import { registerDoorRuntime } from './foundry/door-runtime';
import { registerGeneratorRuntime } from './foundry/generator-runtime';
import { createItemPilesContainers } from './foundry/item-piles';
import { registerLevelRuntime } from './foundry/level-runtime';
import { createLevelStore } from './foundry/levels';
import { registerMaterialsRuntime } from './foundry/materials-runtime';
import { registerPackRuntime } from './foundry/pack-runtime';
import { createPixiSurface } from './foundry/pixi-surface';
import { activeScene, modifyBatch } from './foundry/scene-bridge';
import { FoundrySceneStore } from './foundry/scene-store';
import { createWorldScenes } from './foundry/scenes';
import { createSilhouetteSource } from './foundry/silhouette';
import { registerSubmapRuntime } from './foundry/submap-runtime';
import { createSwitchLinker, type SwitchLinker } from './foundry/switch-linker';
import { distance, type Point } from './geometry/spline';
import { BIOME_TITLE_KEYS, I18N } from './i18n';
import { MODULE_ID } from './module-id';
import { BIOMES, type BiomeKind } from './tools/biome';
import { levelHeightFor } from './tools/levels';

interface DrawState {
    controller: CartographyController;
    container: PIXI.Container;
    mode: Mode;
    /** A control point being dragged: moved, or (Shift) its path width set by distance from `anchor`. */
    drag: { id: string; index: number; kind: 'move' | 'width'; anchor: Point } | null;
    down: Point | null;
    painting: boolean;
    /** The link tool: the switch picked and its drawn links. */
    linker: SwitchLinker;
}

let state: DrawState | null = null;

const packs = registerPackRuntime(() => state?.controller ?? null);

const levels = registerLevelRuntime(() => state?.controller ?? null);

registerSubmapRuntime(() => state?.controller ?? null, packs.catalog);

const doors = registerDoorRuntime(() => state?.controller ?? null);

const materials = registerMaterialsRuntime(() => state?.controller ?? null, packs.textureRoles);

const generator = registerGeneratorRuntime(() => state?.controller ?? null, materials.forNewRooms);

registerApi(() => state?.controller ?? null);

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

/**
 * Take the pointer over the whole scene while a tool is active, and give it
 * back to Foundry's own layers while idle. A PIXI container without a hit
 * area is hit only through what it has drawn, so clicks on empty canvas
 * would never reach the tools.
 */
function capturePointer(container: PIXI.Container, capture: boolean): void {
    container.eventMode = capture ? 'static' : 'none';
    container.hitArea = capture ? canvas?.dimensions?.rect ?? null : null;
}

/** The mode a scene-control tool puts the layer in; new rooms get the materials last chosen in the materials panel. */
function toolMode(toolName: string, active: boolean): Mode {
    const picked = modeForTool(toolName, active);
    return picked.kind === 'brush' && picked.brush.type === 'room' ? { kind: 'brush', brush: { type: 'room', ...materials.forNewRooms() } } : picked;
}

/** Enter `mode`, dropping any in-flight gesture. */
function enterMode(st: DrawState, mode: Mode): void {
    capturePointer(st.container, mode.kind !== 'idle');
    st.mode = mode;
    st.drag = null;
    st.down = null;
    st.painting = false;
    st.controller.cancel();
    if (mode.kind === 'brush') {
        st.controller.begin(mode.brush, 'click');
    }
    // Link lines show only while the link tool is in hand.
    if (mode.kind !== 'link') {
        st.linker.reset();
    }
}

/** Finish the shape being drawn, then start the next one with the same brush. */
async function commitAndContinue(st: DrawState, brush: Brush): Promise<void> {
    await st.controller.commit();
    st.controller.begin(brush, 'click');
}

function onPointerDown(st: DrawState, pointerEvent: PIXI.FederatedPointerEvent): void {
    // A tool's left press is the tool's: left to reach the stage, Foundry would also run its own gestures on it (a
    // Shift long-press pings and pulls every view there, mid-drag). The right button still pans the canvas.
    if (pointerEvent.button === PRIMARY_BUTTON) {
        pointerEvent.stopPropagation();
    }
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
            // A plain wall becomes a door; an existing door opens its panel (type, state, remove).
            const seg = st.controller.pickWallSegment(pt, WALL_PICK_TOL);
            if (seg && st.controller.roomDoor(seg.id, seg.index)) {
                doors.edit(seg.id, seg.index);
            } else if (seg) {
                void st.controller.toggleDoor(seg.id, seg.index);
            }
            return;
        }
        case 'edit': {
            const hit = st.controller.pickVertex(pt, EDIT_PICK_TOL);
            const anchor = hit ? st.controller.getFeature(hit.id)?.points[hit.index] : undefined;
            if (hit && pointerEvent.button === SECONDARY_BUTTON) {
                void st.controller.deleteVertex(hit.id, hit.index);
            } else if (hit && anchor) {
                st.drag = { ...hit, kind: pointerEvent.shiftKey ? 'width' : 'move', anchor };
            }
            return;
        }
        case 'materials': {
            const hit = st.controller.hitTest(pt);
            if (hit !== null && st.controller.roomMaterials(hit)) {
                materials.edit(hit);
            }
            return;
        }
        case 'erase':
            void st.controller.erase(pt);
            return;
        case 'link':
            void st.linker.click(pt);
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
    if (st.drag?.kind === 'width') {
        st.controller.previewPathWidth(st.drag.id, st.drag.index, distance(st.drag.anchor, pt));
        return;
    }
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
        const { id, index, kind, anchor } = st.drag;
        st.drag = null;
        if (kind === 'width') {
            void st.controller.setPathWidth(id, index, distance(anchor, pt));
        } else {
            void st.controller.moveVertex(id, index, pt);
        }
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
    capturePointer(container, false);
    canvas.stage.addChild(container);

    const renderer = new GraphicsFeatureRenderer(createPixiSurface(container), packs.textures());
    const makeId = (): string => foundry.utils.randomID();
    const controller = new CartographyController({
        renderer,
        store: new FoundrySceneStore(activeScene),
        sink: new FoundryDocumentSink(activeScene, { makeId, modifyBatch, regionName, lightName, soundName }),
        levels: createLevelStore(activeScene),
        scenes: createWorldScenes({ regionName }),
        containers: createItemPilesContainers(() => activeScene()?.id ?? null),
        catalog: packs.catalog,
        silhouettes,
        makeId,
    });
    const gridSize = canvas.grid?.size ?? 0;
    controller.grid = gridSize > 0 ? { size: gridSize, originX: 0, originY: 0 } : null;
    controller.levelHeight = levelHeightFor(canvas.scene?.grid.distance ?? 0);
    controller.load();
    levels.refresh();
    // The scene may have been edited under the other terrain setting; only the active GM writes documents.
    if (game.users?.activeGM?.isSelf === true) {
        void controller.setTerrainRegions(terrainRegionsEnabled());
    }

    const st: DrawState = { controller, container, mode: IDLE, drag: null, down: null, painting: false, linker: createSwitchLinker(controller, container) };
    state = st;
    // A redraw keeps Foundry's control group and tool (it re-activates the layer that was active), so a module tool
    // selected in Walls or Tiles is still in hand: pick it straight back up.
    const control = ui.controls?.control;
    const selected = control && ui.controls?.tool ? moduleTool(control.name, ui.controls.tool.name, MODULE_ID) : null;
    if (selected !== null) {
        enterMode(st, toolMode(selected, true));
    }

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

const TERRAIN_REGIONS_SETTING = 'terrainRegions';

declare global {
    interface SettingConfig {
        'zephyrex-cartography.terrainRegions': boolean;
    }
}

function terrainRegionsEnabled(): boolean {
    return game.settings?.get(MODULE_ID, TERRAIN_REGIONS_SETTING) === true;
}

Hooks.once('init', () => {
    game.settings?.register(MODULE_ID, TERRAIN_REGIONS_SETTING, {
        name: I18N.settings.terrainRegionsName,
        hint: I18N.settings.terrainRegionsHint,
        scope: 'world',
        config: true,
        type: Boolean,
        default: false,
        onChange: (on): void => {
            if (state && game.users?.activeGM?.isSelf === true) {
                void state.controller.setTerrainRegions(on);
            }
        },
    });
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

/** Put the layer in the mode of the module tool `tool`, as it becomes active or inactive in any control group. */
function activateTool(tool: string, active: boolean): void {
    if (!state) {
        return;
    }
    const mode = toolMode(tool, active);
    enterMode(state, mode);
    if (mode.kind === 'stamp') {
        packs.openBrowser();
    }
}

interface ToolLook {
    readonly title: string;
    readonly icon: string;
}

/** Title and icon of each tool that also sits in a native group. */
const NATIVE_TOOL_LOOKS: Readonly<Record<NativeTool, ToolLook>> = {
    room: { title: I18N.tools.room, icon: 'fa-solid fa-vector-square' },
    materials: { title: I18N.tools.materials, icon: 'fa-solid fa-fill-drip' },
    door: { title: I18N.tools.door, icon: 'fa-solid fa-door-open' },
    stamp: { title: I18N.tools.stamp, icon: 'fa-solid fa-stamp' },
    edit: { title: I18N.tools.edit, icon: 'fa-solid fa-arrows-up-down-left-right' },
    erase: { title: I18N.tools.erase, icon: 'fa-solid fa-eraser' },
    link: { title: I18N.tools.link, icon: 'fa-solid fa-link' },
};

/** Every pointer tool, by name, in toolbar order: paths, biomes, then the tools native groups share. */
function pointerTools(): [string, ToolLook][] {
    return [
        ['road', { title: I18N.tools.road, icon: 'fa-solid fa-road' }],
        ['river', { title: I18N.tools.river, icon: 'fa-solid fa-water' }],
        ...BIOMES.map((biome): [string, ToolLook] => [biome, { title: BIOME_TITLE_KEYS[biome], icon: BIOME_ICONS[biome] }]),
        ...Object.entries(NATIVE_TOOL_LOOKS),
    ];
}

/**
 * Add the module's tools to Foundry's own groups (rooms and doors with the
 * Walls tools, stamps with the Tiles tools), after Foundry's tools. They set
 * none of `interaction`, `creation` or `control`, so the native layer stays
 * inert while one is active and the draw layer takes the pointer.
 */
function addNativeTools(controls: Record<string, foundry.applications.ui.SceneControls.Control>): void {
    for (const group of NATIVE_GROUPS) {
        // Every v14 group comes with its tools; one without (another module's rewrite) is left alone.
        const groupTools = controls[group]?.tools;
        if (!groupTools) {
            continue;
        }
        const after = Math.max(0, ...Object.values(groupTools).map((tool) => tool.order)) + 1;
        NATIVE_TOOLS[group].forEach((tool, i) => {
            const look = NATIVE_TOOL_LOOKS[tool];
            const toolName = nativeToolName(tool);
            groupTools[toolName] = {
                name: toolName,
                order: after + i,
                title: look.title,
                icon: look.icon,
                onChange: (_event, active): void => {
                    activateTool(tool, active);
                },
            };
        });
    }
}

Hooks.on('getSceneControlButtons', (controls) => {
    addNativeTools(controls);
    const modeTools = pointerTools().filter(([toolName]) => inOwnGroup(toolName));
    const tools: Record<string, Tool> = {};
    modeTools.forEach(([toolName, { title, icon }], order) => {
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
    tools['generator'] = {
        name: 'generator',
        order: modeTools.length + 3,
        title: I18N.tools.generator,
        icon: 'fa-solid fa-wand-magic-sparkles',
        button: true,
        onChange: (): void => {
            generator.open();
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
            activateTool(tool.name, active);
        },
    };
});
