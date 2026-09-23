// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The generator panel's form: the floor-plan settings a GM can type, with the
 * rules that keep them buildable. Pure and unit-tested; the room materials
 * come from the materials tool, not the form.
 */
import type { RoomMaterials } from '../tools/room';
import { DEFAULT_FLOOR_PLAN, type FloorPlanOptions } from './floor-plan';

export interface GeneratorForm {
    readonly seed: number;
    readonly width: number;
    readonly height: number;
    readonly minRoom: number;
    readonly maxRoom: number;
    readonly entrance: boolean;
}

export type GeneratorField = 'seed' | 'width' | 'height' | 'minRoom' | 'maxRoom';

export const DEFAULT_GENERATOR_FORM: GeneratorForm = {
    seed: DEFAULT_FLOOR_PLAN.seed,
    width: DEFAULT_FLOOR_PLAN.width,
    height: DEFAULT_FLOOR_PLAN.height,
    minRoom: DEFAULT_FLOOR_PLAN.minRoom,
    maxRoom: DEFAULT_FLOOR_PLAN.maxRoom,
    entrance: DEFAULT_FLOOR_PLAN.entrance,
};

/** Largest footprint side, in squares: past this a generated plan is more rooms than a GM can use. */
const MAX_SIDE = 200;

/** Seeds are 32-bit. */
const MAX_SEED = 0xffffffff;

function valid(form: GeneratorForm): boolean {
    const sides = [form.width, form.height, form.minRoom, form.maxRoom];
    return (
        sides.every((v) => Number.isInteger(v) && v >= 1 && v <= MAX_SIDE) &&
        Number.isInteger(form.seed) &&
        form.seed >= 0 &&
        form.seed <= MAX_SEED &&
        form.maxRoom >= form.minRoom &&
        Math.min(form.width, form.height) >= form.minRoom
    );
}

/** The form with `field` set from typed text, or null if that would make it unbuildable. */
export function withGeneratorField(form: GeneratorForm, field: GeneratorField, typed: string): GeneratorForm | null {
    const value = typed.trim() === '' ? Number.NaN : Number(typed);
    const next = { ...form, [field]: value };
    return valid(next) ? next : null;
}

/** A fresh seed from a source of uniform numbers in [0, 1). */
export function newSeed(random: () => number): number {
    return Math.floor(random() * MAX_SEED);
}

export function floorPlanOptions(form: GeneratorForm, materials: RoomMaterials): FloorPlanOptions {
    return { ...form, floor: materials.floor, wall: materials.wall };
}
