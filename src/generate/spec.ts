// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Scene spec v1: a whole map as data. Terrain, paths, rooms with their doors
 * and materials, stamps with their interiors, and the levels they stand on. A
 * generator (ours, or anything that can write JSON) emits one, and it is
 * realised through the same controller API a GM's tools use, so a generated
 * map is made of ordinary features.
 *
 * Single source of truth, like the stamp pack schema: the engine's types, its
 * runtime validation (`parseSceneSpec`) and the published JSON Schema
 * (`schema/scene-spec.v1.schema.json`, via `pnpm schema:gen`) all derive from
 * this file. Changes to v1 are additive only.
 */
import { z } from 'zod';
import { BIOMES } from '../tools/biome';
import type { DoorState } from '../tools/documents';
import type { PathKind } from '../tools/path';
import type { RoomDoorType } from '../tools/room';

export const SCENE_SPEC_SCHEMA_VERSION = 1;

export const SCENE_SPEC_SCHEMA_URL = 'https://raw.githubusercontent.com/JamesonRGrieve/zephyrex-cartography/main/schema/scene-spec.v1.schema.json';

const PATH_KINDS = ['road', 'river'] as const satisfies readonly PathKind[];
const DOOR_TYPES = ['door', 'secret'] as const satisfies readonly RoomDoorType[];
const DOOR_STATES = ['closed', 'open', 'locked'] as const satisfies readonly DoorState[];

const text = z.string().min(1);
const point = z.object({ x: z.number(), y: z.number() }).strict();
const positive = z.number().positive();
const biome = z.enum(BIOMES);
const level = text.optional().describe('Key of an entry in `levels`. Omitted: the feature shows on every level.');

const regionSpec = z
    .object({ type: z.literal('region'), biome, points: z.array(point).min(3).describe('Boundary control points.'), level })
    .strict()
    .describe('A closed, smoothed area of one biome.');

const strokeSpec = z
    .object({
        type: z.literal('stroke'),
        biome,
        points: z.array(point).min(2).describe('Centerline.'),
        radius: positive.optional().describe('Half-width of the swath (default: the brush default).'),
        level,
    })
    .strict()
    .describe('A painted biome swath along a centerline.');

const pathSpec = z
    .object({
        type: z.literal('path'),
        kind: z.enum(PATH_KINDS),
        points: z.array(point).min(2).describe('Centerline control points.'),
        halfWidth: positive.optional().describe('Half-width at every point (default: the path default).'),
        walls: z.boolean().default(false).describe('Also emit walls along the centerline.'),
        level,
    })
    .strict()
    .describe('A road or river.');

const doorSpec = z
    .object({
        segment: z.number().int().min(0).describe('Perimeter segment index: segment i runs from point i to point i + 1 (the last closes the loop).'),
        type: z.enum(DOOR_TYPES).default('door'),
        state: z.enum(DOOR_STATES).default('closed'),
    })
    .strict();

const roomSpec = z
    .object({
        type: z.literal('room'),
        points: z.array(point).min(3).describe('Boundary. Split an edge with a collinear point to put a door on part of it.'),
        floor: z
            .union([biome, z.string().regex(/^floor\..+/)])
            .optional()
            .describe('A biome or a pack "floor.<name>" material (default: the room default).'),
        wall: z
            .string()
            .regex(/^wall\..+/)
            .nullable()
            .default(null)
            .describe('A pack "wall.<name>" material to draw the walls in; null leaves them undrawn.'),
        doors: z.array(doorSpec).default([]),
        level,
    })
    .strict()
    .describe('A walled room. Rooms sharing an edge on one level share its walls.');

const interiorSpec = z
    .union([
        z.object({ create: text.describe('Name of a new interior scene to create.') }).strict(),
        z.object({ scene: text.describe('Id of an existing scene to link as the interior.') }).strict(),
    ])
    .describe('Where an enterable stamp leads.');

