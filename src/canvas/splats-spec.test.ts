// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { parseSceneSpec, type SceneSpec } from '../generate/spec';
import { realizeSpec } from './realize';
import { makeHarness } from './test-fakes';

function spec(raw: object): SceneSpec {
    const result = parseSceneSpec({ schemaVersion: 1, features: [], ...raw });
    if (!result.ok) {
        throw new Error(JSON.stringify(result.issues));
    }
    return result.spec;
}

/** A 2×1 mask: sand on the left, rock on the right. */
const MASK = { width: 2, height: 1, pixels: new Uint8ClampedArray([255, 0, 0, 0, 0, 255, 0, 0]) };

describe('splat maps from a scene spec', () => {
    it('adopt the mask as the level’s splat map over the whole scene, copied to its own file, as part of the build’s one undo step', async () => {
        const h = makeHarness();
        h.sp.images.set('maps/blend.png', MASK);
        const report = await realizeSpec(
            h.c,
            spec({
                levels: [{ key: 'g', name: 'Ground' }],
                splats: [{ level: 'g', mask: 'maps/blend.png', roles: ['sand', 'rock', null, null] }],
                features: [
                    {
                        type: 'region',
                        biome: 'forest',
                        points: [
                            { x: 0, y: 0 },
                            { x: 1, y: 0 },
                            { x: 1, y: 1 },
                        ],
                    },
                ],
            }),
            { origin: { x: 0, y: 0 }, gridSize: 100 },
        );
        expect(report.problems).toEqual([]);
        h.c.setActiveLevel('lv1');
        expect(h.c.splatLayer()).toEqual({
            level: 'lv1',
            path: 'splats/lv1.png',
            bounds: { x: 0, y: 0, width: 1000, height: 800 },
            width: 2,
            height: 1,
            roles: ['sand', 'rock', null, null],
        });
        // The mask is saved to the level's own file; the original is left as it was.
        expect([...(h.sp.masks.get('splats/lv1.png') ?? [])]).toEqual([...MASK.pixels]);
        expect(h.spr.shown.get('lv1')).toEqual(['sand', 'rock', null, null]);

        // One undo takes back the whole build: its features and the mask it brought.
        await h.c.undo();
        expect(h.s.last()).toEqual([]);
        expect([...(h.sp.masks.get('splats/lv1.png') ?? [])]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
        await h.c.redo();
        expect([...(h.sp.masks.get('splats/lv1.png') ?? [])]).toEqual([...MASK.pixels]);
        expect(h.s.last()).toHaveLength(1);
    });

    it('report a mask that cannot be read, and build the rest', async () => {
        const h = makeHarness();
        const report = await realizeSpec(h.c, spec({ splats: [{ mask: 'maps/missing.png', roles: ['sand', null, null, null] }] }), {
            origin: { x: 0, y: 0 },
            gridSize: 100,
        });
        expect(report.problems).toEqual([{ index: 0, problem: 'splat' }]);
        expect(h.c.splatLayer()).toBeNull();
    });
});
