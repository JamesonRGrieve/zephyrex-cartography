// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Stamp pack schema v1 — the contract every asset pack must satisfy.
 *
 * Single source of truth: the engine's types (`z.infer`), its runtime validation
 * (`parseStampPack`), and the published JSON Schema that packs validate against
 * (`scripts/gen-schema.mjs` → `schema/stamp-pack.v1.schema.json`) all derive from
 * this file. It imports only `zod` so Node can load it directly for generation.
 *
 * A pack is one manifest (`zephyrex-pack.json`) at an asset module's root,
 * advertised via the module's `flags["zephyrex-cartography"].pack`. Paths inside
 * it are relative to that module's root. Changes to v1 are additive only;
 * anything breaking is a new version with its own file.
 */
import { z } from 'zod';

export const STAMP_PACK_SCHEMA_VERSION = 1;

export const STAMP_PACK_SCHEMA_URL = 'https://raw.githubusercontent.com/JamesonRGrieve/zephyrex-cartography/main/schema/stamp-pack.v1.schema.json';

/** Map scale band a stamp is authored for (drives browser grouping). */
const STAMP_SCALES = ['system', 'planet', 'regional', 'city', 'exterior', 'interior'] as const;

const STAMP_PERSPECTIVES = ['top-down', 'isometric'] as const;

const text = z.string().min(1);
const fraction = z.number().min(0).max(1);

const physicalSchema = z
    .object({
        height: z.number().min(0).optional().describe('Height above the stamp base, in grid units (cover and elevation bands).'),
        cover: fraction.optional().describe('Cover density: 0 none, 0.5 half, 0.75 three-quarter, 1 full.'),
        blocksMovement: z.boolean().optional().describe('Tokens cannot move through the stamp footprint.'),
    })
    .strict()
    .describe('The physical body of the stamp.');

const occlusionSchema = z
    .object({
        shape: z
            .enum(['none', 'bounds', 'alpha'])
            .describe('How the stamp is wrapped in native walls: not at all, its bounding box, or its traced alpha silhouette.'),
        sight: z.boolean().default(true).describe('The generated walls block sight.'),
        movement: z.boolean().default(true).describe('The generated walls block movement.'),
        light: z.boolean().default(true).describe('The generated walls block light.'),
        sound: z.boolean().default(true).describe('The generated walls block sound.'),
    })
    .strict()
    .describe('Automatic occlusion walls around the placed stamp.');

const lightSchema = z
    .object({
        dim: z.number().min(0).describe('Dim light radius, in grid units.'),
        bright: z.number().min(0).describe('Bright light radius, in grid units.'),
        color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional()
            .describe('Light colour as #rrggbb.'),
        alpha: fraction.optional().describe('Colour intensity.'),
        angle: z.number().min(0).max(360).optional().describe('Emission cone in degrees (360 = omnidirectional).'),
        offset: z.object({ x: fraction, y: fraction }).strict().optional().describe('Emitter position as a fraction of the footprint (default: centre).'),
        animation: z
            .object({
                type: text.describe('Foundry light animation key, e.g. "torch", "flame", "pulse".'),
                speed: z.number().int().min(1).max(10).optional(),
                intensity: z.number().int().min(1).max(10).optional(),
            })
            .strict()
            .optional(),
    })
    .strict()
    .describe('A native ambient light emitted by the placed stamp.');

const doorSchema = z
    .object({ type: z.enum(['door', 'secret']).describe('Foundry door type of the wall this stamp sits on.') })
    .strict()
    .describe('The stamp is a door: placing it on a wall makes that wall a Foundry door.');

const transitionSchema = z
    .object({
        kind: z.enum(['stairs', 'ladder', 'lift', 'hatch']),
        direction: z.enum(['up', 'down', 'both']).describe('Which level(s) the stamp leads to.'),
    })
    .strict()
    .describe('The stamp moves tokens between elevation levels.');

