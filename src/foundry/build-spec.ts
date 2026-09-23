// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Build a scene spec on the viewed scene: its (0, 0) is the scene's top-left
 * corner, inside the canvas padding, and grid units are the scene's grid. The
 * one place the map builder window and the module API realise specs.
 */
import type { CartographyController } from '../canvas/controller';
import { realizeSpec, type RealizeReport } from '../canvas/realize';
import type { SceneSpec } from '../generate/spec';

export async function buildOnScene(controller: CartographyController, spec: SceneSpec): Promise<RealizeReport> {
    const sceneTopLeft = { x: canvas?.dimensions?.sceneX ?? 0, y: canvas?.dimensions?.sceneY ?? 0 };
    const gridSize = controller.grid?.size ?? canvas?.dimensions?.size ?? 1;
    return realizeSpec(controller, spec, { origin: sceneTopLeft, gridSize });
}
