// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The declarative core of document generation. `planDocuments` states which
 * native documents a feature should have, as pure data. The controller
 * realises that plan through the document sink and records the ids it gets
 * back on the feature. Nothing that creates a document decides anything, so a
 * feature is fully described by the feature itself plus its scene context
 * (the other features and the levels): the declarative-first rule.
 */
import { RIBBON_SAMPLES } from '../geometry/ribbon';
import { catmullRom, type Point } from '../geometry/spline';
import { cutSegment, perimeterSegments, splitSegment } from '../geometry/wall';
import type { StampLight } from '../stamps/schema';
import { BLOCKS_ALL, type LightDoc, type RegionDoc, type SenseBlock, type TileDoc, type WallDoc, wallDocFromSpec } from './documents';
import { doorOpenings, OPENING_TOLERANCE, stampDoorState } from './doors';
import type { Feature } from './feature';
import { adjacentLevel, findLevel, levelElevation, type Level } from './levels';
import type { CartographyPath } from './path';
import { roomLight, roomWalls, type RoomFeature } from './room';
import { stampCentre, stampCorners, stampDoorAxis, stampPoint, type StampFeature } from './stamp';

export interface DocumentPlan {
    readonly walls: readonly WallDoc[];
    readonly lights: readonly LightDoc[];
    readonly tiles: readonly TileDoc[];
    readonly regions: readonly RegionDoc[];
}

const EMPTY_PLAN: DocumentPlan = { walls: [], lights: [], tiles: [], regions: [] };

/** What a feature's plan may depend on besides the feature itself. */
export interface PlanContext {
    readonly features: readonly Feature[];
    readonly levels: readonly Level[];
}

const NO_CONTEXT: PlanContext = { features: [], levels: [] };

/** Where a feature's documents go: its level, and that level's floor elevation. */
interface Floor {
    readonly level: string | null;
    readonly elevation: number;
}

function floorOf(feature: Feature, context: PlanContext): Floor {
    return { level: feature.level, elevation: levelElevation(context.levels, feature.level) };
}

/** Plain walls along a path's smoothed centerline. */
function pathWalls(path: CartographyPath, floor: Floor): WallDoc[] {
    const spine = catmullRom(path.points, RIBBON_SAMPLES);
    const walls: WallDoc[] = [];
    for (let i = 1; i < spine.length; i++) {
        const a = spine[i - 1];
        const b = spine[i];
        if (a && b) {
            walls.push({ a, b, door: 'none', doorState: 'closed', blocks: BLOCKS_ALL, level: floor.level });
        }
    }
    return walls;
}

/** A stamp's own tile: Foundry positions a tile by its unrotated top-left and rotates it about its centre. */
function stampTile(stamp: StampFeature, floor: Floor): TileDoc {
    const c = stampCentre(stamp);
    return {
        src: stamp.src,
        x: c.x - stamp.width / 2,
        y: c.y - stamp.height / 2,
        width: stamp.width,
        height: stamp.height,
        rotation: stamp.rotation,
        elevation: floor.elevation + stamp.elevation,
        level: floor.level,
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
function stampLight(stamp: StampFeature, floor: Floor): LightDoc | null {
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
        elevation: floor.elevation + stamp.elevation,
        level: floor.level,
    };
}

/**
 * Walls wrapping the stamp per its occlusion: its rotated footprint (`bounds`),
 * or its traced silhouette (`alpha`, falling back to the footprint when the
 * image could not be traced). Walls that block nothing are not created.
 */
function stampWalls(stamp: StampFeature, floor: Floor): WallDoc[] {
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
        perimeterSegments(loop).map((s) => ({ a: s.a, b: s.b, door: 'none' as const, doorState: 'closed' as const, blocks, level: floor.level })),
    );
}

/** A door stamp's own door wall, along its axis, in the state its variant shows. */
function stampDoorWall(stamp: StampFeature, floor: Floor): WallDoc | null {
    const door = stamp.behaviour.door;
    if (!door) {
        return null;
    }
    const axis = stampDoorAxis(stamp);
    return { a: axis.a, b: axis.b, door: door.type, doorState: stampDoorState(stamp), blocks: BLOCKS_ALL, level: floor.level };
}

/**
 * A transition stamp's teleport regions: one on its own level over its
 * footprint, and one per connected level (the one above for `up`, below for
 * `down`, both for `both`) at the same footprint. Its own region teleports to
 * every connected end, offering a choice when there are two, and each end
 * teleports back. With no connected level (none above/below, or the stamp is
 * on no level), nothing is planned.
 */
