// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { IDLE, modeForTool, type ToolChoices } from './modes';

const CHOICES: ToolChoices = { paint: 'lava', room: { floor: 'floor.stone', wall: 'wall.brick', wallKind: 'window', ceiling: false } };

describe('modeForTool', () => {
    it('maps drawing tools to brushes, with the texture and materials last chosen', () => {
        expect(modeForTool('road', true, CHOICES)).toEqual({ kind: 'brush', brush: { type: 'path', kind: 'road' } });
        expect(modeForTool('river', true, CHOICES)).toEqual({ kind: 'brush', brush: { type: 'path', kind: 'river' } });
        expect(modeForTool('room', true, CHOICES)).toEqual({
            kind: 'brush',
            brush: { type: 'room', floor: 'floor.stone', wall: 'wall.brick', wallKind: 'window', ceiling: false },
        });
        expect(modeForTool('paint', true, CHOICES)).toEqual({ kind: 'brush', brush: { type: 'region', biome: 'lava' } });
    });

    it('maps the interaction tools to their own modes', () => {
        const plain = ['erase', 'edit', 'door', 'stamp', 'materials', 'link', 'effects', 'pin'];
        expect(plain.map((t) => modeForTool(t, true, CHOICES).kind)).toEqual(plain);
    });

    it('is idle for an inactive or unknown tool, a biome name included', () => {
        expect(modeForTool('road', false, CHOICES)).toBe(IDLE);
        expect(modeForTool('undo', true, CHOICES)).toBe(IDLE);
        expect(modeForTool('lava', true, CHOICES)).toBe(IDLE);
    });
});
