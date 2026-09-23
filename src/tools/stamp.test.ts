// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { catalogStamps } from '../canvas/test-fakes';
import { deletePoint, movePoint } from './edit';
import { featureHit } from './hit';
import { planDocuments } from './plan';
import { behaviourOf, makeStamp, parseStamp, stampCorners, stampPoint, withStampFrame, withStampVariant } from './stamp';

const [lamp, crate] = catalogStamps([
    {
        id: 'lamp',
        name: 'Lamp',
        category: 'Lighting',
        scale: 'interior',
        perspective: 'top-down',
        light: { dim: 4, bright: 2 },
        variants: [
            { state: 'lit', image: 'stamps/lit.png', width: 100, height: 200 },
            { state: 'unlit', image: 'stamps/unlit.png', width: 50, height: 50, light: null },
        ],
    },
    {
        id: 'crate',
        name: 'Crate',
        category: 'Storage',
        scale: 'interior',
        perspective: 'top-down',
        container: true,
        variants: [{ state: 'shut', image: 'c.png', width: 100, height: 100 }],
    },
]);

function stampOf(stamp: typeof lamp, placement: Partial<Parameters<typeof makeStamp>[2]> = {}): ReturnType<typeof makeStamp> {
    if (!stamp) {
        throw new Error('missing fixture');
    }
    return makeStamp('s1', stamp, { stamp: stamp.key, x: 500, y: 500, ...placement }, 50);
}

describe('makeStamp', () => {
    it('scales the footprint to the scene grid and centres it on the point', () => {
        const s = stampOf(lamp);
        expect(s).toMatchObject({ type: 'stamp', stamp: 'pack:lamp', variant: 0, src: 'modules/pack/stamps/lit.png', width: 50, height: 100 });
        expect(s.points).toEqual([{ x: 500, y: 500 }]);
    });

    it('snaps, scales, rotates and elevates as requested', () => {
        const s = stampOf(lamp, { x: 510, y: 530, scale: 2, rotation: 90, elevation: 10, snap: true });
        expect(s.width).toBe(100);
        expect(s.height).toBe(200);
        // top-left (460, 430) snaps to (450, 450) → centre (500, 550)
        expect(s.points).toEqual([{ x: 500, y: 550 }]);
        expect(s.rotation).toBe(90);
        expect(s.elevation).toBe(10);
    });

    it('snapshots the behaviour of the chosen variant', () => {
        expect(stampOf(lamp).behaviour.light).toEqual({ dim: 4, bright: 2 });
        expect(stampOf(lamp, { variant: 1 }).behaviour.light).toBeNull();
        expect(crate ? behaviourOf(crate, 0).container : null).toBe(true);
    });
});

describe('variants and frames', () => {
    it('changes variant keeping centre, rotation and elevation', () => {
        const s = stampOf(lamp, { rotation: 45, elevation: 3 });
        const next = lamp ? withStampVariant({ ...s, docs: { walls: [], lights: [], tiles: ['t0'], regions: [] } }, lamp, 1, 50) : null;
        expect(next).toMatchObject({ variant: 1, src: 'modules/pack/stamps/unlit.png', width: 25, height: 25, rotation: 45, elevation: 3 });
        expect(next?.points).toEqual(s.points);
        expect(next?.behaviour.light).toBeNull();
        expect(next?.docs.tiles).toEqual(['t0']);
    });

    it('adopts a new frame', () => {
        const moved = withStampFrame(stampOf(lamp), { centre: { x: 1, y: 2 }, width: 3, height: 4, rotation: 5 });
        expect(moved).toMatchObject({ points: [{ x: 1, y: 2 }], width: 3, height: 4, rotation: 5 });
    });

    it('rotates the footprint corners about the centre', () => {
        const corners = stampCorners({ ...stampOf(lamp), rotation: 90 }).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
        expect(corners).toEqual([
            { x: 550, y: 475 },
            { x: 550, y: 525 },
            { x: 450, y: 525 },
            { x: 450, y: 475 },
        ]);
    });
});