function transitionRegions(stamp: StampFeature, levels: readonly Level[]): RegionDoc[] {
    const transition = stamp.behaviour.transition;
    const here = findLevel(levels, stamp.level);
    if (!transition || !here) {
        return [];
    }
    const ends = [
        transition.direction === 'down' ? null : adjacentLevel(levels, here.id, 1),
        transition.direction === 'up' ? null : adjacentLevel(levels, here.id, -1),
    ].filter((level): level is Level => level !== null);
    if (ends.length === 0) {
        return [];
    }
    const polygon = stampCorners(stamp);
    const start: RegionDoc = {
        id: null,
        label: { kind: transition.kind, from: here.name, to: ends.map((end) => end.name) },
        polygon,
        bottom: here.bottom,
        top: here.top,
        level: here.id,
        teleport: { targets: ends.map((_, i) => ({ plan: i + 1 })) },
    };
    return [
        start,
        ...ends.map(
            (end): RegionDoc => ({
                id: null,
                label: { kind: transition.kind, from: end.name, to: [here.name] },
                polygon,
                bottom: end.bottom,
                top: end.top,
                level: end.id,
                teleport: { targets: [{ plan: 0 }] },
            }),
        ),
    ];
}

/** A linked stamp's entrance: over its footprint on its own level, teleporting to the interior's exit. */
function entranceRegion(stamp: StampFeature, levels: readonly Level[]): RegionDoc | null {
    const link = stamp.submap;
    if (!link) {
        return null;
    }
    const band = findLevel(levels, stamp.level);
    return {
        id: link.entryRegion,
        label: { kind: 'entrance', scene: link.sceneName },
        polygon: stampCorners(stamp),
        bottom: band?.bottom ?? null,
        top: band?.top ?? null,
        level: stamp.level,
        teleport: { targets: [{ scene: link.scene, region: link.exitRegion }] },
    };
}

function stampPlan(stamp: StampFeature, context: PlanContext): DocumentPlan {
    const floor = floorOf(stamp, context);
    const light = stampLight(stamp, floor);
    const door = stampDoorWall(stamp, floor);
    return {
        walls: [...(door ? [door] : []), ...stampWalls(stamp, floor)],
        tiles: [stampTile(stamp, floor)],
        lights: light ? [light] : [],
        regions: [...transitionRegions(stamp, context.levels), ...[entranceRegion(stamp, context.levels)].filter((r): r is RegionDoc => r !== null)],
    };
}

/**
 * A room's perimeter walls, sharing edges with its neighbours on the same floor
 * without doubling them:
 * - door-stamp openings are cut out (the stamps supply those door walls);
 * - a stretch shared with an earlier room is cut out, because the earlier room
 *   owns it;
 * - a stretch this room owns is a door if either room marks it as one.
 */
function roomPlan(room: RoomFeature, context: PlanContext): DocumentPlan {
    const floor = floorOf(room, context);
    const light = roomLight(room);
    const sameFloor = context.features.filter((f) => f.level === room.level && f.id !== room.id);
    const order = new Map(context.features.map((f, i) => [f.id, i]));
    const here = order.get(room.id) ?? Number.POSITIVE_INFINITY;
    const rooms = sameFloor.filter((f): f is RoomFeature => f.type === 'room');
    const owned = rooms.filter((r) => (order.get(r.id) ?? 0) < here).flatMap((r) => perimeterSegments(r.points));
    const laterDoors = rooms.filter((r) => (order.get(r.id) ?? 0) > here).flatMap((r) => roomWalls(r).filter((w) => w.door));
    const cuts = [...doorOpenings(sameFloor), ...owned];
    return {
        walls: roomWalls(room).flatMap((spec) =>
            cutSegment(spec, cuts, OPENING_TOLERANCE).flatMap((piece) =>
                splitSegment(piece, laterDoors, OPENING_TOLERANCE).map((part) =>
                    wallDocFromSpec({ a: part.a, b: part.b, door: spec.door || part.covered }, floor.level),
                ),
            ),
        ),
        lights: light.dim > 0 ? [{ ...light, elevation: floor.elevation, level: floor.level }] : [],
        tiles: [],
        regions: [],
    };
}

/** The native documents `feature` should have, in its scene `context`. */
export function planDocuments(feature: Feature, context: PlanContext = NO_CONTEXT): DocumentPlan {
    if (feature.type === 'room') {
        return roomPlan(feature, context);
    }
    if (feature.type === 'stamp') {
        return stampPlan(feature, context);
    }
    if (feature.type === 'path' && feature.walls) {
        return { ...EMPTY_PLAN, walls: pathWalls(feature, floorOf(feature, context)) };
    }
    return EMPTY_PLAN;
}
