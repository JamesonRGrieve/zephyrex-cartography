// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { catalogStamps } from '../canvas/test-fakes';
import { pileSpec } from './containers';
import { makeStamp } from './stamp';

const [chest] = catalogStamps([
    {
        id: 'chest',
        name: 'Chest',
        category: 'Storage',
        scale: 'interior',
        perspective: 'top-down',
        container: true,
        variants: [{ state: 'shut', image: 'chest.png', width: 200, height: 100 }],
    },
]);

function placed(gridSize: number): ReturnType<typeof makeStamp> {
    if (!chest) {
        throw new Error('missing fixture');
    }
    return makeStamp('c1', chest, { stamp: chest.key, x: 500, y: 300, rotation: 90 }, gridSize);
}

describe('pileSpec', () => {
    it('covers the stamp footprint in grid squares, in its image, turn and elevation above the floor', () => {
        expect(pileSpec(placed(100), 10)).toEqual({ x: 400, y: 250, width: 2, height: 1, rotation: 90, elevation: 10, src: 'modules/pack/chest.png' });
    });

    it('treats a gridless stamp as one px per square rather than dividing by zero', () => {
        const stamp = { ...placed(100), gridSize: 0 };
        expect(pileSpec(stamp, 0)).toMatchObject({ width: 200, height: 100 });
    });

    it('falls back to the origin for a stamp with no centre point', () => {
        expect(pileSpec({ ...placed(100), points: [] }, 0)).toMatchObject({ x: -100, y: -50 });
    });
});
