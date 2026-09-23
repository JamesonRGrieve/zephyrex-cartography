// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the canvas layer does with pointer input, per scene-control tool. One
 * discriminated mode replaces a growing set of boolean flags, so the entry's
 * pointer handlers switch on a single value. Pure and unit-tested.
 */
import { isBiomeKind } from '../tools/region';
import { DEFAULT_FLOOR } from '../tools/room';
import type { Brush } from './controller';

export type Mode =
    | { readonly kind: 'idle' }
    | { readonly kind: 'brush'; readonly brush: Brush }
    | { readonly kind: 'erase' }
    | { readonly kind: 'edit' }
    | { readonly kind: 'door' }
    | { readonly kind: 'stamp' };

export const IDLE: Mode = { kind: 'idle' };

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

/** The mode a scene-control tool puts the layer in when it becomes active (inactive tools leave it idle). */
export function modeForTool(toolName: string, active: boolean): Mode {
    if (!active) {
        return IDLE;
    }
    if (toolName === 'erase' || toolName === 'edit' || toolName === 'door' || toolName === 'stamp') {
        return { kind: toolName };
    }
    const brush = brushFor(toolName);
    return brush ? { kind: 'brush', brush } : IDLE;
}
