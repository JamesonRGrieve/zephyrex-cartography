// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Submaps: an enterable stamp (a hab, a building) linked to an interior scene,
 * whether newly created or an existing one. The link fixes both regions' ids
 * up front: the entrance over the stamp in this scene, and the exit in the
 * interior. That way each side's teleport can name the other before either is
 * created, and re-syncing the entrance (the stamp moved) keeps the exit's
 * teleport valid. Pure and unit-tested.
 */
import type { Point } from '../geometry/spline';
import type { RegionDoc } from './documents';
import { isRecord } from './guards';

export interface SubmapLink {
    /** The interior scene's id. */
    readonly scene: string;
    /** The interior scene's name, for the entrance region's label. */
    readonly sceneName: string;
    /** Id of the entrance region over the stamp (this scene). */
    readonly entryRegion: string;
    /** Id of the exit region in the interior scene. */
    readonly exitRegion: string;
}

/** The interior scene's playable rectangle and grid, where its exit region goes. */
export interface SceneFrame {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly gridSize: number;
}

/** Where the interior's exit sits by default: one grid square at the centre of its scene (the GM can move it). */
export function exitSquare(frame: SceneFrame): Point[] {
    const size = frame.gridSize > 0 ? frame.gridSize : Math.min(frame.width, frame.height) / 10;
    const left = frame.x + frame.width / 2 - size / 2;
    const upper = frame.y + frame.height / 2 - size / 2;
    return [
        { x: left, y: upper },
        { x: left + size, y: upper },
        { x: left + size, y: upper + size },
        { x: left, y: upper + size },
    ];
}

/** The interior's exit region, teleporting back to the entrance in `originScene`. */
export function exitRegion(link: SubmapLink, polygon: readonly Point[], originScene: string, originName: string): RegionDoc {
    return {
        id: link.exitRegion,
        label: { kind: 'exit', scene: originName },
        polygon,
        bottom: null,
        top: null,
        level: null,
        behaviour: { kind: 'teleport', targets: [{ scene: originScene, region: link.entryRegion }] },
    };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: parses a persisted submap link from scene-flag JSON
export function parseSubmapLink(v: unknown): SubmapLink | null {
    if (!isRecord(v)) {
        return null;
    }
    const { scene, sceneName, entryRegion, exitRegion: exit } = v;
    return typeof scene === 'string' && typeof sceneName === 'string' && typeof entryRegion === 'string' && typeof exit === 'string'
        ? { scene, sceneName, entryRegion, exitRegion: exit }
        : null;
}
