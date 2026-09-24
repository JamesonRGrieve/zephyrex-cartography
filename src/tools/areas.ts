// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Areas: the features a GM can make difficult to cross and put region
 * behaviours on, namely painted ground (an area or a stroke) and rooms.
 * The effects panel edits an area's {@link AreaSettings}. Pure and
 * unit-tested.
 */
import { type AreaDisplay, type AreaEffect, displayOf, effectsOf } from './area-effects';
import type { Feature } from './feature';
import type { RegionFeature } from './region';
import type { RoomFeature } from './room';
import type { StrokeFeature } from './stroke';
import { movementCostOf } from './terrain-cost';

export type AreaFeature = RegionFeature | StrokeFeature | RoomFeature;

/** What the effects panel edits on an area: what crossing it costs on foot, its effects, and how its region shows. */
export interface AreaSettings {
    readonly movementCost: number;
    readonly effects: readonly AreaEffect[];
    readonly display: AreaDisplay;
}

/** Whether `feature` is an area. */
export function isArea(feature: Feature): feature is AreaFeature {
    return feature.type === 'region' || feature.type === 'stroke' || feature.type === 'room';
}

/** An area's settings: its cost (ordinary ground when it has none) and its effects. */
export function areaSettingsOf(area: AreaFeature): AreaSettings {
    return { movementCost: movementCostOf(area), effects: effectsOf(area), display: displayOf(area) };
}
