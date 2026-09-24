// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
    adjacentLevel,
    findLevel,
    levelElevation,
    levelHeightFor,
    levelPanel,
    nextLevelBand,
    NO_LEVEL_ART,
    onLevel,
    planningLevels,
    sortLevels,
    type Level,
} from './levels';

const levels: Level[] = [
    { id: 'upper', name: 'Upper', bottom: 10, top: 20, art: NO_LEVEL_ART },
    { id: 'cellar', name: 'Cellar', bottom: -10, top: 0, art: NO_LEVEL_ART },
    { id: 'ground', name: 'Ground', bottom: 0, top: 10, art: NO_LEVEL_ART },
];

describe('planningLevels', () => {
    it('changes with a band or a name, but not with a level’s art', () => {
        const painted = levels.map((level) => ({ ...level, art: { ...NO_LEVEL_ART, background: 'floor.webp' } }));
        expect(planningLevels(painted)).toBe(planningLevels(levels));
        expect(planningLevels(levels.map((level) => ({ ...level, name: `${level.name}!` })))).not.toBe(planningLevels(levels));
        expect(planningLevels(levels.map((level) => ({ ...level, top: level.top + 1 })))).not.toBe(planningLevels(levels));
    });
});

describe('levels', () => {
    it('sort bottom to top and are found by id', () => {
        expect(sortLevels(levels).map((l) => l.id)).toEqual(['cellar', 'ground', 'upper']);
        expect(findLevel(levels, 'ground')?.name).toBe('Ground');
        expect(findLevel(levels, 'attic')).toBeNull();
        expect(findLevel(levels, null)).toBeNull();
    });

    it('step to the neighbouring level, null past the ends', () => {
        expect(adjacentLevel(levels, 'ground', 1)?.id).toBe('upper');
        expect(adjacentLevel(levels, 'ground', -1)?.id).toBe('cellar');
        expect(adjacentLevel(levels, 'upper', 1)).toBeNull();
        expect(adjacentLevel(levels, 'attic', 1)).toBeNull();
    });

    it('give documents their floor elevation', () => {
        expect(levelElevation(levels, 'upper')).toBe(10);
        expect(levelElevation(levels, null)).toBe(0);
    });

    it('stack new bands above or below, starting from 0', () => {
        expect(nextLevelBand(levels, 'above')).toEqual({ bottom: 20, top: 30 });
        expect(nextLevelBand(levels, 'below', 5)).toEqual({ bottom: -15, top: -10 });
        expect(nextLevelBand([], 'above')).toEqual({ bottom: 0, top: 10 });
        expect(nextLevelBand([], 'below')).toEqual({ bottom: -10, top: 0 });
    });

    it('make a new level 4 grid squares tall, as Foundry v14 does', () => {
        expect(levelHeightFor(5)).toBe(20);
        expect(levelHeightFor(1.5)).toBe(6);
        // A scene without a usable grid distance falls back to the default height.
        expect(levelHeightFor(0)).toBe(10);
    });

    it('show a feature on its own level, and level-less features everywhere', () => {
        expect(onLevel('ground', 'ground')).toBe(true);
        expect(onLevel('ground', 'upper')).toBe(false);
        expect(onLevel(null, 'upper')).toBe(true);
        expect(onLevel('ground', null)).toBe(true);
    });

    it('present the panel top to bottom, only empty levels removable', () => {
        const panel = levelPanel(levels, 'ground', { ground: 2 });
        expect(panel.rows.map((r) => [r.level.id, r.active, r.count, r.removable])).toEqual([
            ['upper', false, 0, true],
            ['ground', true, 2, false],
            ['cellar', false, 0, true],
        ]);
        expect(panel.allActive).toBe(false);
        expect(levelPanel(levels, null, {}).allActive).toBe(true);
    });
});
