// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { deletePoint, movePoint } from './edit';
import type { Feature } from './feature';
import { makePath } from './path';
import { makeRegion } from './region';
import { makeRoom } from './room';
import { makeStroke } from './stroke';

function road(): Feature {
    const p = makePath(
        'p',
        'road',
        [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 20, y: 0 },
        ],
        5,
        false,
    );
    if (!p) {
        throw new Error('fixture');
    }
    return p;
}

function region(): Feature {
    const r = makeRegion('r', 'grassland', [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
    ]);
    if (!r) {
        throw new Error('fixture');
    }
    return r;
}

describe('movePoint', () => {
    it('moves a path vertex and keeps half-widths parallel', () => {
        const moved = movePoint(road(), 1, { x: 10, y: 8 });
        expect(moved?.points[1]).toEqual({ x: 10, y: 8 });
        expect(moved?.type).toBe('path');
        const hwLen = moved?.type === 'path' ? moved.halfWidths.length : -1;
        expect(hwLen).toBe(moved?.points.length);
    });

    it('moves a region vertex', () => {
        const moved = movePoint(region(), 2, { x: 12, y: 12 });
        expect(moved?.points[2]).toEqual({ x: 12, y: 12 });
    });

    it('returns null for an out-of-range index', () => {
        expect(movePoint(road(), 9, { x: 0, y: 0 })).toBeNull();
        expect(movePoint(road(), -1, { x: 0, y: 0 })).toBeNull();
    });
});

describe('deletePoint', () => {
    it('deletes a path vertex (and its half-width) when >= 2 remain', () => {
        const d = deletePoint(road(), 1);
        expect(d?.points).toHaveLength(2);
        const hwLen = d?.type === 'path' ? d.halfWidths.length : -1;
        expect(hwLen).toBe(2);
    });

    it('refuses to drop a path below two points', () => {
        const two = makePath(
            'p',
            'road',
            [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
            ],
            5,
            false,
        );
        expect(two).not.toBeNull();
        expect(deletePoint(two as Feature, 0)).toBeNull();
    });

    it('refuses to drop a region below three points', () => {
        const tri = makeRegion('r', 'sand', [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 5, y: 10 },
        ]);
        expect(tri).not.toBeNull();
        expect(deletePoint(tri as Feature, 0)).toBeNull();
    });
});

describe('editing a brush stroke', () => {
    function stroke(): Feature {
        const s = makeStroke(
            's',
            'grassland',
            [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
                { x: 20, y: 0 },
            ],
            20,
        );
        if (!s) {
            throw new Error('fixture');
        }
        return s;
    }

    it('moves a stroke vertex, preserving type and radius', () => {
        const moved = movePoint(stroke(), 1, { x: 10, y: 6 });
        expect(moved?.type).toBe('stroke');
        expect(moved?.points[1]).toEqual({ x: 10, y: 6 });
    });

    it('deletes a stroke vertex until only two remain', () => {
        const d = deletePoint(stroke(), 1);
        expect(d?.points).toHaveLength(2);
        expect(deletePoint(d as Feature, 0)).toBeNull();
    });
});

describe('editing a room', () => {
    function room(): Feature {
        const r = makeRoom('rm', 'dirt', [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
        ]);
        if (!r) {
            throw new Error('fixture');
        }
        return r;
    }

    it('moves a room vertex, preserving type and floor', () => {
        const moved = movePoint(room(), 2, { x: 120, y: 120 });
        expect(moved?.type).toBe('room');
        expect(moved?.points[2]).toEqual({ x: 120, y: 120 });
    });

    it('deletes a room vertex but refuses to drop below three', () => {
        const d = deletePoint(room(), 0);
        expect(d?.points).toHaveLength(3);
        expect(deletePoint(d as Feature, 0)).toBeNull();
    });
});
