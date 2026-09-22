// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Zephyrex Cartography — Draw: Foundry entry / runtime seam.
 *
 * All drawing logic lives in the pure, unit-tested modules (geometry, tools,
 * canvas/controller, canvas/renderer). This file is the thin glue that wires the
 * live Foundry canvas, scene, and PIXI into that logic and registers the
 * scene-control tools (road/river paths + biome regions). It is the module's
 * single Foundry boundary.
 */
import './styles/entry.css';
import { CartographyController, type Brush } from './canvas/controller';
import { GraphicsFeatureRenderer } from './canvas/renderer';
import type { FoundryScene } from './foundry/boundary';
import { createPixiSurface } from './foundry/pixi-surface';
import { FoundrySceneStore } from './foundry/scene-store';
import { FoundryWallEmitter } from './foundry/walls';
import type { Point } from './geometry/spline';
import { BIOMES, isBiomeKind, type BiomeKind } from './tools/region';

export const MODULE_ID = 'dh-cartography-draw';

interface DrawState {
    controller: CartographyController;
    container: PIXI.Container;
    active: boolean;
}

let state: DrawState | null = null;

const BIOME_ICONS: Record<BiomeKind, string> = {
    water: 'fa-solid fa-water',
    grassland: 'fa-solid fa-seedling',
    forest: 'fa-solid fa-tree',
    sand: 'fa-solid fa-sun',
    rock: 'fa-solid fa-mountain',
    snow: 'fa-solid fa-snowflake',
    dirt: 'fa-solid fa-mound',
};

const BIOME_TITLES: Record<BiomeKind, string> = {
    water: 'DH-CARTOGRAPHY-DRAW.Biomes.Water',
    grassland: 'DH-CARTOGRAPHY-DRAW.Biomes.Grassland',
    forest: 'DH-CARTOGRAPHY-DRAW.Biomes.Forest',
    sand: 'DH-CARTOGRAPHY-DRAW.Biomes.Sand',
    rock: 'DH-CARTOGRAPHY-DRAW.Biomes.Rock',
    snow: 'DH-CARTOGRAPHY-DRAW.Biomes.Snow',
    dirt: 'DH-CARTOGRAPHY-DRAW.Biomes.Dirt',
};

function brushFor(name: string): Brush | null {
    if (name === 'road' || name === 'river') {
        return { type: 'path', kind: name };
    }
    if (isBiomeKind(name)) {
        return { type: 'region', biome: name };
    }
    return null;
}

/**
 * Adapt the live scene to the narrow {@link FoundryScene} the boundary needs.
 * Framework boundary: a Foundry `Scene` structurally provides getFlag / setFlag /
 * createEmbeddedDocuments; we reinterpret it as our minimal, precisely-typed
 * surface so the pure store/wall code never depends on fvtt-types flag generics.
 */
function activeScene(): FoundryScene | null {
    const scene = canvas?.scene;
    return scene ? (scene as FoundryScene) : null;
}

function localPoint(event: PIXI.FederatedPointerEvent, container: PIXI.Container): Point {
    const p = event.getLocalPosition(container);
    return { x: p.x, y: p.y };
}

function teardown(): void {
    if (state) {
        state.container.destroy({ children: true });
        state = null;
    }
}

Hooks.on('canvasReady', () => {
    teardown();
    if (!canvas?.stage) {
        return;
    }
    const container = new PIXI.Container();
    container.eventMode = 'static';
    canvas.stage.addChild(container);

    const renderer = new GraphicsFeatureRenderer(createPixiSurface(container));
    const controller = new CartographyController(renderer, new FoundrySceneStore(activeScene), new FoundryWallEmitter(activeScene), () =>
        foundry.utils.randomID(),
    );
    controller.load();

    const st: DrawState = { controller, container, active: false };
    state = st;

    container.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
        if (!st.active) {
            return;
        }
        if (event.button === 2) {
            void st.controller.commit();
            return;
        }
        st.controller.addPoint(localPoint(event, container));
    });
});

Hooks.on('getSceneControlButtons', (controls) => {
    const st = state;
    const tools: Record<string, foundry.applications.ui.SceneControls.Tool> = {
        road: { name: 'road', order: 0, title: 'DH-CARTOGRAPHY-DRAW.Tools.Road', icon: 'fa-solid fa-road' },
        river: { name: 'river', order: 1, title: 'DH-CARTOGRAPHY-DRAW.Tools.River', icon: 'fa-solid fa-water' },
    };
    BIOMES.forEach((biome, i) => {
        tools[biome] = { name: biome, order: i + 2, title: BIOME_TITLES[biome], icon: BIOME_ICONS[biome] };
    });
    controls[MODULE_ID] = {
        name: MODULE_ID,
        order: 100,
        title: 'DH-CARTOGRAPHY-DRAW.Controls.Group',
        icon: 'fa-solid fa-map',
        tools,
        activeTool: 'road',
        onChange: (_event, active): void => {
            if (st && !active) {
                st.active = false;
                st.controller.cancel();
            }
        },
        onToolChange: (_event, tool, active): void => {
            if (!st) {
                return;
            }
            const brush = brushFor(tool.name);
            if (active && brush) {
                st.active = true;
                st.controller.begin(brush, 'click');
            } else {
                st.active = false;
                st.controller.cancel();
            }
        },
    };
});
