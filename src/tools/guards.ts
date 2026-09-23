// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Narrowing guards for untyped persisted JSON (scene flags, tile flags). Every
 * parser in the pure core validates through these instead of casting.
 */
import type { Point } from '../geometry/spline';

// eslint-disable-next-line no-restricted-syntax -- boundary: narrows an untyped scene-flag value to an indexable record so downstream field reads need no unchecked cast
export function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: array elements from a scene-flag blob are unknown; this guard narrows each to Point
export function isPoint(v: unknown): v is Point {
    if (!isRecord(v)) {
        return false;
    }
    return typeof v['x'] === 'number' && typeof v['y'] === 'number';
}

// eslint-disable-next-line no-restricted-syntax -- boundary: a persisted list is untyped scene-flag JSON; narrows it to its numeric elements
export function numberArray(v: unknown): number[] {
    return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
}

// eslint-disable-next-line no-restricted-syntax -- boundary: a persisted list is untyped scene-flag JSON; narrows it to its string elements
export function stringArray(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
}

// eslint-disable-next-line no-restricted-syntax -- boundary: reads an optional numeric field of untyped JSON, with a fallback
export function numberOr(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: reads an optional string field of untyped JSON, null when absent or mistyped
export function stringOrNull(v: unknown): string | null {
    return typeof v === 'string' ? v : null;
}
