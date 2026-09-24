// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Spawn areas: an area (painted ground, a room or a zone) that tokens are
 * spawned into, for encounters and reinforcements. It lists the actors to
 * spawn, each by UUID with a count, and how Foundry places them: anywhere
 * inside or at the centre, snapped to the grid or not, avoiding occupied
 * spaces or not (`RegionDocument#spawnTokens`, 14.352–14.356). The GM
 * spawns them from the effects panel or the module API. Pure and
 * unit-tested.
 */
import { isRecord } from './guards';

/** Where `spawnTokens` puts each token: anywhere inside, or at the centre. */
export const SPAWN_PLACEMENTS = ['random', 'center'] as const;

export type SpawnPlacement = (typeof SPAWN_PLACEMENTS)[number];

/** `count` tokens of the Actor with UUID `uuid`. */
export interface SpawnEntry {
    readonly uuid: string;
    readonly count: number;
}

export interface AreaSpawn {
    readonly actors: readonly SpawnEntry[];
    readonly placement: SpawnPlacement;
    readonly snap: boolean;
    readonly avoidOccupied: boolean;
}

/** Nothing to spawn, placed as `spawnTokens` places by default. */
export const NO_SPAWN: AreaSpawn = { actors: [], placement: 'random', snap: true, avoidOccupied: true };

/** The most of one actor a line spawns, so a slip of the keyboard cannot flood the scene. */
export const MAX_SPAWN_COUNT = 50;

/** What an area spawns, left out of the stored JSON while it spawns nothing and places as by default. */
export interface Spawning {
    readonly spawn?: AreaSpawn | undefined;
}

export function spawnOf(area: Spawning): AreaSpawn {
    return area.spawn ?? NO_SPAWN;
}

/** Whether `spawn` is anything but {@link NO_SPAWN}. */
export function customSpawn(spawn: AreaSpawn): boolean {
    return spawn.actors.length > 0 || spawn.placement !== NO_SPAWN.placement || spawn.snap !== NO_SPAWN.snap || spawn.avoidOccupied !== NO_SPAWN.avoidOccupied;
}

/** A spawn as stored: undefined for the default. */
export function storedSpawn(spawn: AreaSpawn): AreaSpawn | undefined {
    return customSpawn(spawn) ? spawn : undefined;
}

/** How many tokens a spawn makes. */
export function spawnCount(spawn: AreaSpawn): number {
    return spawn.actors.reduce((sum, entry) => sum + entry.count, 0);
}

/** A count from 1 to {@link MAX_SPAWN_COUNT}, or null. */
function validCount(count: number): number | null {
    return Number.isInteger(count) && count >= 1 && count <= MAX_SPAWN_COUNT ? count : null;
}

/** One typed line: a UUID, or a count then a UUID ("3 Actor.abc"); null when it is neither. */
function parseSpawnLine(line: string): SpawnEntry | null {
    const [first, second, ...rest] = line.trim().split(/\s+/u);
    if (first === undefined || first === '' || rest.length > 0) {
        return null;
    }
    if (second === undefined) {
        return { uuid: first, count: 1 };
    }
    const count = validCount(Number(first));
    return count === null ? null : { uuid: second, count };
}

/** Typed lines as spawn entries, blank lines skipped; null when any other line is not one. */
export function parseSpawnLines(typed: string): SpawnEntry[] | null {
    const entries = typed
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map(parseSpawnLine);
    return entries.every((entry): entry is SpawnEntry => entry !== null) ? entries : null;
}

/** Spawn entries as the lines they are typed as. */
export function spawnLines(actors: readonly SpawnEntry[]): string {
    return actors.map((entry) => (entry.count === 1 ? entry.uuid : `${entry.count} ${entry.uuid}`)).join('\n');
}

/** The persisted spawn of an area: each valid entry, and each option or its default; none when it is the default. */
// eslint-disable-next-line no-restricted-syntax -- boundary: narrows a persisted spawn from scene-flag JSON
export function parseAreaSpawn(v: unknown): AreaSpawn | undefined {
    if (!isRecord(v)) {
        return undefined;
    }
    const actors = (Array.isArray(v['actors']) ? v['actors'] : []).flatMap((entry) => {
        const count = isRecord(entry) && typeof entry['count'] === 'number' ? validCount(entry['count']) : null;
        return isRecord(entry) && typeof entry['uuid'] === 'string' && entry['uuid'] !== '' && count !== null ? [{ uuid: entry['uuid'], count }] : [];
    });
    return storedSpawn({
        actors,
        placement: SPAWN_PLACEMENTS.find((p) => p === v['placement']) ?? NO_SPAWN.placement,
        snap: v['snap'] !== false,
        avoidOccupied: v['avoidOccupied'] !== false,
    });
}
