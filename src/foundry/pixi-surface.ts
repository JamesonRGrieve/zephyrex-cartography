// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Concrete {@link DrawSurface} backed by PIXI: one keyed node per feature in a
 * container — a PIXI.Graphics for a flat colour fill, or a Container holding a
 * masked TilingSprite for a textured fill. This is the Foundry/PIXI boundary —
 * the only module that touches PIXI directly.
 */
import type { DrawSurface } from '../canvas/renderer';
import { textureUrl, type TexturePack } from '../tools/texture';

/** Blur strength (px) for a feathered (soft-edged) region boundary. */
const FEATHER_BLUR = 6;

interface Bounds {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
}

/** Soften a node's edges with a blur filter (region coastline/terrain blend), or clear it. */
function applyFeather(node: PIXI.Container, feather: boolean): void {
    node.filters = feather ? [new PIXI.BlurFilter(FEATHER_BLUR)] : null;
}

/** Axis-aligned bounding box of a flat `[x, y, …]` polygon. */
function bounds(polygon: readonly number[]): Bounds {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i + 1 < polygon.length; i += 2) {
        const x = polygon[i] ?? 0;
        const y = polygon[i + 1] ?? 0;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) };
}

export function createPixiSurface(container: PIXI.Container, pack: TexturePack): DrawSurface {
    const nodes = new Map<string, PIXI.Container>();

    const drop = (id: string): void => {
        const node = nodes.get(id);
        if (node) {
            container.removeChild(node);
            node.destroy({ children: true });
            nodes.delete(id);
        }
    };

    return {
        fill(id, polygon, color, alpha, feather): void {
            drop(id);
            const g = new PIXI.Graphics();
            g.beginFill(color, alpha);
            g.drawPolygon([...polygon]);
            g.endFill();
            applyFeather(g, feather);
            container.addChild(g);
            nodes.set(id, g);
        },
        fillTextured(id, polygon, textureFile, tint, alpha, feather): void {
            drop(id);
            const b = bounds(polygon);
            const wrap = new PIXI.Container();
            const sprite = new PIXI.TilingSprite(PIXI.Texture.from(textureUrl(pack, textureFile)), b.w, b.h);
            sprite.x = b.x;
            sprite.y = b.y;
            sprite.tint = tint;
            sprite.alpha = alpha;
            const mask = new PIXI.Graphics();
            mask.beginFill(0xffffff);
            mask.drawPolygon([...polygon]);
            mask.endFill();
            sprite.mask = mask;
            wrap.addChild(mask, sprite);
            applyFeather(wrap, feather);
            container.addChild(wrap);
            nodes.set(id, wrap);
        },
        remove(id): void {
            drop(id);
        },
        clear(): void {
            for (const id of [...nodes.keys()]) {
                drop(id);
            }
        },
    };
}
