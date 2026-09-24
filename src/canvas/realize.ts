// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Realise a scene spec: build every feature it describes through the
 * controller's public API, exactly as the GM's tools would, so a generated
 * map is ordinary, editable features and documents. The whole spec is one
 * undo step. Anything that cannot be built (a stamp from a pack that is not
 * loaded, an interior that cannot be linked) is reported, not thrown.
 */
import type { FeatureSpec, SceneSpec } from '../generate/spec';
import type { Point } from '../geometry/spline';
import { type Affected, type AreaEffect, storedEffects } from '../tools/area-effects';
import { parseCssHex } from '../tools/colour';
import type { Feature } from '../tools/feature';
import { makeLabel } from '../tools/label';
import type { LevelArt } from '../tools/levels';
import { DEFAULT_HALF_WIDTH, LIQUID_LOOKS, makePath } from '../tools/path';
import { makePin, withPinSettings } from '../tools/pin';
import { makeRegion } from '../tools/region';
import { DEFAULT_FLOOR, makeRoom, withRoomDoor } from '../tools/room';
import type { StampPlacement } from '../tools/stamp';
import { DEFAULT_BRUSH_RADIUS, makeStroke } from '../tools/stroke';
import type { SwitchTarget } from '../tools/switch-targets';
import { type Costed, storedCost } from '../tools/terrain-cost';
import { DEFAULT_WALL_PRESET } from '../tools/wall-presets';
import type { CartographyController } from './controller';

export interface RealizeOptions {
    /** Scene point the spec's (0, 0) lands on. */
    readonly origin: Point;
    /** Scene px per grid square, for specs in grid units. */
    readonly gridSize: number;
}

/** What could not be built; `splat` is indexed in the spec's splats, the rest in its features. */
type RealizeProblem = 'level' | 'stamp' | 'interior' | 'switch' | 'splat';

export interface RealizeReport {
    /** Ids of the features built, in spec order. */
    readonly features: readonly string[];
    /** Spec level key → the scene level created for it. */
    readonly levels: Readonly<Record<string, string>>;
    /** Spec features that could not be built in full, by index. */
    readonly problems: readonly { readonly index: number; readonly problem: RealizeProblem }[];
}

/** A spec's coordinate and length transforms into scene px. */
interface Scale {
    readonly point: (p: Point) => Point;
    readonly length: (v: number) => number;
}

function scaleOf(spec: SceneSpec, options: RealizeOptions): Scale {
    const unit = spec.units === 'grid' ? options.gridSize : 1;
    return {
        point: (p) => ({ x: options.origin.x + p.x * unit, y: options.origin.y + p.y * unit }),
        length: (v) => v * unit,
    };
}

/** The plain (non-stamp) feature a spec describes, on `level`, or null if it is malformed. */
function buildFeature(spec: Exclude<FeatureSpec, { type: 'stamp' }>, id: string, level: string | null, scale: Scale): Feature | null {
    if (spec.type === 'label') {
        const { text, fontSize, colour, fontFamily, rotation, hidden } = spec;
        return { ...makeLabel(id, scale.point(spec), { text, fontSize, colour: colour.toLowerCase(), fontFamily, rotation, hidden }), level };
    }
    if (spec.type === 'pin') {
        // A page with no entry is dropped, as the panel drops it.
        const settings = { text: spec.text, entry: spec.entry, page: spec.page, icon: spec.icon, global: spec.global };
        return { ...withPinSettings(makePin(id, scale.point(spec)), settings), level };
    }
    const points = spec.points.map(scale.point);
    let feature: Feature | null;
    if (spec.type === 'region') {
        const region = makeRegion(id, spec.biome, points);
        feature = region && { ...region, ...areaOf(spec) };
    } else if (spec.type === 'stroke') {
        const stroke = makeStroke(id, spec.biome, points, spec.radius === undefined ? DEFAULT_BRUSH_RADIUS : scale.length(spec.radius));
        feature = stroke && { ...stroke, ...areaOf(spec) };
    } else if (spec.type === 'path') {
        const base = LIQUID_LOOKS[spec.liquid ?? 'water'];
        const river = {
            ...base,
            shade: (spec.shade === undefined ? null : parseCssHex(spec.shade)) ?? base.shade,
            bed: spec.bed === undefined ? base.bed : spec.bed,
        };
        const walls = spec.walls === true ? DEFAULT_WALL_PRESET : spec.walls === false ? null : spec.walls;
        feature = makePath(id, spec.kind, points, spec.halfWidth === undefined ? DEFAULT_HALF_WIDTH : scale.length(spec.halfWidth), walls, river);
    } else {
        const room = makeRoom(id, spec.floor ?? DEFAULT_FLOOR, points, spec.wall, spec.wallKind, spec.ceiling);
        const doored =
            room && spec.doors.reduce((r, d) => withRoomDoor(r, d.segment, { type: d.type, state: d.state, sound: d.sound, animation: d.animation }), room);
        feature = doored && { ...doored, ...areaOf(spec) };
    }
    return feature && { ...feature, level };
}

/** What a spec area costs to cross and the effects on it, as a feature stores them. */
function areaOf(spec: { readonly movementCost: number; readonly effects: readonly AreaEffect[] }): Costed & Affected {
    return { movementCost: storedCost(spec.movementCost), effects: storedEffects(spec.effects) };
}