const stampSpec = z
    .object({
        type: z.literal('stamp'),
        stamp: text.describe('Catalog key, "<pack module id>:<stamp id>".'),
        x: z.number().describe('Footprint centre.'),
        y: z.number(),
        variant: z.number().int().min(0).optional(),
        rotation: z.number().optional().describe('Degrees clockwise.'),
        scale: positive.optional().describe('Multiplier over the authored footprint.'),
        interior: interiorSpec.optional(),
        level,
    })
    .strict()
    .describe('A stamp from a loaded pack.');

const levelSpec = z
    .object({
        key: text.describe('What features name in their `level`.'),
        name: text,
        bottom: z.number().optional().describe('Floor elevation (scene distance units); with `top`, sets the band.'),
        top: z.number().optional(),
        background: text.optional().describe("Image Foundry draws as this level's background, for this floor alone."),
        foreground: text.optional().describe("Image Foundry draws over this level's tokens (roofs, canopies)."),
        fog: text.optional().describe('Image shown in unexplored fog on this level.'),
    })
    .strict();

const featureSpec = z.discriminatedUnion('type', [regionSpec, strokeSpec, pathSpec, roomSpec, stampSpec]);

export const sceneSpecSchema = z
    .object({
        $schema: z.string().optional(),
        schemaVersion: z.literal(SCENE_SPEC_SCHEMA_VERSION),
        units: z.enum(['grid', 'px']).default('grid').describe('Unit of every coordinate, width and radius: grid squares, or scene pixels.'),
        levels: z.array(levelSpec).default([]).describe('Levels to add, bottom to top, stacked above any the scene has.'),
        features: z.array(featureSpec).describe('In drawing order: later features draw above, and earlier rooms own shared walls.'),
    })
    .strict();

export type SceneSpec = z.infer<typeof sceneSpecSchema>;

export type FeatureSpec = SceneSpec['features'][number];

export type RoomSpec = z.infer<typeof roomSpec>;

export interface SpecIssue {
    readonly path: string;
    readonly message: string;
}

export type SpecParseResult = { readonly ok: true; readonly spec: SceneSpec } | { readonly ok: false; readonly issues: readonly SpecIssue[] };

/** What JSON Schema cannot express: unique level keys, level references that resolve, doors on real segments. */
function referenceIssues(spec: SceneSpec): SpecIssue[] {
    const issues: SpecIssue[] = [];
    const keys = new Set<string>();
    spec.levels.forEach((l, i) => {
        if (keys.has(l.key)) {
            issues.push({ path: `levels.${i}.key`, message: `duplicate level key "${l.key}"` });
        }
        keys.add(l.key);
    });
    spec.features.forEach((f, i) => {
        if (f.level !== undefined && !keys.has(f.level)) {
            issues.push({ path: `features.${i}.level`, message: `no level with key "${f.level}"` });
        }
        if (f.type === 'room') {
            f.doors.forEach((d, j) => {
                if (d.segment >= f.points.length) {
                    issues.push({ path: `features.${i}.doors.${j}.segment`, message: `the room has only ${f.points.length} segments` });
                }
            });
        }
    });
    return issues;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: validates an untyped scene spec (pasted or generated JSON) and narrows it to SceneSpec
export function parseSceneSpec(raw: unknown): SpecParseResult {
    const result = sceneSpecSchema.safeParse(raw);
    if (!result.success) {
        return { ok: false, issues: result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })) };
    }
    const issues = referenceIssues(result.data);
    return issues.length > 0 ? { ok: false, issues } : { ok: true, spec: result.data };
}

/** Parse a scene spec from JSON text; text that is not JSON at all is one issue at the root. */
export function parseSceneSpecJson(json: string): SpecParseResult {
    // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse yields untyped data, validated by parseSceneSpec
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch (error) {
        return { ok: false, issues: [{ path: '', message: error instanceof Error ? error.message : String(error) }] };
    }
    return parseSceneSpec(raw);
}

/** An issue as one line of text: its path, then what is wrong there. */
export function formatSpecIssue(issue: SpecIssue): string {
    return issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`;
}
