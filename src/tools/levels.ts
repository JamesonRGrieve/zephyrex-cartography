// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Levels: a scene's vertical floors, each an elevation band in scene distance
 * units. Every feature sits on one level (or on none: shown on every level,
 * the single-floor default). Generated documents take their level's band, and
 * transition stamps (stairs, ladders, lifts, hatches) connect adjacent levels.
 * The levels are the scene's native Level documents. Pure and unit-tested.
 */

export interface Level {
    readonly id: string;
    readonly name: string;
    /** Elevation band, bottom inclusive, top exclusive (scene distance units). */
    readonly bottom: number;
    readonly top: number;
}

/** Height given to a newly added level, in scene distance units; editable afterwards. */
export const DEFAULT_LEVEL_HEIGHT = 10;

/** Levels ordered bottom to top. */
export function sortLevels(levels: readonly Level[]): Level[] {
    return [...levels].sort((a, b) => a.bottom - b.bottom);
}

export function findLevel(levels: readonly Level[], id: string | null): Level | null {
    return id === null ? null : levels.find((level) => level.id === id) ?? null;
}

/** The level `steps` above (+) or below (−) `id` in bottom-to-top order, or null past either end. */
export function adjacentLevel(levels: readonly Level[], id: string, steps: number): Level | null {
    const ordered = sortLevels(levels);
    const index = ordered.findIndex((level) => level.id === id);
    return index < 0 ? null : ordered[index + steps] ?? null;
}

/** Elevation at which a document on `level` sits: its band's bottom, or 0 on no level. */
export function levelElevation(levels: readonly Level[], id: string | null): number {
    return findLevel(levels, id)?.bottom ?? 0;
}

/** Band for a new level stacked directly above (or below) the existing ones. */
export function nextLevelBand(levels: readonly Level[], position: 'above' | 'below', height = DEFAULT_LEVEL_HEIGHT): { bottom: number; top: number } {
    const ordered = sortLevels(levels);
    if (position === 'above') {
        const base = ordered[ordered.length - 1]?.top ?? 0;
        return { bottom: base, top: base + height };
    }
    const ceiling = ordered[0]?.bottom ?? 0;
    return { bottom: ceiling - height, top: ceiling };
}

/** Is a feature on `featureLevel` shown while editing `active`? Level-less features show on every level. */
export function onLevel(featureLevel: string | null, active: string | null): boolean {
    return featureLevel === null || active === null || featureLevel === active;
}

export interface LevelRow {
    readonly level: Level;
    readonly active: boolean;
    /** Features on this level. */
    readonly count: number;
    /** A level can be removed only when nothing sits on it. */
    readonly removable: boolean;
}

export interface LevelPanel {
    /** Top to bottom, as a building's floors read. */
    readonly rows: readonly LevelRow[];
    /** Editing every level at once (no level active). */
    readonly allActive: boolean;
}

/** The level panel's view: rows top to bottom with the active one marked. */
export function levelPanel(levels: readonly Level[], active: string | null, counts: Readonly<Record<string, number>>): LevelPanel {
    const rows = sortLevels(levels)
        .reverse()
        .map((level) => {
            const count = counts[level.id] ?? 0;
            return { level, active: level.id === active, count, removable: count === 0 };
        });
    return { rows, allActive: active === null };
}
