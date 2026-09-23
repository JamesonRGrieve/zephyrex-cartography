// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Zephyrex Cartography: Foundry entry / runtime seam.
 *
 * All authoring logic lives in the pure, unit-tested modules (geometry, tools,
 * canvas/controller, canvas/renderer). This file is the thin glue that wires the
 * live Foundry canvas, scene, and PIXI into that logic and registers the
 * scene-control tools (paths, biome regions/strokes, rooms, doors, editing). It
 * is the module's single Foundry boundary.
 */
import './styles/entry.css';
import { CartographyController, type Brush } from './canvas/controller';
import { GraphicsFeatureRenderer } from './canvas/renderer';
import type { FoundryScene } from './foundry/boundary';
import { FoundryDocumentSink } from './foundry/documents';
import { createPixiSurface } from './foundry/pixi-surface';
import { FoundrySceneStore } from './foundry/scene-store';
import { distance, type Point } from './geometry/spline';
import { BIOME_TITLE_KEYS, I18N } from './i18n';
import { MODULE_ID } from './module-id';
import { BIOMES, isBiomeKind, type BiomeKind } from './tools/region';
import { DEFAULT_FLOOR } from './tools/room';
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
    active: boolean;
    erasing: boolean;
    editing: boolean;
    doorMode: boolean;
    drag: { id: string; index: number } | null;
    activeBrush: Brush | null;
    down: Point | null;
    painting: boolean;
}

let state: DrawState | null = null;

/** Scene-px radius within which a click grabs a control-point handle in edit mode. */
const EDIT_PICK_TOL = 10;

/** Scene-px radius within which a click grabs a room wall segment in door mode. */
const WALL_PICK_TOL = 16;

/** Drag distance (scene px) past which a biome click becomes a freehand paint stroke. */
const PAINT_THRESHOLD = 8;

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

function brushFor(toolName: string): Brush | null {
    if (toolName === 'road' || toolName === 'river') {
        return { type: 'path', kind: toolName };
    }
    if (toolName === 'room') {
        return { type: 'room', floor: DEFAULT_FLOOR };
    }
    if (isBiomeKind(toolName)) {
        return { type: 'region', biome: toolName };
    }
    return null;
}

