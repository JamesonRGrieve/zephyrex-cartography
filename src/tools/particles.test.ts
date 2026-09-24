// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { catalogStamps } from '../canvas/test-fakes';
import { NO_LEVEL_ART, type Level } from './levels';
import { emitterShown, stampEmitters } from './particles';
import { makeStamp, type StampFeature } from './stamp';

const [campfire] = catalogStamps([
    {
        id: 'campfire',
        name: 'Campfire',
        category: 'Lighting',
        scale: 'exterior',
        perspective: 'top-down',
        particles: [
            {
                textures: ['smoke.png'],
                area: { x: 0.5, y: 0.25, radius: 0.5 },
                count: 12,
                lifetime: [1500, 3000],
                velocity: { speed: [0.2, 0.5], angle: [250, 290] },
                alpha: [0.3, 0.6],
                fade: { in: 0.2, out: 0.5 },
                elevation: 1,
            },
            { textures: ['ember.png', 'spark.png'], area: 'footprint', count: 20, lifetime: 800, blend: 'add' },
        ],
        variants: [
            { state: 'lit', image: 'fire.png', width: 100, height: 100 },
            { state: 'out', image: 'ash.png', width: 100, height: 100, particles: null },
        ],
    },
]);

const UPPER: Level = { id: 'up', name: 'Upper', bottom: 20, top: 40, art: NO_LEVEL_ART };

function place(extra: { variant?: number; rotation?: number } = {}, level: string | null = null): StampFeature {
    if (!campfire) {
        throw new Error('missing fixture');
    }
    return { ...makeStamp('fire', campfire, { stamp: campfire.key, x: 500, y: 300, ...extra }, 100), level };
}

describe('stampEmitters', () => {
    it('puts each emitter in scene terms: px, px per second, and distance units above the stamp’s floor', () => {
        const [smoke, embers] = stampEmitters(place({}, 'up'), [UPPER], 5);
        expect(smoke).toEqual({
            key: 'fire:0',
            // Served from the pack module, as the catalog resolves it.
            textures: ['modules/pack/smoke.png'],
            // A quarter down a 100px footprint centred at (500, 300); half a square is 50px.
            area: { x: 500, y: 275, radius: 50 },
            count: 12,
            lifetime: [1500, 3000],
            velocity: { speed: [20, 50], angle: [250, 290] },
            alpha: [0.3, 0.6],
            scale: 1,
            rotationSpeed: 0,
            fade: { in: 0.2, out: 0.5 },
            blend: 'normal',
            // The upper level's floor, plus one square of 5 distance units.
            elevation: 25,
            level: 'up',
        });
        expect(embers).toMatchObject({ key: 'fire:1', area: { x: 450, y: 250, width: 100, height: 100 }, velocity: null, blend: 'add', elevation: 20 });
    });

    it('turns the spawn point and the direction of flight with the stamp', () => {
        const [smoke] = stampEmitters(place({ rotation: 90 }), [], 5);
        expect(smoke?.velocity?.angle).toEqual([340, 380]);
        expect(smoke?.area).toMatchObject({ x: 525, y: 300 });
    });

    it('has none for a variant without particles', () => {
        expect(stampEmitters(place({ variant: 1 }), [], 5)).toEqual([]);
    });
});

describe('emitterShown', () => {
    it('shows an emitter on its own level, and a level-less one or any when no level is viewed', () => {
        const [onUpper] = stampEmitters(place({}, 'up'), [UPPER], 5);
        const [anywhere] = stampEmitters(place(), [], 5);
        if (!onUpper || !anywhere) {
            throw new Error('missing emitters');
        }
        expect([emitterShown(onUpper, 'up'), emitterShown(onUpper, 'ground'), emitterShown(onUpper, null)]).toEqual([true, false, true]);
        expect(emitterShown(anywhere, 'ground')).toBe(true);
    });
});
