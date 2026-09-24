// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A stamp's particle emitters (smoke, embers, sparks, dripping water) in
 * scene terms, ready for Foundry's native `ParticleGenerator` in effect mode.
 * Particles are drawn on each client, not stored as documents, so this is
 * pure planning: where each emitter spawns, how fast its particles move, at
 * what elevation and on which level. Grid units become scene px (by the
 * stamp's grid size) and distance units (by the scene's grid distance), and
 * the stamp's rotation turns both the spawn point and the direction of flight.
 * Pure and unit-tested; the Foundry boundary runs the generators.
 */
import type { Point } from '../geometry/spline';
import type { StampParticleEmitter } from '../stamps/schema';
import { levelElevation, type Level } from './levels';
import { stampCorners, stampPoint, type StampFeature } from './stamp';

/** A number, or a `[min, max]` range to pick from, as the pack gives it and Foundry takes it. */
export type ParticleRange = number | readonly [number, number];

/** Where particles spawn, in scene px: around a point, or anywhere in a rectangle. */
type EmitterArea =
    | { readonly x: number; readonly y: number; readonly radius: number }
    | { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export interface EmitterSpec {
    /** Unique across the scene: the stamp's id and the emitter's index. */
    readonly key: string;
    readonly textures: readonly string[];
    readonly area: EmitterArea;
    readonly count: number;
    readonly lifetime: ParticleRange;
    /** Scene px per second, and degrees clockwise from east; null: particles stay where they spawn. */
    readonly velocity: { readonly speed: ParticleRange; readonly angle: ParticleRange } | null;
    readonly alpha: ParticleRange;
    readonly scale: ParticleRange;
    readonly rotationSpeed: ParticleRange;
    readonly fade: { readonly in: number; readonly out: number };
    readonly blend: NonNullable<StampParticleEmitter['blend']>;
    /** Scene distance units. */
    readonly elevation: number;
    /** The level the stamp stands on, or null for every level. */
    readonly level: string | null;
}

function scaleRange(range: ParticleRange, factor: number): ParticleRange {
    return typeof range === 'number' ? range * factor : [range[0] * factor, range[1] * factor];
}

function shiftRange(range: ParticleRange, by: number): ParticleRange {
    return typeof range === 'number' ? range + by : [range[0] + by, range[1] + by];
}

/** The axis-aligned box around the stamp's rotated footprint. */
function footprintBox(stamp: StampFeature): EmitterArea {
    const corners: Point[] = stampCorners(stamp);
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function emitterArea(stamp: StampFeature, area: StampParticleEmitter['area']): EmitterArea {
    if (area === 'footprint') {
        return footprintBox(stamp);
    }
    return { ...stampPoint(stamp, area), radius: area.radius * stamp.gridSize };
}

/**
 * The emitters of `stamp`'s current variant, in scene terms. `gridDistance`
 * turns an emitter's elevation (grid units) into distance units; with no
 * grid (0) it counts for nothing.
 */
export function stampEmitters(stamp: StampFeature, levels: readonly Level[], gridDistance: number): EmitterSpec[] {
    const base = levelElevation(levels, stamp.level) + stamp.elevation;
    return (stamp.behaviour.particles ?? []).map((emitter, i) => ({
        key: `${stamp.id}:${String(i)}`,
        textures: emitter.textures,
        area: emitterArea(stamp, emitter.area),
        count: emitter.count,
        lifetime: emitter.lifetime,
        velocity: emitter.velocity
            ? { speed: scaleRange(emitter.velocity.speed, stamp.gridSize), angle: shiftRange(emitter.velocity.angle, stamp.rotation) }
            : null,
        alpha: emitter.alpha ?? 1,
        scale: emitter.scale ?? 1,
        rotationSpeed: emitter.rotationSpeed ?? 0,
        fade: { in: emitter.fade?.in ?? 0, out: emitter.fade?.out ?? 0 },
        blend: emitter.blend ?? 'normal',
        elevation: base + (emitter.elevation ?? 0) * gridDistance,
        level: stamp.level,
    }));
}

/** Whether an emitter shows on the viewed level: its own, or any level when it stands on none (or none is viewed). */
export function emitterShown(spec: EmitterSpec, viewedLevel: string | null): boolean {
    return spec.level === null || viewedLevel === null || spec.level === viewedLevel;
}