/**
 * Adapt the live scene to the narrow {@link FoundryScene} the boundary needs.
 * Framework boundary: a Foundry `Scene` structurally provides getFlag / setFlag /
 * createEmbeddedDocuments, so it satisfies our minimal, precisely-typed surface
 * directly — the pure store/wall code never depends on fvtt-types flag generics.
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
    const controller = new CartographyController(renderer, new FoundrySceneStore(activeScene), new FoundryDocumentSink(activeScene), () =>
        foundry.utils.randomID(),
    );
    const gridSize = canvas.grid?.size ?? 0;
    controller.grid = gridSize > 0 ? { size: gridSize, originX: 0, originY: 0 } : null;
    controller.load();

    const st: DrawState = {
        controller,
        container,
        active: false,
        erasing: false,
        editing: false,
        doorMode: false,
        drag: null,
        activeBrush: null,
        down: null,
        painting: false,
    };
    state = st;

    container.on('pointerdown', (pointerEvent: PIXI.FederatedPointerEvent) => {
        if (!st.active) {
            return;
        }
        const pt = localPoint(pointerEvent, container);
        if (st.doorMode) {
            const seg = st.controller.pickWallSegment(pt, WALL_PICK_TOL);
            if (seg) {
                void st.controller.toggleDoor(seg.id, seg.index);
            }
            return;
        }
        if (st.editing) {
            const hit = st.controller.pickVertex(pt, EDIT_PICK_TOL);
            if (!hit) {
                return;
            }
            if (pointerEvent.button === 2) {
                void st.controller.deleteVertex(hit.id, hit.index);
            } else {
                st.drag = hit;
            }
            return;
        }
        if (st.erasing) {
            void st.controller.erase(pt);
            return;
        }
        if (pointerEvent.button === 2) {
            void st.controller.commit();
            return;
        }
        if (st.activeBrush?.type === 'region') {
            // A click drops a region vertex; a drag paints a freehand stroke (decided on move).
            st.down = pt;
            st.painting = false;
            return;
        }
        st.controller.addPoint(pt);
    });

    container.on('pointermove', (pointerEvent: PIXI.FederatedPointerEvent) => {
        const pt = localPoint(pointerEvent, container);
        if (st.drag) {
            st.controller.previewVertexMove(st.drag.id, st.drag.index, pt);
            return;
        }
        const brush = st.activeBrush;
        if (!st.down || brush?.type !== 'region') {
            return;
        }
        if (!st.painting && distance(st.down, pt) > PAINT_THRESHOLD) {
            st.controller.cancel();
            st.controller.begin({ type: 'stroke', biome: brush.biome }, 'freehand');
            st.controller.addPoint(st.down);
            st.painting = true;
        }
        if (st.painting) {
            st.controller.addPoint(pt);
        }
    });

    container.on('pointerup', (pointerEvent: PIXI.FederatedPointerEvent) => {
        const pt = localPoint(pointerEvent, container);
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
        if (st.painting) {
            void st.controller.commit();
            if (st.activeBrush) {
                st.controller.begin(st.activeBrush, 'click');
            }
            st.painting = false;
        } else {
            st.controller.addPoint(st.down);
        }
        st.down = null;
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

Hooks.on('getSceneControlButtons', (controls) => {
    const st = state;
    const tools: Record<string, foundry.applications.ui.SceneControls.Tool> = {
        road: { name: 'road', order: 0, title: I18N.tools.road, icon: 'fa-solid fa-road' },
        river: { name: 'river', order: 1, title: I18N.tools.river, icon: 'fa-solid fa-water' },
    };
    BIOMES.forEach((biome, i) => {
        tools[biome] = { name: biome, order: i + 2, title: BIOME_TITLE_KEYS[biome], icon: BIOME_ICONS[biome] };
    });
    const roomOrder = BIOMES.length + 2;
    tools['room'] = { name: 'room', order: roomOrder, title: I18N.tools.room, icon: 'fa-solid fa-vector-square' };
    const doorOrder = roomOrder + 1;
    tools['door'] = { name: 'door', order: doorOrder, title: I18N.tools.door, icon: 'fa-solid fa-door-open' };
    const editOrder = doorOrder + 1;
    tools['edit'] = { name: 'edit', order: editOrder, title: I18N.tools.edit, icon: 'fa-solid fa-arrows-up-down-left-right' };
    const eraseOrder = editOrder + 1;
    tools['erase'] = { name: 'erase', order: eraseOrder, title: I18N.tools.erase, icon: 'fa-solid fa-eraser' };
    tools['undo'] = {
        name: 'undo',
        order: eraseOrder + 1,
        title: I18N.tools.undo,
        icon: 'fa-solid fa-rotate-left',
        button: true,
        onChange: (): void => {
            if (st) {
                void st.controller.undo();
            }
        },
    };
    tools['redo'] = {
        name: 'redo',
        order: eraseOrder + 2,
        title: I18N.tools.redo,
        icon: 'fa-solid fa-rotate-right',
        button: true,
        onChange: (): void => {
            if (st) {
                void st.controller.redo();
            }
        },
    };
    controls[MODULE_ID] = {
        name: MODULE_ID,
        order: 100,
        title: I18N.controlsGroup,
        icon: 'fa-solid fa-map',
        tools,
        activeTool: 'road',
        onChange: (_event, active): void => {
            if (st && !active) {
                st.active = false;
                st.erasing = false;
                st.editing = false;
                st.doorMode = false;
                st.drag = null;
                st.activeBrush = null;
                st.down = null;
                st.painting = false;
                st.controller.cancel();
            }
        },
        onToolChange: (_event, tool, active): void => {
            if (!st) {
                return;
            }
            st.drag = null;
            st.down = null;
            st.painting = false;
            st.doorMode = false;
            if (tool.name === 'door') {
                st.active = active;
                st.doorMode = active;
                st.editing = false;
                st.erasing = false;
                st.activeBrush = null;
                st.controller.cancel();
                return;
            }
            if (tool.name === 'edit') {
                st.active = active;
                st.editing = active;
                st.erasing = false;
                st.activeBrush = null;
                st.controller.cancel();
                return;
            }
            if (tool.name === 'erase') {
                st.active = active;
                st.erasing = active;
                st.editing = false;
                st.activeBrush = null;
                st.controller.cancel();
                return;
            }
            const brush = brushFor(tool.name);
            if (active && brush) {
                st.active = true;
                st.erasing = false;
                st.editing = false;
                st.activeBrush = brush;
                st.controller.begin(brush, 'click');
            } else {
                st.active = false;
                st.erasing = false;
                st.editing = false;
                st.activeBrush = null;
                st.controller.cancel();
            }
        },
    };
});
