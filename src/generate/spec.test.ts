// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { formatSpecIssue, parseSceneSpec, parseSceneSpecJson } from './spec';

const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
];

describe('parseSceneSpec', () => {
    it('accepts a spec, filling in the defaults', () => {
        const result = parseSceneSpec({ schemaVersion: 1, features: [{ type: 'room', points: square, doors: [{ segment: 1 }] }] });
        expect(result).toEqual({
            ok: true,
            spec: {
                schemaVersion: 1,
                units: 'grid',
                levels: [],
                features: [
                    {
                        type: 'room',
                        points: square,
                        wall: null,
                        wallKind: 'solid',
                        doors: [{ segment: 1, type: 'door', state: 'closed', sound: null, animation: null }],
                    },
                ],
            },
        });
    });

    it('accepts every feature type', () => {
        const result = parseSceneSpec({
            schemaVersion: 1,
            units: 'px',
            levels: [{ key: 'g', name: 'Ground', bottom: 0, top: 10 }],
            features: [
                { type: 'region', biome: 'forest', points: square },
                { type: 'stroke', biome: 'sand', points: square.slice(0, 2), radius: 30 },
                { type: 'path', kind: 'road', points: square.slice(0, 2), halfWidth: 12, walls: true, level: 'g' },
                { type: 'room', points: square, floor: 'floor.oak', wall: 'wall.brick' },
                { type: 'stamp', stamp: 'pack:hab', x: 2, y: 2, rotation: 90, interior: { create: 'Hab interior' } },
                { type: 'stamp', stamp: 'pack:hab', x: 8, y: 2, interior: { scene: 'abc' } },
            ],
        });
        expect(result.ok).toBe(true);
    });

    it('reports schema violations with their paths', () => {
        const result = parseSceneSpec({ schemaVersion: 1, features: [{ type: 'region', biome: 'quicksand', points: square }] });
        expect(result.ok ? null : result.issues[0]?.path).toBe('features.0.biome');
        expect(parseSceneSpec({ schemaVersion: 2, features: [] }).ok).toBe(false);
        expect(parseSceneSpec({ schemaVersion: 1, features: [{ type: 'room', points: square, floor: 'marble' }] }).ok).toBe(false);
        expect(parseSceneSpec({ schemaVersion: 1, features: [{ type: 'room', points: square, wall: 'brick' }] }).ok).toBe(false);
        expect(parseSceneSpec('nope').ok).toBe(false);
    });

    it('parses JSON text, reporting text that is not JSON at the root', () => {
        expect(parseSceneSpecJson('{"schemaVersion": 1, "features": []}').ok).toBe(true);
        const broken = parseSceneSpecJson('{"schemaVersion": 1,');
        expect(broken.ok ? null : broken.issues.map((i) => i.path)).toEqual(['']);
        const wrong = parseSceneSpecJson('{"schemaVersion": 2, "features": []}');
        expect(wrong.ok ? null : wrong.issues.map(formatSpecIssue)[0]).toMatch(/^schemaVersion: /);
        expect(formatSpecIssue({ path: '', message: 'bad' })).toBe('bad');
    });

    it('reports duplicate level keys, unknown level references and doors off the room', () => {
        const result = parseSceneSpec({
            schemaVersion: 1,
            levels: [
                { key: 'g', name: 'Ground' },
                { key: 'g', name: 'Again' },
            ],
            features: [
                { type: 'region', biome: 'forest', points: square, level: 'roof' },
                { type: 'room', points: square, doors: [{ segment: 4 }] },
            ],
        });
        expect(result.ok ? [] : result.issues.map((i) => i.path)).toEqual(['levels.1.key', 'features.0.level', 'features.1.doors.0.segment']);
    });
});
