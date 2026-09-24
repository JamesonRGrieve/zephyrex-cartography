// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Splat maps: texture blending as Dungeondraft and Inkarnate paint it. Each
 * level has at most one RGBA mask covering the scene; each of its four
 * channels weights one texture role from the active set, and the renderer
 * blends them per pixel. A soft brush paints weight into one channel and
 * takes it from the others, giving hand-painted edges no polygon can.
 *
 * The mask is image data, stored as a PNG in the world's data; the scene
 * flag keeps a layer's file path, scene bounds, mask size, channel roles and
 * level. Pure and unit-tested; the boundary loads, renders and saves masks.
 */
import type { Point } from '../geometry/spline';
import { isRecord, numberOr } from './guards';

/** The texture roles of the mask's red, green, blue and alpha channels; null for a channel not yet used. */
export type SplatRoles = readonly [string | null, string | null, string | null, string | null];

export interface SceneRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface SplatLayer {
    /** The level it covers, or null on a scene painted on every level. */
    readonly level: string | null;
    /** The mask's PNG, as a world data path. */
    readonly path: string;
    /** The scene rectangle the mask covers. */
    readonly bounds: SceneRect;
    /** Mask size in pixels. */
    readonly width: number;
    readonly height: number;
    readonly roles: SplatRoles;
    /**
     * Where the blend is baked, so it renders without the module; null while
     * it is not. A baked blend's overlay is not drawn.
     */
    readonly baked: SplatBake | null;
}

/** What a blend can be baked into: a native Tile over the scene, or its level's own background image. */
export const BAKE_TARGETS = ['tile', 'background'] as const;

export type BakeTarget = (typeof BAKE_TARGETS)[number];

/**
 * A baked blend: the Tile it is baked into, by id, or its level's
 * background, with the image the background had before, to put back on
 * unbaking.
 */
export type SplatBake = { readonly into: 'tile'; readonly tile: string } | { readonly into: 'background'; readonly previous: string | null };

/** Whether a level's blend is there to paint (live), baked into a Tile or its background, or not there at all (none). */
export type SplatState = 'none' | 'live' | BakeTarget;

/** A layer's state, as the paint panel shows it. */
export function splatState(layer: SplatLayer | null): SplatState {
    return layer === null ? 'none' : layer.baked?.into ?? 'live';
}

// eslint-disable-next-line no-restricted-syntax -- boundary: narrows a persisted bake from the scene flag
function parseBake(v: unknown): SplatBake | null {
    // A layer saved before background bakes existed recorded its Tile's id alone.
    if (typeof v === 'string') {
        return v === '' ? null : { into: 'tile', tile: v };
    }
    if (!isRecord(v)) {
        return null;
    }
    if (v['into'] === 'tile') {
        return typeof v['tile'] === 'string' && v['tile'] !== '' ? { into: 'tile', tile: v['tile'] } : null;
    }
    return v['into'] === 'background' ? { into: 'background', previous: typeof v['previous'] === 'string' ? v['previous'] : null } : null;
}

/**
 * What the paint tool does: lay areas and strokes (shapes), or paint texture
 * into the level's splat map (blend), or take it out again (unblend).
 */
export const PAINT_MODES = ['shapes', 'blend', 'unblend'] as const;

export type PaintMode = (typeof PAINT_MODES)[number];

/** How much of the way to full weight one blend dab goes: a light touch builds up, a strong one covers at once. */
export const DEFAULT_STRENGTH = 0.3;
const MIN_STRENGTH = 0.05;

/** A typed blend strength, 0.05–1, or null. */
export function parseStrength(typed: string): number | null {
    const strength = Number(typed);
    return typed.trim() !== '' && Number.isFinite(strength) && strength >= MIN_STRENGTH && strength <= 1 ? strength : null;
}

/** Mask pixels per grid square: fine enough for soft edges, small enough to save quickly. */
export const MASK_PX_PER_SQUARE = 8;

/** Largest mask side, in pixels, however big the scene. */
const MAX_MASK_SIDE = 2048;

const CHANNELS = 4;
const FULL = 255;
const NO_ROLES: SplatRoles = [null, null, null, null];

/** A fresh layer over `bounds` for `level`, its mask saved at `path`: sized by the grid, empty of roles. */
export function newSplatLayer(level: string | null, path: string, bounds: SceneRect, gridSize: number): SplatLayer {
    const scale = gridSize > 0 ? MASK_PX_PER_SQUARE / gridSize : 1;
    const side = (span: number): number => Math.max(1, Math.min(MAX_MASK_SIDE, Math.ceil(span * scale)));
    return { level, path, bounds, width: side(bounds.width), height: side(bounds.height), roles: NO_ROLES, baked: null };
}

/** Where a layer's baked image is saved: beside its mask. */
export function bakedImagePath(layer: SplatLayer): string {
    return layer.path.endsWith('.png') ? `${layer.path.slice(0, -'.png'.length)}-baked.png` : `${layer.path}-baked.png`;
}

