// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The declarative core of document generation. `planDocuments` states which
 * native documents a feature should have, as pure data. The controller
 * realises that plan through the document sink and records the ids it gets
 * back on the feature. Nothing that creates a document decides anything, so a
 * feature is fully described by the feature itself (the declarative-first rule).
 */
import { RIBBON_SAMPLES } from '../geometry/ribbon';
import { catmullRom, type Point } from '../geometry/spline';
import type { StampLight } from '../stamps/schema';
import { BLOCKS_ALL, type LightDoc, type TileDoc, type WallDoc, wallDocFromSpec } from './documents';
import type { Feature } from './feature';
import type { CartographyPath } from './path';
import { roomLight, roomWalls, type RoomFeature } from './room';
import { stampCentre, stampPoint, type StampFeature } from './stamp';

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

/** A stamp's own tile: Foundry positions a tile by its unrotated top-left and rotates it about its centre. */
function stampTile(stamp: StampFeature): TileDoc {
    const c = stampCentre(stamp);
    return {
        src: stamp.src,
        x: c.x - stamp.width / 2,
        y: c.y - stamp.height / 2,
        width: stamp.width,
        height: stamp.height,
        rotation: stamp.rotation,
        elevation: stamp.elevation,
        level: null,
        featureId: stamp.id,
    };
}

/** A pack animation with its absent optional fields dropped rather than carried as undefined. */
function animationDoc(animation: NonNullable<StampLight['animation']>): NonNullable<LightDoc['animation']> {
    return {
        type: animation.type,
        ...(animation.speed === undefined ? {} : { speed: animation.speed }),
        ...(animation.intensity === undefined ? {} : { intensity: animation.intensity }),
    };
}

/** Where an unoffset light sits: the footprint centre. */
const CENTRE: Point = { x: 0.5, y: 0.5 };

/**
 * The stamp's light, if its current variant emits one. Radii go from grid units
 * to px. A cone turns with the stamp: at rotation 0 it faces Foundry's default
 * direction, and the stamp's rotation is added to that.
 */
function stampLight(stamp: StampFeature): LightDoc | null {
    const light = stamp.behaviour.light;
    if (!light) {
        return null;
    }
    const at = stampPoint(stamp, light.offset ?? CENTRE);
    return {
        x: at.x,
        y: at.y,
        dim: light.dim * stamp.gridSize,
        bright: light.bright * stamp.gridSize,
        ...(light.color === undefined ? {} : { color: light.color }),
        ...(light.alpha === undefined ? {} : { alpha: light.alpha }),
        ...(light.angle === undefined ? {} : { angle: light.angle, rotation: stamp.rotation }),
        ...(light.animation === undefined ? {} : { animation: animationDoc(light.animation) }),
        elevation: stamp.elevation,
        level: null,
    };
}

function stampPlan(stamp: StampFeature): DocumentPlan {
    const light = stampLight(stamp);
    return { ...EMPTY_PLAN, tiles: [stampTile(stamp)], lights: light ? [light] : [] };
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
    if (feature.type === 'stamp') {
        return stampPlan(feature);
    }
    if (feature.type === 'path' && feature.walls) {
        return { ...EMPTY_PLAN, walls: pathWalls(feature) };
    }
    return EMPTY_PLAN;
}
