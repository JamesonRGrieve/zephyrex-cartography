// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { customSpawn, MAX_SPAWN_COUNT, NO_SPAWN, parseAreaSpawn, parseSpawnLines, spawnCount, spawnLines, spawnOf, storedSpawn } from './spawn';

const AMBUSH = {
    ...NO_SPAWN,
    actors: [
        { uuid: 'Actor.cultist', count: 3 },
        { uuid: 'Actor.magus', count: 1 },
    ],
};

describe('spawn areas', () => {
    it('spawn nothing until given actors, and store only what is not the default', () => {
        expect(spawnOf({})).toEqual(NO_SPAWN);
        expect(customSpawn(NO_SPAWN)).toBe(false);
        expect(storedSpawn(NO_SPAWN)).toBeUndefined();
        for (const change of [{ actors: AMBUSH.actors }, { placement: 'center' }, { snap: false }, { avoidOccupied: false }] as const) {
            expect(storedSpawn({ ...NO_SPAWN, ...change })).toEqual({ ...NO_SPAWN, ...change });
        }
        expect(spawnCount(AMBUSH)).toBe(4);
    });

    it('read typed lines, a UUID or a count then a UUID, and refuse any other', () => {
        expect(parseSpawnLines(' 3 Actor.cultist \n\nActor.magus\n')).toEqual(AMBUSH.actors);
        expect(parseSpawnLines('')).toEqual([]);
        expect(parseSpawnLines('three Actor.cultist')).toBeNull();
        expect(parseSpawnLines(`${MAX_SPAWN_COUNT + 1} Actor.cultist`)).toBeNull();
        expect(parseSpawnLines('0 Actor.cultist')).toBeNull();
        expect(parseSpawnLines('2 Actor.a extra')).toBeNull();
        expect(spawnLines(AMBUSH.actors)).toBe('3 Actor.cultist\nActor.magus');
    });

    it('round-trip through the scene flag, dropping malformed entries and falling back to the default options', () => {
        expect(parseAreaSpawn(JSON.parse(JSON.stringify({ ...AMBUSH, placement: 'center', snap: false })))).toEqual({
            ...AMBUSH,
            placement: 'center',
            snap: false,
        });
        expect(
            parseAreaSpawn({ actors: [{ uuid: '', count: 1 }, { uuid: 'Actor.a', count: 99 }, 'x', { uuid: 'Actor.b', count: 2 }], placement: 'edge' }),
        ).toEqual({ ...NO_SPAWN, actors: [{ uuid: 'Actor.b', count: 2 }] });
        expect(parseAreaSpawn({ actors: 'none' })).toBeUndefined();
        expect(parseAreaSpawn(null)).toBeUndefined();
    });
});