describe('stamp editing and hits', () => {
    it('moves as a whole by its centre and cannot lose its only point', () => {
        const s = stampOf(lamp);
        expect(movePoint(s, 0, { x: 7, y: 8 })?.points).toEqual([{ x: 7, y: 8 }]);
        expect(deletePoint(s, 0)).toBeNull();
    });

    it('hits inside the rotated footprint only', () => {
        const s = { ...stampOf(lamp), rotation: 90 };
        expect(featureHit(s, { x: 540, y: 500 })).toBe(true);
        expect(featureHit(s, { x: 500, y: 540 })).toBe(false);
    });
});

describe('planDocuments for a stamp', () => {
    it('plans its tile from the unrotated top-left, owned by the feature', () => {
        const plan = planDocuments({ ...stampOf(lamp), rotation: 30, elevation: 2 });
        expect(plan.tiles).toEqual([
            { src: 'modules/pack/stamps/lit.png', x: 475, y: 450, width: 50, height: 100, rotation: 30, elevation: 2, level: null, featureId: 's1' },
        ]);
    });
});

describe('planDocuments for a lit stamp', () => {
    it('emits the variant light at the centre, radii in px, following elevation', () => {
        const plan = planDocuments({ ...stampOf(lamp), elevation: 4 });
        expect(plan.lights).toEqual([{ x: 500, y: 500, dim: 200, bright: 100, elevation: 4, level: null }]);
    });

    it('emits nothing for an unlit variant', () => {
        expect(planDocuments(stampOf(lamp, { variant: 1 })).lights).toEqual([]);
    });

    it('places an offset cone with the stamp rotated, styled as authored', () => {
        const s = {
            ...stampOf(lamp, { rotation: 90 }),
            behaviour: {
                ...stampOf(lamp).behaviour,
                light: { dim: 2, bright: 1, color: '#ff0000', alpha: 0.5, angle: 60, offset: { x: 1, y: 0.5 }, animation: { type: 'torch' } },
            },
        };
        const [light] = planDocuments(s).lights;
        // Offset to the right edge (+25 px); rotated 90° clockwise → straight down.
        expect(light?.x).toBeCloseTo(500);
        expect(light?.y).toBeCloseTo(525);
        expect(light).toMatchObject({ dim: 100, bright: 50, color: '#ff0000', alpha: 0.5, angle: 60, rotation: 90, animation: { type: 'torch' } });
    });
});

describe('stampPoint', () => {
    it('maps footprint fractions to world points', () => {
        expect(stampPoint(stampOf(lamp), { x: 0, y: 0 })).toEqual({ x: 475, y: 450 });
        expect(stampPoint(stampOf(lamp), { x: 0.5, y: 0.5 })).toEqual({ x: 500, y: 500 });
    });
});

describe('parseStamp', () => {
    it('defaults the grid size of a stamp persisted without one', () => {
        const { gridSize: _omitted, ...legacy } = stampOf(lamp);
        expect(parseStamp(legacy)?.gridSize).toBe(100);
    });

    it('round-trips a placed stamp through JSON', () => {
        const s = stampOf(lamp, { rotation: 15 });
        expect(parseStamp(JSON.parse(JSON.stringify(s)))).toEqual(s);
    });

    it('keeps a stamp with an unreadable behaviour, but inert', () => {
        const parsed = parseStamp({ ...stampOf(lamp), behaviour: { light: 'bright' } });
        expect(parsed?.behaviour.light).toBeNull();
        expect(parsed?.behaviour.container).toBe(false);
    });

    it('rejects entries without identity, image or footprint', () => {
        const s = stampOf(lamp);
        expect(parseStamp({ ...s, src: 3 })).toBeNull();
        expect(parseStamp({ ...s, width: 0 })).toBeNull();
        expect(parseStamp({ ...s, points: [] })).toBeNull();
        expect(parseStamp({ ...s, type: 'room' })).toBeNull();
    });
});