const variantSchema = z
    .object({
        state: text.describe('Display label for this variant, e.g. "intact", "open", "lit".'),
        image: text.describe('Image path relative to the pack module root.'),
        width: z.number().int().positive().describe('Pixel width at the pack referenceGridSize.'),
        height: z.number().int().positive().describe('Pixel height at the pack referenceGridSize.'),
        perspective: z.enum(STAMP_PERSPECTIVES).optional().describe('Overrides the stamp perspective.'),
        doorState: z.enum(['closed', 'open', 'locked']).optional().describe('Door state this variant represents (door stamps).'),
        light: lightSchema.nullable().optional().describe('Overrides the stamp light; null means this variant emits none (e.g. "unlit").'),
        occlusion: occlusionSchema.optional().describe('Overrides the stamp occlusion.'),
        physical: physicalSchema.optional().describe('Overrides the stamp physical body.'),
    })
    .strict();

const stampSchema = z
    .object({
        id: text.describe('Unique within the pack.'),
        name: text,
        category: text,
        tags: z.array(text).default([]),
        scale: z.enum(STAMP_SCALES),
        perspective: z.enum(STAMP_PERSPECTIVES),
        defaultVariant: z.number().int().min(0).default(0).describe('Index into variants.'),
        variants: z.array(variantSchema).min(1),
        physical: physicalSchema.optional(),
        occlusion: occlusionSchema.optional(),
        light: lightSchema.optional(),
        door: doorSchema.optional(),
        transition: transitionSchema.optional(),
        enterable: z.boolean().default(false).describe('Can open into a linked interior scene (submap).'),
        container: z.boolean().default(false).describe('Placed as an Item Piles container by default.'),
    })
    .strict();

const textureSetSchema = z
    .object({
        id: text,
        name: text,
        license: text.describe('SPDX id or licence name covering every file in the set.'),
        credits: text.optional().describe('Path to the set attribution file.'),
        textures: z.record(text, text).describe('Texture role (biome name or "road") → image path.'),
    })
    .strict();

export const stampPackSchema = z
    .object({
        $schema: z.string().optional(),
        schemaVersion: z.literal(STAMP_PACK_SCHEMA_VERSION),
        id: text.describe('Pack id (conventionally the providing module id).'),
        name: text,
        license: text.optional(),
        referenceGridSize: z.number().int().positive().default(100).describe('Grid size (px per square) the stamp pixel sizes were authored at.'),
        stamps: z.array(stampSchema),
        textureSets: z.array(textureSetSchema).default([]),
    })
    .strict();

type StampPack = z.infer<typeof stampPackSchema>;

export type Stamp = StampPack['stamps'][number];

export type StampVariant = Stamp['variants'][number];

export type StampLight = z.infer<typeof lightSchema>;

export type StampOcclusion = z.infer<typeof occlusionSchema>;

export type StampPhysical = z.infer<typeof physicalSchema>;

export type TextureSet = StampPack['textureSets'][number];

export interface PackIssue {
    readonly path: string;
    readonly message: string;
}

export type PackParseResult = { readonly ok: true; readonly pack: StampPack } | { readonly ok: false; readonly issues: readonly PackIssue[] };

/** Stamp ids that appear more than once (the JSON Schema cannot express keyed uniqueness). */
function duplicateIdIssues(pack: StampPack): PackIssue[] {
    const seen = new Set<string>();
    const issues: PackIssue[] = [];
    pack.stamps.forEach((stamp, i) => {
        if (seen.has(stamp.id)) {
            issues.push({ path: `stamps.${i}.id`, message: `duplicate stamp id "${stamp.id}"` });
        }
        seen.add(stamp.id);
    });
    return issues;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: validates an untyped pack manifest (fetched JSON) and narrows it to StampPack
export function parseStampPack(raw: unknown): PackParseResult {
    const result = stampPackSchema.safeParse(raw);
    if (!result.success) {
        return { ok: false, issues: result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })) };
    }
    const duplicates = duplicateIdIssues(result.data);
    return duplicates.length > 0 ? { ok: false, issues: duplicates } : { ok: true, pack: result.data };
}
