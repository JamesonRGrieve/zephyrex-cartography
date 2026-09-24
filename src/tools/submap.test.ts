// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { exitRegion, exitSquare, parseSubmapLink, type SubmapLink } from './submap';

const link: SubmapLink = { scene: 'sc1', sceneName: 'Hab interior', entryRegion: 'in1', exitRegion: 'out1' };

describe('exitSquare', () => {
    it('is one grid square at the centre of the scene', () => {
        expect(exitSquare({ x: 100, y: 100, width: 1000, height: 800, gridSize: 100 })).toEqual([
            { x: 550, y: 450 },
            { x: 650, y: 450 },
            { x: 650, y: 550 },
            { x: 550, y: 550 },
        ]);
    });

    it('falls back to a tenth of the shorter side on a gridless scene', () => {
        const [corner, next] = exitSquare({ x: 0, y: 0, width: 1000, height: 500, gridSize: 0 });
        expect(corner).toEqual({ x: 475, y: 225 });
        expect(next).toEqual({ x: 525, y: 225 });
    });
});

describe('exitRegion', () => {
    it('keeps its fixed id and teleports back to the entrance in the origin scene', () => {
        const polygon = exitSquare({ x: 0, y: 0, width: 100, height: 100, gridSize: 10 });
        expect(exitRegion(link, polygon, 'here', 'Town')).toEqual({
            id: 'out1',
            label: { kind: 'exit', scene: 'Town' },
            polygon,
            bottom: null,
            top: null,
            level: null,
            behaviour: { kind: 'teleport', targets: [{ scene: 'here', region: 'in1' }] },
        });
    });
});

describe('parseSubmapLink', () => {
    it('parses a complete link and rejects anything missing a field', () => {
        expect(parseSubmapLink({ ...link })).toEqual(link);
        expect(parseSubmapLink({ ...link, exitRegion: 7 })).toBeNull();
        expect(parseSubmapLink({ scene: 'sc1' })).toBeNull();
        expect(parseSubmapLink('sc1')).toBeNull();
        expect(parseSubmapLink(null)).toBeNull();
    });
});