/** An all-zero mask for `layer`: nothing painted. */
export function blankMask(layer: SplatLayer): Uint8ClampedArray<ArrayBuffer> {
    return new Uint8ClampedArray(layer.width * layer.height * CHANNELS);
}

/**
 * The channel painting `role` uses: the one already holding it, else the
 * first free one, which the returned layer now names. Null when all four
 * hold other roles.
 */
export function channelFor(layer: SplatLayer, role: string): { readonly layer: SplatLayer; readonly channel: number } | null {
    const held = layer.roles.indexOf(role);
    if (held >= 0) {
        return { layer, channel: held };
    }
    const free = layer.roles.indexOf(null);
    if (free < 0) {
        return null;
    }
    const [r, g, b, a] = layer.roles.map((existing, i) => (i === free ? role : existing));
    return { layer: { ...layer, roles: [r ?? null, g ?? null, b ?? null, a ?? null] }, channel: free };
}

/** Scene point `pt` in `layer`'s mask pixels. */
export function maskPoint(layer: SplatLayer, pt: Point): Point {
    return {
        x: ((pt.x - layer.bounds.x) / layer.bounds.width) * layer.width,
        y: ((pt.y - layer.bounds.y) / layer.bounds.height) * layer.height,
    };
}

/** Scene px `span` in mask pixels (the mask is scaled alike both ways). */
export function maskLength(layer: SplatLayer, span: number): number {
    return (span / layer.bounds.width) * layer.width;
}

/** Mask pixels a dab changed, as a rectangle; empty when it fell outside the mask. */
export interface MaskRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface Dab {
    /** Centre, mask pixels. */
    readonly at: Point;
    /** Radius, mask pixels. */
    readonly radius: number;
    /** The channel painted; ignored when erasing. */
    readonly channel: number;
    /** 0–1: how much of the way to full weight one dab goes at its centre. */
    readonly strength: number;
    /** Take weight from every channel rather than paint one. */
    readonly erase: boolean;
}

/** Smooth falloff from 1 at the centre to 0 at the rim. */
function falloff(distance: number, radius: number): number {
    const t = Math.min(1, distance / radius);
    return 1 - t * t * (3 - 2 * t);
}

/**
 * One soft dab of the brush into `mask` (in place). Painting raises the
 * channel toward full weight and lowers the others in step, so the weights
 * never sum past full; erasing lowers them all. Returns the pixels changed.
 */
export function paintDab(mask: Uint8ClampedArray, layer: SplatLayer, dab: Dab): MaskRect {
    const x0 = Math.max(0, Math.floor(dab.at.x - dab.radius));
    const y0 = Math.max(0, Math.floor(dab.at.y - dab.radius));
    const x1 = Math.min(layer.width, Math.ceil(dab.at.x + dab.radius));
    const y1 = Math.min(layer.height, Math.ceil(dab.at.y + dab.radius));
    if (dab.radius <= 0 || x1 <= x0 || y1 <= y0) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }
    for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
            const amount = dab.strength * falloff(Math.hypot(x + 0.5 - dab.at.x, y + 0.5 - dab.at.y), dab.radius);
            if (amount > 0) {
                const at = (y * layer.width + x) * CHANNELS;
                for (let c = 0; c < CHANNELS; c += 1) {
                    const weight = mask[at + c] ?? 0;
                    mask[at + c] = !dab.erase && c === dab.channel ? weight + (FULL - weight) * amount : weight * (1 - amount);
                }
            }
        }
    }
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: narrows a persisted channel role from scene-flag JSON
function parseRole(v: unknown): string | null {
    return typeof v === 'string' && v !== '' ? v : null;
}

/** Defensive parse of the persisted splat layers; malformed ones are dropped. */
// eslint-disable-next-line no-restricted-syntax -- boundary: parses untyped scene-flag JSON into narrow splat layers
export function parseSplatLayers(v: unknown): SplatLayer[] {
    if (!Array.isArray(v)) {
        return [];
    }
    return v.flatMap((entry): SplatLayer[] => {
        if (!isRecord(entry) || typeof entry['path'] !== 'string' || !isRecord(entry['bounds']) || !Array.isArray(entry['roles'])) {
            return [];
        }
        const b = entry['bounds'];
        const bounds = { x: numberOr(b['x'], 0), y: numberOr(b['y'], 0), width: numberOr(b['width'], 0), height: numberOr(b['height'], 0) };
        const width = Math.floor(numberOr(entry['width'], 0));
        const height = Math.floor(numberOr(entry['height'], 0));
        if (bounds.width <= 0 || bounds.height <= 0 || width <= 0 || height <= 0) {
            return [];
        }
        const roles = entry['roles'];
        const level = entry['level'];
        return [
            {
                level: typeof level === 'string' ? level : null,
                path: entry['path'],
                bounds,
                width,
                height,
                roles: [parseRole(roles[0]), parseRole(roles[1]), parseRole(roles[2]), parseRole(roles[3])],
                // A layer saved before baking existed is not baked.
                baked: parseBake(entry['baked']),
            },
        ];
    });
}
