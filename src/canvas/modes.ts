// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the canvas layer does with pointer input, per scene-control tool. One
 * discriminated mode replaces a growing set of boolean flags, so the entry's
 * pointer handlers switch on a single value. Pure and unit-tested.
 */
import type { BiomeKind } from '../tools/biome';
import type { RoomMaterials } from '../tools/room';
import type { Brush } from './controller';

export type Mode =
    | { readonly kind: 'idle' }
    | { readonly kind: 'brush'; readonly brush: Brush }
    | { readonly kind: 'erase' }
    | { readonly kind: 'edit' }
    | { readonly kind: 'door' }
    | { readonly kind: 'stamp' }
    | { readonly kind: 'materials' }
    | { readonly kind: 'link' }
    | { readonly kind: 'effects' }
    | { readonly kind: 'pin' };

export const IDLE: Mode = { kind: 'idle' };

/** The tools whose mode is just their name: they act on what is clicked. */
const PLAIN_MODES = ['erase', 'edit', 'door', 'stamp', 'materials', 'link', 'effects', 'pin'] as const satisfies readonly Exclude<
    Mode['kind'],
    'idle' | 'brush'
>[];

/** What the GM last chose in the tools' panels: the paint tool's texture, and new rooms' materials. */
export interface ToolChoices {
    readonly paint: BiomeKind;
    readonly room: RoomMaterials;
}

function brushFor(toolName: string, choices: ToolChoices): Brush | null {
    if (toolName === 'road' || toolName === 'river') {
        return { type: 'path', kind: toolName };
    }
    if (toolName === 'room') {
        return { type: 'room', ...choices.room };
    }
    if (toolName === 'paint') {
        return { type: 'region', biome: choices.paint };
    }
    return null;
}

/** The mode a scene-control tool puts the layer in when it becomes active (inactive tools leave it idle). */
export function modeForTool(toolName: string, active: boolean, choices: ToolChoices): Mode {
    if (!active) {
        return IDLE;
    }
    const plain = PLAIN_MODES.find((kind) => kind === toolName);
    if (plain !== undefined) {
        return { kind: plain };
    }
    const brush = brushFor(toolName, choices);
    return brush ? { kind: 'brush', brush } : IDLE;
}
