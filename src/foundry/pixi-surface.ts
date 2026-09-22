// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Concrete {@link DrawSurface} backed by PIXI: one keyed PIXI.Graphics per
 * feature, filled polygons in a container. This is the Foundry/PIXI boundary —
 * the only module that touches PIXI directly.
 */
import type { DrawSurface } from '../canvas/renderer';

export function createPixiSurface(container: PIXI.Container): DrawSurface {
    const gfx = new Map<string, PIXI.Graphics>();

    const ensure = (id: string): PIXI.Graphics => {
        const existing = gfx.get(id);
        if (existing) {
            return existing;
        }
        const g = new PIXI.Graphics();
        container.addChild(g);
        gfx.set(id, g);
        return g;
    };

    const drop = (id: string): void => {
        const g = gfx.get(id);
        if (g) {
            container.removeChild(g);
            g.destroy();
            gfx.delete(id);
        }
    };

    return {
        fill(id, polygon, color, alpha): void {
            const g = ensure(id);
            g.clear();
            g.beginFill(color, alpha);
            g.drawPolygon([...polygon]);
            g.endFill();
        },
        remove(id): void {
            drop(id);
        },
        clear(): void {
            for (const id of [...gfx.keys()]) {
                drop(id);
            }
        },
    };
}
