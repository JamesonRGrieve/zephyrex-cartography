// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The link tool's Foundry side. It finds what lies under the pointer (a
 * feature, or a plain Foundry light), carries out {@link linkClick}'s action,
 * and draws each link from the picked switch to what it controls while the
 * tool is active.
 */
import type { CartographyController } from '../canvas/controller';
import type { Point } from '../geometry/spline';
import { linkClick } from '../tools/switch-link';
import { activeScene } from './scene-bridge';

/** Scene-px radius within which a click picks a plain light. */
const LIGHT_PICK_PX = 24;

const LINK_COLOUR = 0xffc857;
const LINK_WIDTH_PX = 3;
const MARK_RADIUS_PX = 10;

export interface SwitchLinker {
    /** Act on a click with the link tool at scene point `pt`. */
    readonly click: (pt: Point) => Promise<void>;
    /** Redraw the picked switch's links. */
    readonly redraw: () => void;
    /** Forget the picked switch and clear its links (leaving the tool). */
    readonly reset: () => void;
}

/** Where plain light `id` is on the canvas, if it is on the scene. */
function lightPosition(id: string): Point | null {
    const light = canvas?.scene?.lights.get(id);
    return light ? { x: light.x, y: light.y } : null;
}

/** The plain light nearest `pt` within reach, by id. */
function lightNear(pt: Point): string | null {
    let best: { id: string; distance: number } | null = null;
    for (const light of canvas?.scene?.lights.contents ?? []) {
        const distance = Math.hypot(light.x - pt.x, light.y - pt.y);
        if (distance <= LIGHT_PICK_PX && (best === null || distance < best.distance)) {
            best = { id: light.id, distance };
        }
    }
    return best?.id ?? null;
}

export function createSwitchLinker(controller: CartographyController, layer: PIXI.Container): SwitchLinker {
    let selected: string | null = null;
    const lines = new PIXI.Graphics();
    layer.addChild(lines);

    const redraw = (): void => {
        lines.clear();
        const from = selected === null ? null : controller.featureCentre(selected);
        if (selected === null || from === null) {
            return;
        }
        lines.lineStyle(LINK_WIDTH_PX, LINK_COLOUR, 1);
        lines.drawCircle(from.x, from.y, MARK_RADIUS_PX);
        for (const target of controller.switchTargets(selected)) {
            const to = target.kind === 'light' ? lightPosition(target.id) : controller.featureCentre(target.id);
            if (to) {
                lines.moveTo(from.x, from.y);
                lines.lineTo(to.x, to.y);
                lines.drawCircle(to.x, to.y, MARK_RADIUS_PX / 2);
            }
        }
    };

    return {
        click: async (pt) => {
            const hitId = controller.hitTest(pt);
            const hit = hitId === null ? null : { id: hitId, isSwitch: controller.isLightSwitch(hitId) };
            const action = linkClick(selected, hit, activeScene() ? lightNear(pt) : null);
            if (action.kind === 'select') {
                selected = action.switchId;
            } else if (action.kind === 'toggle') {
                await controller.toggleSwitchTarget(action.switchId, action.target);
            }
            redraw();
        },
        redraw,
        reset: () => {
            selected = null;
            lines.clear();
        },
    };
}
