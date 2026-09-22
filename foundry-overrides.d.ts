// SPDX-License-Identifier: AGPL-3.0-or-later
// Ambient boundary declarations. Foundry runtime globals (game, Hooks, foundry,
// canvas, CONFIG, PIXI) come from fvtt-types; this file holds only what
// fvtt-types does not cover for this module.

// Tighten built-in lib types (JSON.parse -> unknown, Array.isArray -> readonly
// unknown[], .filter(Boolean) narrowing) so external input flows through
// explicit validation instead of leaking as `any`.
import '@total-typescript/ts-reset';

declare module '*.css';
