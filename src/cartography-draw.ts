// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Zephyrex Cartography — Draw: entry point.
 *
 * Registers the in-Foundry map-painting layer and its path tool. This scaffold
 * wires the module lifecycle and exposes the pure geometry API that the canvas
 * tools build on; the layer/tool registration is filled in against the live
 * Foundry v14 canvas API.
 */
import './styles/entry.css';
import { catmullRom, offsetRibbon, simplify } from './geometry/spline';

export const MODULE_ID = 'dh-cartography-draw';

/** Geometry helpers exposed for macros and the canvas draw tools. */
export interface CartographyDrawApi {
    readonly simplify: typeof simplify;
    readonly catmullRom: typeof catmullRom;
    readonly offsetRibbon: typeof offsetRibbon;
}

export const api: CartographyDrawApi = { simplify, catmullRom, offsetRibbon };

Hooks.once('init', () => {
    // Canvas layer + scene-control tool registration lands here; `api` above is
    // the seam the path tool consumes to turn click/freehand streams into
    // smoothed, offset ribbons.
});
