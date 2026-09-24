// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The declarative core of document generation. `planDocuments` states which
 * native documents a feature should have, as pure data. The controller
 * realises that plan through the document sink and records the ids it gets
 * back on the feature. Nothing that creates a document decides anything, so a
 * feature is fully described by the feature itself plus its scene context
 * (the other features and the levels): the declarative-first rule.
 */
import { buildRibbon, RIBBON_SAMPLES, ribbonOutline } from '../geometry/ribbon';
import { catmullRom, distanceToSegment, type Point } from '../geometry/spline';
import { cutSegment, perimeterSegments, type Segment, splitSegment } from '../geometry/wall';
import type { StampLight } from '../stamps/schema';
import {
    BLOCKS_ALL,
    type LightDoc,
    type RegionDoc,
    type SenseBlock,
    senseLevel,
    type SoundDoc,
    type TileDoc,
    type WallDoc,
    type WallThreshold,
} from './documents';
import { doorOpenings, OPENING_TOLERANCE, stampDoorState } from './doors';
import type { Feature } from './feature';
import { adjacentLevel, findLevel, levelElevation, type Level } from './levels';
import type { CartographyPath } from './path';
import { regionOutline, type RegionFeature } from './region';
import { roomDoorLook, roomLight, roomWalls, type RoomDoor, type RoomFeature } from './room';
import { stampCentre, stampCorners, stampDoorAxis, stampPoint, type StampFeature } from './stamp';
import type { StrokeFeature } from './stroke';

export interface DocumentPlan {
    readonly walls: readonly WallDoc[];
    readonly lights: readonly LightDoc[];
    readonly tiles: readonly TileDoc[];
    readonly regions: readonly RegionDoc[];
    readonly sounds: readonly SoundDoc[];
}

/** A plan with no documents. */
export const NO_PLAN: DocumentPlan = { walls: [], lights: [], tiles: [], regions: [], sounds: [] };

/** What a feature's plan may depend on besides the feature itself. */
export interface PlanContext {
    readonly features: readonly Feature[];
    readonly levels: readonly Level[];
    /** Whether terrain (biome regions and brush strokes) is mirrored as Scene Regions. */
    readonly terrainRegions: boolean;
}

const NO_CONTEXT: PlanContext = { features: [], levels: [], terrainRegions: false };

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