function placement(spec: Extract<FeatureSpec, { type: 'stamp' }>, scale: Scale): StampPlacement {
    const centre = scale.point(spec);
    return {
        stamp: spec.stamp,
        x: centre.x,
        y: centre.y,
        ...(spec.variant === undefined ? {} : { variant: spec.variant }),
        ...(spec.rotation === undefined ? {} : { rotation: spec.rotation }),
        ...(spec.scale === undefined ? {} : { scale: spec.scale }),
    };
}

/** How Foundry draws a spec level; the levels it sees are named by key (a level that could not be created is left out). */
function levelArt(l: SceneSpec['levels'][number], ids: Readonly<Record<string, string>>): LevelArt {
    return {
        background: l.background ?? null,
        foreground: l.foreground ?? null,
        fog: l.fog ?? null,
        backgroundColor: l.backgroundColor,
        tints: l.tints,
        alphaThresholds: l.alphaThresholds,
        placement: l.placement,
        visibleLevels: l.visibleLevels.flatMap((key) => ids[key] ?? []),
    };
}

/**
 * Link switch stamp `switchId` to what its spec entry controls: the features
 * it names by key and the AmbientLights it names by id, each once. True when
 * all of it was linked; false when it is not a switch, a target was not built,
 * or a feature target is not a lamp or a room.
 */
async function linkSwitch(
    controller: CartographyController,
    switchId: string,
    f: Extract<FeatureSpec, { type: 'stamp' }>,
    keyed: Readonly<Record<string, string>>,
): Promise<boolean> {
    const features = [...new Set(f.controls)].map((key) => keyed[key]);
    if (features.includes(undefined)) {
        return false;
    }
    const targets: SwitchTarget[] = [
        ...features.flatMap((id): SwitchTarget[] => (id === undefined ? [] : [{ kind: 'feature', id }])),
        ...[...new Set(f.lights)].map((id): SwitchTarget => ({ kind: 'light', id })),
    ];
    return targets.reduce<Promise<boolean>>(
        async (previous, target) => (await previous) && controller.toggleSwitchTarget(switchId, target),
        Promise.resolve(true),
    );
}

export async function realizeSpec(controller: CartographyController, spec: SceneSpec, options: RealizeOptions): Promise<RealizeReport> {
    const scale = scaleOf(spec, options);
    const levels: Record<string, string> = {};
    const features: string[] = [];
    /** Spec feature key → the feature built for it. */
    const keyed: Record<string, string> = {};
    /** Spec feature index → the feature built for it. */
    const builtAt: Record<number, string> = {};
    const problems: { index: number; problem: RealizeProblem }[] = [];
    const editing = controller.activeLevel;

    if (spec.scene) {
        await controller.setSceneSettings(spec.scene);
    }
    await controller.batch(async () => {
        await spec.levels.reduce(async (previous, l) => {
            await previous;
            const id = await controller.addLevel('above', l.name);
            if (id !== null) {
                levels[l.key] = id;
                if (l.bottom !== undefined && l.top !== undefined) {
                    await controller.setLevelBand(id, l.bottom, l.top);
                }
            }
        }, Promise.resolve());
        // Once every level exists, so each can name the others it sees.
        await spec.levels.reduce(async (previous, l) => {
            await previous;
            const id = levels[l.key];
            if (id !== undefined) {
                await controller.setLevelArt(id, levelArt(l, levels));
            }
        }, Promise.resolve());
        await spec.splats.reduce(async (previous, splat, index) => {
            await previous;
            const level = splat.level === undefined ? null : levels[splat.level] ?? null;
            if (!(await controller.adoptSplat(level, splat.mask, splat.roles))) {
                problems.push({ index, problem: 'splat' });
            }
        }, Promise.resolve());

        await spec.features.reduce(async (previous, f, index) => {
            await previous;
            const level = f.level === undefined ? null : levels[f.level] ?? null;
            if (f.level !== undefined && level === null) {
                problems.push({ index, problem: 'level' });
                return;
            }
            // New features land on the level being edited, so edit the one this feature names.
            controller.setActiveLevel(level);
            const built = (featureId: string): void => {
                features.push(featureId);
                builtAt[index] = featureId;
                if (f.key !== undefined) {
                    keyed[f.key] = featureId;
                }
            };
            if (f.type !== 'stamp') {
                const feature = buildFeature(f, controller.newFeatureId(), level, scale);
                if (feature) {
                    await controller.add(feature);
                    built(feature.id);
                }
                return;
            }
            const id = await controller.placeStamp(placement(f, scale));
            if (id === null) {
                problems.push({ index, problem: 'stamp' });
                return;
            }
            built(id);
            if (f.interior) {
                const linked =
                    'create' in f.interior
                        ? (await controller.createInterior(id, f.interior.create)) !== null
                        : await controller.linkSubmap(id, f.interior.scene);
                if (!linked) {
                    problems.push({ index, problem: 'interior' });
                }
            }
            if (f.floors && !(await controller.addBuildingFloors(id, f.floors))) {
                problems.push({ index, problem: 'interior' });
            }
        }, Promise.resolve());

        // Once everything is built, so a switch can control what comes after it.
        await spec.features.reduce(async (previous, f, index) => {
            await previous;
            const switchId = builtAt[index];
            const controls = f.type === 'stamp' && (f.controls.length > 0 || f.lights.length > 0);
            if (controls && switchId !== undefined && !(await linkSwitch(controller, switchId, f, keyed))) {
                problems.push({ index, problem: 'switch' });
            }
        }, Promise.resolve());
    });

    controller.setActiveLevel(editing);
    return { features, levels, problems };
}
