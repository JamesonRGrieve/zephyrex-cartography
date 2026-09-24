// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Light switches. A switch is a door stamp whose pack marks it `switch`: its
 * wall blocks nothing, so players flip it with Foundry's own door control,
 * and its "open" variant is on. It controls the lights linked to it
 * ({@link SwitchTarget}): lamp stamps (switched to a lit or unlit variant, so
 * their art, particles and sound follow), rooms (their centre light), and
 * plain Foundry lights (their native `hidden`). Pure and unit-tested; the
 * controller applies it.
 */
import { type CatalogStamp, effectiveProperties } from '../stamps/catalog';
import type { SenseBlock } from './documents';
import { isDoorStamp, stampDoorState } from './doors';
import type { Feature } from './feature';
import type { StampFeature } from './stamp';

/** A switch's wall blocks nothing: it only carries the door control players click. */
export const SWITCH_BLOCKS: SenseBlock = { sight: 'none', light: 'none', sound: 'none', movement: false };

/** `feature` as a light switch, or null when it is not one. */
export function switchOf(feature: Feature | null | undefined): StampFeature | null {
    return feature && isDoorStamp(feature) && feature.behaviour.door?.switch === true ? feature : null;
}

/** A switch is on while its door is open. */
export function switchOn(stamp: StampFeature): boolean {
    return stampDoorState(stamp) === 'open';
}

/**
 * The variant of a lamp stamp to show when its switch is on (the first that
 * emits a light) or off (the first that does not), or null when it has no
 * such variant, so the switch cannot change it.
 */
export function lampVariant(stamp: CatalogStamp, on: boolean): number | null {
    const index = stamp.variants.findIndex((_, i) => (effectiveProperties(stamp, i).light !== null) === on);
    return index < 0 ? null : index;
}