/** A stamp's own tile, as its unrotated top-left, rotated about its centre (the boundary anchors it for v14). */
function stampTile(stamp: StampFeature, floor: Floor): TileDoc {
    const c = stampCentre(stamp);
    return {
        name: stamp.name,
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
        source: { kind: 'stamp', name: stamp.name },
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

/** A pack threshold with its absent fields dropped rather than carried as undefined. */
function thresholdDoc(threshold: NonNullable<NonNullable<StampFeature['behaviour']['occlusion']>['threshold']>): WallThreshold {
    return {
        ...(threshold.light === undefined ? {} : { light: threshold.light }),
        ...(threshold.sight === undefined ? {} : { sight: threshold.sight }),
        ...(threshold.sound === undefined ? {} : { sound: threshold.sound }),
        ...(threshold.attenuation === undefined ? {} : { attenuation: threshold.attenuation }),
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
    const blocks: SenseBlock = {
        sight: senseLevel(occlusion.sight),
        movement: occlusion.movement,
        light: senseLevel(occlusion.light),
        sound: senseLevel(occlusion.sound),
    };
    if (blocks.sight === 'none' && !blocks.movement && blocks.light === 'none' && blocks.sound === 'none') {
        return [];
    }
    const shape = {
        ...(occlusion.direction === undefined ? {} : { direction: occlusion.direction }),
        ...(occlusion.threshold === undefined ? {} : { threshold: thresholdDoc(occlusion.threshold) }),
    };
    const loops =
        occlusion.shape === 'alpha' && stamp.silhouette ? stamp.silhouette.map((loop) => loop.map((f) => stampPoint(stamp, f))) : [stampCorners(stamp)];
    return loops.flatMap((loop) =>
        perimeterSegments(loop).map((s) => ({ a: s.a, b: s.b, door: 'none' as const, doorState: 'closed' as const, blocks, ...shape, level: floor.level })),
    );
}

/** A door stamp's own door wall, along its axis, in the state its variant shows. */
function stampDoorWall(stamp: StampFeature, floor: Floor): WallDoc | null {
    const door = stamp.behaviour.door;
    if (!door) {
        return null;
    }
    const axis = stampDoorAxis(stamp);
    const look = { sound: door.sound ?? null, animation: door.animation ?? null };
    return { a: axis.a, b: axis.b, door: door.type, doorState: stampDoorState(stamp), look, blocks: BLOCKS_ALL, level: floor.level };
}

/**
 * A transition stamp's way between floors: one native `changeLevel` region
 * over its footprint, on its own level and each level it reaches (the one
 * above for `up`, below for `down`, both for `both`), spanning their
 * elevation bands. A token entering it on any of those levels is offered the
 * others. With no level to reach (none above/below, or the stamp is on no
 * level), nothing is planned.
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
    const joined = [here, ...ends];
    return [
        {
            id: null,
            label: { kind: transition.kind, from: here.name, to: ends.map((end) => end.name) },
            polygon: stampCorners(stamp),
            bottom: Math.min(...joined.map((level) => level.bottom)),
            top: Math.max(...joined.map((level) => level.top)),
            level: here.id,
            spans: ends.map((end) => end.id),
            behaviour: { kind: 'changeLevel' },
        },
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
        spans: [],
        behaviour: { kind: 'teleport', targets: [{ scene: link.scene, region: link.exitRegion }] },
    };
}

/** The stamp's ambient sound, if its current variant emits one. The radius goes from grid units to px. */
function stampSound(stamp: StampFeature, floor: Floor): SoundDoc | null {
    const sound = stamp.behaviour.sound;
    if (sound === null || sound === undefined) {
        return null;
    }
    const at = stampPoint(stamp, sound.offset ?? CENTRE);
    return {
        name: stamp.name,
        x: at.x,
        y: at.y,
        radius: sound.radius * stamp.gridSize,
        path: sound.path,
        volume: sound.volume,
        repeat: sound.repeat,
        walls: sound.walls,
        easing: sound.easing,
        elevation: floor.elevation + stamp.elevation,
        level: floor.level,
    };
}

function stampPlan(stamp: StampFeature, context: PlanContext): DocumentPlan {
    const floor = floorOf(stamp, context);
    const light = stampLight(stamp, floor);
    const sound = stampSound(stamp, floor);
    const door = stampDoorWall(stamp, floor);
    return {
        walls: [...(door ? [door] : []), ...stampWalls(stamp, floor)],
        tiles: [stampTile(stamp, floor)],
        lights: light ? [light] : [],
        regions: [...transitionRegions(stamp, context.levels), ...[entranceRegion(stamp, context.levels)].filter((r): r is RegionDoc => r !== null)],
        sounds: sound ? [sound] : [],
    };
}

/**
 * A room's floor, when it stands on a level with another below: a solid,
 * flat surface over the room at its level's base, on both levels, so the room
 * cannot be seen, heard, lit or walked into from beneath, and hides what is
 * below from those standing in it. A room on the lowest level, or on none,
 * stands on the ground and has no floor region.
 */
function roomFloor(room: RoomFeature, levels: readonly Level[]): RegionDoc | null {
    const here = findLevel(levels, room.level);
    const below = here ? adjacentLevel(levels, here.id, -1) : null;
    if (!here || !below) {
        return null;
    }
    return {
        id: null,
        label: { kind: 'floor', level: here.name },
        polygon: room.points,
        bottom: here.bottom,
        top: here.bottom,
        level: here.id,
        spans: [below.id],
        behaviour: { kind: 'surface' },
    };
}

/** A stretch of room wall, as a door if `door` is set; tagged with the perimeter segment it comes from. */
function roomWallDoc(part: Segment, door: RoomDoor | null, segment: number, level: string | null): WallDoc {
    const wall: WallDoc = { a: part.a, b: part.b, door: door?.type ?? 'none', doorState: door?.state ?? 'closed', blocks: BLOCKS_ALL, level, segment };
    return door === null ? wall : { ...wall, look: roomDoorLook(door) };
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
    const laterDoors = rooms.filter((r) => (order.get(r.id) ?? 0) > here).flatMap((r) => roomWalls(r).filter((w) => w.door !== null));
    const cuts = [...doorOpenings(sameFloor), ...owned];
    /** The later room's door lying over a covered stretch. */
    const coveringDoor = (part: Segment): RoomDoor | null => {
        const mid = { x: (part.a.x + part.b.x) / 2, y: (part.a.y + part.b.y) / 2 };
        return laterDoors.find((w) => distanceToSegment(mid, w.a, w.b) <= OPENING_TOLERANCE)?.door ?? null;
    };
    return {
        walls: roomWalls(room).flatMap((wall) =>
            cutSegment(wall, cuts, OPENING_TOLERANCE).flatMap((piece) =>
                splitSegment(piece, laterDoors, OPENING_TOLERANCE).map((part) =>
                    roomWallDoc(part, wall.door ?? (part.covered ? coveringDoor(part) : null), wall.segment, floor.level),
                ),
            ),
        ),
        lights: light.dim > 0 ? [{ source: { kind: 'room' }, ...light, elevation: floor.elevation, level: floor.level }] : [],
        tiles: [],
        regions: [roomFloor(room, context.levels)].filter((region): region is RegionDoc => region !== null),
        sounds: [],
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
        return { ...NO_PLAN, walls: pathWalls(feature, floorOf(feature, context)) };
    }
    if ((feature.type === 'region' || feature.type === 'stroke') && context.terrainRegions) {
        return { ...NO_PLAN, regions: [terrainRegion(feature, context.levels)] };
    }
    return NO_PLAN;
}

/** Pairs of a flat `[x, y, …]` outline as points. */
function outlinePoints(flat: readonly number[]): Point[] {
    const points: Point[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
        points.push({ x: flat[i] ?? 0, y: flat[i + 1] ?? 0 });
    }
    return points;
}

/**
 * Terrain as a Scene Region over exactly what is painted (the smoothed region
 * fill, or the stroke's swath), named after its biome, on its level's band.
 * It carries no behaviours: GMs and systems attach their own (difficult
 * terrain, weather, and so on).
 */
function terrainRegion(feature: RegionFeature | StrokeFeature, levels: readonly Level[]): RegionDoc {
    const outline =
        feature.type === 'region'
            ? regionOutline(feature.points)
            : ribbonOutline(
                  buildRibbon(
                      feature.points,
                      feature.points.map(() => feature.radius),
                      RIBBON_SAMPLES,
                      false,
                  ),
              );
    const band = findLevel(levels, feature.level);
    return {
        id: null,
        label: { kind: 'terrain', biome: feature.biome },
        polygon: outlinePoints(outline),
        bottom: band?.bottom ?? null,
        top: band?.top ?? null,
        level: feature.level,
        spans: [],
        behaviour: null,
    };
}
