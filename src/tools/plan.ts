// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The declarative core of document generation. `planDocuments` states which
 * native documents a feature should have, as pure data. The controller
 * realises that plan through the document sink and records the ids it gets
 * back on the feature. Nothing that creates a document decides anything, so a
 * feature is fully described by the feature itself (the declarative-first rule).
 */
import { RIBBON_SAMPLES } from '../geometry/ribbon';
import { catmullRom } from '../geometry/spline';
import { BLOCKS_ALL, type LightDoc, type TileDoc, type WallDoc, wallDocFromSpec } from './documents';
import type { Feature } from './feature';
import type { CartographyPath } from './path';
import { roomLight, roomWalls, type RoomFeature } from './room';

export interface DocumentPlan {
    readonly walls: readonly WallDoc[];
    readonly lights: readonly LightDoc[];
    readonly tiles: readonly TileDoc[];
}

const EMPTY_PLAN: DocumentPlan = { walls: [], lights: [], tiles: [] };

/** Plain walls along a path's smoothed centerline. */
function pathWalls(path: CartographyPath): WallDoc[] {
    const spine = catmullRom(path.points, RIBBON_SAMPLES);
    const walls: WallDoc[] = [];
    for (let i = 1; i < spine.length; i++) {
        const a = spine[i - 1];
        const b = spine[i];
        if (a && b) {
            walls.push({ a, b, door: 'none', doorState: 'closed', blocks: BLOCKS_ALL, level: null });
        }
    }
    return walls;
}

function roomPlan(room: RoomFeature): DocumentPlan {
    const light = roomLight(room);
    return {
        walls: roomWalls(room).map((spec) => wallDocFromSpec(spec)),
        lights: light.dim > 0 ? [{ ...light, elevation: 0, level: null }] : [],
        tiles: [],
    };
}

/** The native documents `feature` should have. */
export function planDocuments(feature: Feature): DocumentPlan {
    if (feature.type === 'room') {
        return roomPlan(feature);
    }
    if (feature.type === 'path' && feature.walls) {
        return { ...EMPTY_PLAN, walls: pathWalls(feature) };
    }
    return EMPTY_PLAN;
}
