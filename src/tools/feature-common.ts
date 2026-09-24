// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What every feature carries regardless of type: identity, control points,
 * the native documents it owns, and the level it sits on. Constructors spread
 * {@link NEW_FEATURE}, and parsers spread {@link parseFeatureCommon}.
 */
import type { Point } from '../geometry/spline';
import { NO_DOCS, parseGeneratedDocs, type GeneratedDocs } from './generated-docs';
import { stringOrNull } from './guards';

export interface FeatureCommon {
    readonly id: string;
    readonly points: Point[];
    /** Native Foundry documents this feature generated (the lifecycle rule). */
    readonly docs: GeneratedDocs;
    /** Level (elevation band) id, or null to show on every level. */
    readonly level: string | null;
}

/** Common fields of a freshly made feature: no documents yet, no level (the controller assigns the active one). */
export const NEW_FEATURE: Pick<FeatureCommon, 'docs' | 'level'> = { docs: NO_DOCS, level: null };

// eslint-disable-next-line no-restricted-syntax -- boundary: reads the common fields of one untyped scene-flag entry
export function parseFeatureCommon(v: Record<string, unknown>): Pick<FeatureCommon, 'docs' | 'level'> {
    return { docs: parseGeneratedDocs(v['docs']), level: stringOrNull(v['level']) };
}
