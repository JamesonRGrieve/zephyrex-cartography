// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { IDLE, modeForTool } from './modes';

describe('modeForTool', () => {
    it('maps drawing tools to brushes', () => {
        expect(modeForTool('road', true)).toEqual({ kind: 'brush', brush: { type: 'path', kind: 'road' } });
        expect(modeForTool('river', true)).toEqual({ kind: 'brush', brush: { type: 'path', kind: 'river' } });
        expect(modeForTool('room', true)).toEqual({ kind: 'brush', brush: { type: 'room', floor: 'dirt' } });
        expect(modeForTool('lava', true)).toEqual({ kind: 'brush', brush: { type: 'region', biome: 'lava' } });
    });

    it('maps the interaction tools to their own modes', () => {
        expect(['erase', 'edit', 'door', 'stamp'].map((t) => modeForTool(t, true).kind)).toEqual(['erase', 'edit', 'door', 'stamp']);
    });

    it('is idle for an inactive or unknown tool', () => {
        expect(modeForTool('road', false)).toBe(IDLE);
        expect(modeForTool('undo', true)).toBe(IDLE);
    });
});
