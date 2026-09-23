// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Rooms — the structure-mapping primitive: a grid-snapped, closed floor area of
 * a single material. Rendered as a crisp-edged floor fill (walls, added in a
 * later phase, cover the boundary — so no feathering). The floor material reuses
 * the biome texture set for now; a dedicated interior floor-material set
 * (wood/stone/tile) is a follow-up. Model + defensive parser + edit constructor.
 * Pure and unit-tested.
 */
import type { Point } from '../geometry/spline';
import { isPoint, isRecord } from './path';
import { isBiomeKind, type BiomeKind } from './region';

/** Default floor material for a freshly drawn room. */
export const DEFAULT_FLOOR: BiomeKind = 'dirt';

export interface RoomFeature {
    readonly type: 'room';
    readonly id: string;
    /** Floor material (reuses the biome texture set). */
    readonly floor: BiomeKind;
    /** Grid-snapped boundary control points (>= 3). */
    readonly points: Point[];
    /** Ids of the native Foundry WallDocuments this room generated (for lifecycle sync). */
    readonly wallIds: string[];
}

/** Build a committed room from a boundary point stream, or null if fewer than 3 points. */
export function makeRoom(id: string, floor: BiomeKind, points: readonly Point[]): RoomFeature | null {
    if (points.length < 3) {
        return null;
    }
    return { type: 'room', id, floor, points: points.map((p) => ({ x: p.x, y: p.y })), wallIds: [] };
}

/** Rebuild a room with new boundary points (edit ops), preserving floor + wall links, or null if < 3. */
export function withRoomPoints(room: RoomFeature, points: readonly Point[]): RoomFeature | null {
    if (points.length < 3) {
        return null;
    }
    return { ...room, points: points.map((p) => ({ x: p.x, y: p.y })) };
}

/** Record the ids of the Foundry walls this room generated. */
export function withRoomWalls(room: RoomFeature, wallIds: readonly string[]): RoomFeature {
    return { ...room, wallIds: [...wallIds] };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: parses one untyped scene-flag entry, validating shape and returning a narrow RoomFeature or null
export function parseRoom(v: unknown): RoomFeature | null {
    if (!isRecord(v)) {
        return null;
    }
    if (v['type'] !== 'room' || typeof v['id'] !== 'string' || !isBiomeKind(v['floor'])) {
        return null;
    }
    const points = Array.isArray(v['points']) ? v['points'].filter(isPoint) : [];
    if (points.length < 3) {
        return null;
    }
    const wallIds = Array.isArray(v['wallIds']) ? v['wallIds'].filter((s): s is string => typeof s === 'string') : [];
    return { type: 'room', id: v['id'], floor: v['floor'], points: points.map((p) => ({ x: p.x, y: p.y })), wallIds };
}
