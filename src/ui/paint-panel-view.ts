// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The paint tool's panel: whether it lays ground or blends texture into the
 * level's splat map, the ground from a swatch grid, the texture it is drawn
 * in (its own, or any of the active set's, and which set), the brush size,
 * and then what crossing painted ground costs (difficult terrain) or how much
 * one blend dab lays down, with buttons to bake the blend into a native Tile
 * or its level's background (or take it back). A swatch shows the texture
 * from the active set, or the terrain's flat colour where the set has none
 * (water is always a tint). A pure function from the panel state to
 * elements; unit-tested under happy-dom.
 */
import type { BiomeKind } from '../tools/biome';
import { BAKE_TARGETS, type BakeTarget, PAINT_MODES, type PaintMode, type SplatState } from '../tools/splat';
import type { TextureSwatch } from '../tools/texture';
import { actionRow, button, choice, disclosure, el, labelledInput, pressable, replacePreservingFocus } from './dom';

export interface PaintChoice {
    readonly biome: BiomeKind;
    readonly label: string;
    /** The texture's image URL, or null to show the flat colour. */
    readonly image: string | null;
    /** The flat colour, as a CSS colour. */
    readonly colour: string;
}

/** A texture set in the picker: its key and name. */
export interface TextureSetChoice {
    readonly key: string;
    readonly label: string;
}

export interface PaintPanel {
    readonly choices: readonly PaintChoice[];
    readonly biome: BiomeKind;
    /** Every texture the active set has. */
    readonly textures: readonly TextureSwatch[];
    /** The texture the ground is drawn in, or null for its biome's own. */
    readonly texture: string | null;
    /** The texture sets the packs provide, and the one in use (its key). */
    readonly sets: readonly TextureSetChoice[];
    readonly set: string;
    /** Brush radius, scene px. */
    readonly radius: number;
    /** What crossing painted ground costs on foot (1: ordinary ground). */
    readonly movementCost: number;
    /** Lay areas and strokes, or blend the texture into the level's splat map (or take it out). */
    readonly mode: PaintMode;
    /** 0.05–1: how much one blend dab lays down. */
    readonly strength: number;
    /** Whether the level's blend is live, baked (into a Tile or its background), or not there yet. */
    readonly splat: SplatState;
    /** Whether the blend has a level whose background it can be baked into (one on every level has none). */
    readonly backgroundBakeable: boolean;
}

export interface PaintLabels {
    readonly ground: string;
    /** The texture section's title, naming the texture in use. */
    readonly texture: (shown: string) => string;
    /** The texture choice that draws the ground in its biome's own. */
    readonly ownTexture: string;
    readonly textureSet: string;
    readonly size: string;
    readonly movementCost: string;
    readonly mode: string;
    readonly modes: Readonly<Record<PaintMode, string>>;
    readonly strength: string;
    readonly bake: Readonly<Record<BakeTarget, string>>;
    readonly unbake: string;
}

export interface PaintHandlers {
    readonly pick: (biome: BiomeKind) => void;
    /** Draw the ground in `texture`, or in its biome's own (null). */
    readonly pickTexture: (texture: string | null) => void;
    /** Use another texture set (its key) for all terrain. */
    readonly chooseSet: (key: string) => void;
    /** Apply a typed brush size; false rejects it (the input reverts). */
    readonly setSize: (typed: string) => boolean;
    /** Apply a typed movement cost; false rejects it (the input reverts). */
    readonly setMovementCost: (typed: string) => boolean;
    readonly setMode: (mode: PaintMode) => void;
    /** Apply a typed blend strength; false rejects it (the input reverts). */
    readonly setStrength: (typed: string) => boolean;
    /** Bake the level's blend into a Tile or its level's background. */
    readonly bake: (into: BakeTarget) => void;
    /** Take a baked blend back to paint on. */
    readonly unbake: () => void;
}

/** While the blend is live, a button per place it can be baked into; while it is baked, one to take it back. */
function bakeButtons(panel: PaintPanel, labels: PaintLabels, handlers: PaintHandlers): HTMLButtonElement[] {
    if (panel.splat === 'tile' || panel.splat === 'background') {
        return [button('tw-text-xs', labels.unbake, 'paint-unbake', handlers.unbake)];
    }
    return BAKE_TARGETS.map((into) => {
        const bake = button('tw-text-xs', labels.bake[into], `paint-bake-${into}`, () => {
            handlers.bake(into);
        });
        bake.disabled = panel.splat === 'none' || (into === 'background' && !panel.backgroundBakeable);
        return bake;
    });
}

/** A swatch tile: a chip of the texture (or its colour) and its name. */
function swatch(
    look: { readonly label: string; readonly image: string | null; readonly colour: string },
    picked: boolean,
    key: string,
    onPick: () => void,
): HTMLButtonElement {
    const node = pressable('zc-tile zc-paint-swatch tw-flex tw-flex-col tw-items-center tw-gap-1 tw-text-xs', '', picked, key, onPick);
    const chip = el('span', 'tw-block tw-h-10 tw-w-10 tw-rounded tw-bg-cover');
    chip.style.backgroundColor = look.colour;
    if (look.image !== null) {
        chip.style.backgroundImage = `url(${JSON.stringify(look.image)})`;
    }
    node.append(chip, el('span', '', look.label));
    return node;
}

/** A labelled grid of swatch tiles, the full width of whatever row it sits in. */
function swatchGrid(label: string, tiles: readonly HTMLButtonElement[]): HTMLElement {
    const group = el('div', 'tw-grid tw-w-full tw-basis-full tw-grid-cols-4 tw-gap-1');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    group.append(...tiles);
    return group;
}

/** The texture section: which set, and the texture the ground is drawn in, its biome's own first. */
function textureSection(panel: PaintPanel, labels: PaintLabels, handlers: PaintHandlers): HTMLElement {
    const ground = panel.choices.find((c) => c.biome === panel.biome);
    const picked = panel.textures.find((t) => t.role === panel.texture);
    // The ground's own texture, as its biome's swatch shows it.
    const own = swatch(
        { label: labels.ownTexture, image: ground?.image ?? null, colour: ground?.colour ?? 'transparent' },
        picked === undefined,
        'paint-texture-own',
        () => {
            handlers.pickTexture(null);
        },
    );
    const tiles = panel.textures.map((texture) =>
        swatch({ ...texture, colour: 'transparent' }, texture === picked, `paint-texture-${texture.role}`, () => {
            handlers.pickTexture(texture.role);
        }),
    );
    const sets = panel.sets.map((set) => [set.key, set.label] as const);
    return disclosure(labels.texture(picked?.label ?? labels.ownTexture), 'paint-texture', [
        ...(sets.length > 1 ? [choice('zc-paint-set', labels.textureSet, sets, panel.set, handlers.chooseSet)] : []),
        swatchGrid(labels.texture(picked?.label ?? labels.ownTexture), [own, ...tiles]),
    ]);
}

export function renderPaintPanel(root: HTMLElement, panel: PaintPanel, labels: PaintLabels, handlers: PaintHandlers): void {
    const grounds = panel.choices.map((ground) =>
        swatch(ground, ground.biome === panel.biome, `paint-${ground.biome}`, () => {
            handlers.pick(ground.biome);
        }),
    );
    const blending = panel.mode !== 'shapes';
    replacePreservingFocus(root, [
        choice(
            'zc-paint-mode',
            labels.mode,
            PAINT_MODES.map((mode) => [mode, labels.modes[mode]] as const),
            panel.mode,
            handlers.setMode,
        ),
        swatchGrid(labels.ground, grounds),
        textureSection(panel, labels, handlers),
        labelledInput(labels.size, 'number', String(panel.radius), 'paint-size', handlers.setSize),
        // Blending paints texture, not ground: its cost belongs to areas and strokes, its strength to the blend.
        blending
            ? labelledInput(labels.strength, 'number', String(panel.strength), 'paint-strength', handlers.setStrength)
            : labelledInput(labels.movementCost, 'number', String(panel.movementCost), 'paint-cost', handlers.setMovementCost),
        // Baking is the blend's: it shows while blending.
        ...(blending ? [actionRow(bakeButtons(panel, labels, handlers))] : []),
    ]);
}
