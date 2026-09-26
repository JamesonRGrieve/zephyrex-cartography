// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Concrete {@link DrawSurface} backed by PIXI: one keyed node per feature in a
 * container — a PIXI.Graphics for a flat colour fill, or a Container holding a
 * masked TilingSprite for a textured fill. This is the Foundry/PIXI boundary —
 * the only module that touches PIXI directly.
 *
 * A textured fill tiles from the scene's origin at the grid-relative
 * {@link tileSpan}, so overlapping fills of one texture line up. A feathered
 * one softens only its mask's edge: blurring the fill itself would smear the
 * whole texture.
 */
import type { DrawSurface } from '../canvas/renderer';
import { isCompressedTexture, tileSpan } from '../tools/texture';

/** Blur strength (px) for a feathered (soft-edged) region boundary. */
const FEATHER_BLUR = 6;

/** Room (px) left round a feathered mask for its blur to spread into. */
const FEATHER_PAD = FEATHER_BLUR * 2;

/** Longest side (px) a feathered mask is rendered at: a larger area's mask is rendered coarser, its edge soft anyway. */
const MAX_MASK_SIDE = 4096;

interface Bounds {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
}

/**
 * The texture the canvas draws `url` with. PIXI decodes ordinary images
 * itself; GPU-compressed art (KTX2, Basis) only Foundry's loader decodes, so
 * the pack runtime loads a texture set's compressed images before anything
 * redraws with them, and they come from Foundry's cache here (empty until
 * then).
 */
export function canvasTexture(url: string): PIXI.Texture {
    if (!isCompressedTexture(url)) {
        const texture = PIXI.Texture.from(url);
        // Terrain tiles repeat, and are drawn well below their own size: without mipmaps (PIXI builds them only for
        // power-of-two images by default) a shrunk photo shimmers and aliases. Compressed art carries its own levels.
        texture.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
        texture.baseTexture.mipmap = PIXI.MIPMAP_MODES.ON;
        return texture;
    }
    const loaded = foundry.canvas.getTexture(url);
    return loaded instanceof PIXI.Texture ? loaded : PIXI.Texture.EMPTY;
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

/**
 * A tiling sprite's tile offset and scale. The bundled PIXI typings leave its
 * `ObservablePoint`s untyped; this is the part of them used here, which the
 * sprite satisfies structurally.
 */
interface TileTransform {
    readonly tilePosition: { set: (x: number, y: number) => void };
    readonly tileScale: { set: (x: number, y: number) => void };
}

/** Size `sprite`'s tiles to {@link tileSpan} once its texture's size is known. */
function scaleTiles(sprite: PIXI.TilingSprite, tiles: TileTransform, gridSize: number): void {
    const base = sprite.texture.baseTexture;
    const apply = (): void => {
        // A fill redrawn before its texture arrived (a stroke painted on as it is dragged) is already gone.
        if (sprite.destroyed) {
            return;
        }
        tiles.tileScale.set(tileSpan(gridSize, base.width) / base.width, tileSpan(gridSize, base.height) / base.height);
    };
    if (base.valid) {
        apply();
    } else {
        base.once('loaded', apply);
    }
}

/** A drawn node, and the mask texture rendered for it (textures from the shared cache are never destroyed with a node). */
interface Node {
    readonly node: PIXI.Container;
    readonly maskTexture: PIXI.RenderTexture | null;
}

/**
 * The mask for a fill of `polygon`: the polygon itself for a crisp edge, or,
 * for a feathered one, the polygon rendered blurred into a texture, as an
 * alpha mask. Without a renderer the edge stays crisp.
 */
function maskFor(polygon: readonly number[], feather: boolean): { readonly mask: PIXI.Container; readonly texture: PIXI.RenderTexture | null } {
    const shape = new PIXI.Graphics();
    shape.beginFill(0xffffff);
    shape.drawPolygon([...polygon]);
    shape.endFill();
    const renderer = canvas?.app?.renderer;
    if (!feather || !renderer) {
        return { mask: shape, texture: null };
    }
    shape.filters = [new PIXI.BlurFilter(FEATHER_BLUR)];
    const b = bounds(polygon);
    const region = new PIXI.Rectangle(b.x - FEATHER_PAD, b.y - FEATHER_PAD, b.w + 2 * FEATHER_PAD, b.h + 2 * FEATHER_PAD);
    const texture = renderer.generateTexture(shape, { region, resolution: Math.min(1, MAX_MASK_SIDE / Math.max(region.width, region.height)) });
    shape.destroy();
    const mask = new PIXI.Sprite(texture);
    mask.x = region.x;
    mask.y = region.y;
    return { mask, texture };
}

/** Draw into `container` on a grid of `gridSize` px (0: none). */
export function createPixiSurface(container: PIXI.Container, gridSize: number): DrawSurface {
    const nodes = new Map<string, Node>();

    const drop = (id: string): void => {
        const drawn = nodes.get(id);
        if (drawn) {
            container.removeChild(drawn.node);
            drawn.node.destroy({ children: true });
            drawn.maskTexture?.destroy(true);
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
            // A flat colour has no detail to smear, so its whole fill blurs.
            g.filters = feather ? [new PIXI.BlurFilter(FEATHER_BLUR)] : null;
            container.addChild(g);
            nodes.set(id, { node: g, maskTexture: null });
        },
        fillTextured(id, polygon, textureUrl, tint, alpha, feather): void {
            drop(id);
            const b = bounds(polygon);
            const pad = feather ? FEATHER_PAD : 0;
            const wrap = new PIXI.Container();
            const sprite = new PIXI.TilingSprite(canvasTexture(textureUrl), b.w + 2 * pad, b.h + 2 * pad);
            sprite.x = b.x - pad;
            sprite.y = b.y - pad;
            const tiles: TileTransform = sprite;
            // Tiles start from the scene's origin, not the fill's corner.
            tiles.tilePosition.set(pad - b.x, pad - b.y);
            scaleTiles(sprite, tiles, gridSize);
            sprite.tint = tint;
            sprite.alpha = alpha;
            const { mask, texture } = maskFor(polygon, feather);
            sprite.mask = mask;
            wrap.addChild(mask, sprite);
            container.addChild(wrap);
            nodes.set(id, { node: wrap, maskTexture: texture });
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
