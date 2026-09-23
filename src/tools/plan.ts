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
import { cutSegment, perimeterSegments } from '../geometry/wall';
import type { StampLight } from '../stamps/schema';
import { BLOCKS_ALL, type LightDoc, type SenseBlock, type TileDoc, type WallDoc, wallDocFromSpec } from './documents';
import { doorOpenings, OPENING_TOLERANCE, stampDoorState } from './doors';
import type { Feature } from './feature';
import type { CartographyPath } from './path';
import { roomLight, roomWalls, type RoomFeature } from './room';
import { stampCentre, stampCorners, stampDoorAxis, stampPoint, type StampFeature } from './stamp';

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

/**
 * Walls wrapping the stamp per its occlusion: its rotated footprint (`bounds`),
 * or its traced silhouette (`alpha`, falling back to the footprint when the
 * image could not be traced). Walls that block nothing are not created.
 */
function stampWalls(stamp: StampFeature): WallDoc[] {
    const occlusion = stamp.behaviour.occlusion;
    if (!occlusion || occlusion.shape === 'none') {
        return [];
    }
    const blocks: SenseBlock = { sight: occlusion.sight, movement: occlusion.movement, light: occlusion.light, sound: occlusion.sound };
    if (!blocks.sight && !blocks.movement && !blocks.light && !blocks.sound) {
        return [];
    }
    const loops =
        occlusion.shape === 'alpha' && stamp.silhouette ? stamp.silhouette.map((loop) => loop.map((f) => stampPoint(stamp, f))) : [stampCorners(stamp)];
    return loops.flatMap((loop) =>
        perimeterSegments(loop).map((s) => ({ a: s.a, b: s.b, door: 'none' as const, doorState: 'closed' as const, blocks, level: null })),
    );
}

/** A door stamp's own door wall, along its axis, in the state its variant shows. */
function stampDoorWall(stamp: StampFeature): WallDoc | null {
    const door = stamp.behaviour.door;
    if (!door) {
        return null;
    }
    const axis = stampDoorAxis(stamp);
    return { a: axis.a, b: axis.b, door: door.type, doorState: stampDoorState(stamp), blocks: BLOCKS_ALL, level: null };
}

function stampPlan(stamp: StampFeature): DocumentPlan {
    const light = stampLight(stamp);
    const door = stampDoorWall(stamp);
    return { walls: [...(door ? [door] : []), ...stampWalls(stamp)], tiles: [stampTile(stamp)], lights: light ? [light] : [] };
}

/** Perimeter walls with door-stamp openings cut out (the stamps supply those door walls). */
function roomPlan(room: RoomFeature, context: PlanContext): DocumentPlan {
    const light = roomLight(room);
    const openings = doorOpenings(context.features);
    return {
        walls: roomWalls(room).flatMap((spec) => cutSegment(spec, openings, OPENING_TOLERANCE).map((piece) => wallDocFromSpec({ ...piece, door: spec.door }))),
        lights: light.dim > 0 ? [{ ...light, elevation: 0, level: null }] : [],
        tiles: [],
    };
}

/** What a feature's plan may depend on besides the feature itself: the scene's other features. */
export interface PlanContext {
    readonly features: readonly Feature[];
}

const NO_CONTEXT: PlanContext = { features: [] };

/** The native documents `feature` should have, among the scene's `context.features`. */
export function planDocuments(feature: Feature, context: PlanContext = NO_CONTEXT): DocumentPlan {
    if (feature.type === 'room') {
        return roomPlan(feature, context);
    }
    if (feature.type === 'stamp') {
        return stampPlan(feature);
    }
    if (feature.type === 'path' && feature.walls) {
        return { ...EMPTY_PLAN, walls: pathWalls(feature) };
    }
    return EMPTY_PLAN;
}
