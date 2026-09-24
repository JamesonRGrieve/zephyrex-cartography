// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Scene settings a map sets for itself, as the scene config's Basics,
 * Lighting and Ambience tabs do: darkness, global light, token vision, fog of
 * war and its exploration mode, weather, and the transition shown on
 * entering it. Only what is given changes; the rest stays as the GM left it.
 * Pure data; the Foundry boundary writes it to the Scene.
 */

/** v14 `CONST.FOG_EXPLORATION_MODES`: whether explored areas are remembered, per user or for everyone. */
export const FOG_MODES = ['disabled', 'individual', 'shared'] as const;

export type FogMode = (typeof FOG_MODES)[number];

export const FOG_MODE_IDS: Readonly<Record<FogMode, number>> = { disabled: 0, individual: 1, shared: 2 };

/** Each setting left out, or undefined (as a parsed spec gives it), stays as the GM left it. */
export interface SceneSettings {
    /** Scene darkness, 0 (day) to 1 (night). */
    readonly darkness?: number | undefined;
    /** Lock the darkness so time of day does not change it. */
    readonly darknessLock?: boolean | undefined;
    /** Foundry's global illumination, lighting the whole scene. */
    readonly globalLight?: boolean | undefined;
    readonly tokenVision?: boolean | undefined;
    readonly fog?: FogMode | undefined;
    /** A `CONFIG.weatherEffects` key, or "" for none. */
    readonly weather?: string | undefined;
    /** The transition shown on entering the scene: a Foundry transition type (null: none) and its length in ms. */
    readonly transition?: { readonly type: string | null; readonly duration?: number | undefined } | undefined;
}

/** Whether `settings` changes anything. */
export function hasSceneSettings(settings: SceneSettings): boolean {
    return Object.values(settings).some((value) => value !== undefined);
}
