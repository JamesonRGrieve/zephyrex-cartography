// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Architecture rules for zephyrex-cartography. Layering (inner → outer):
 *   geometry (pure math)  ←  tools (feature models)  ←  canvas (controller/renderer)  ←  foundry (boundary)  ←  entry
 * Inner layers must never import outer ones.
 */
module.exports = {
    forbidden: [
        {
            name: 'no-circular',
            severity: 'warn',
            from: {},
            to: { circular: true },
        },
        {
            name: 'no-orphans',
            severity: 'warn',
            from: { orphan: true, pathNot: ['\\.d\\.ts$', '(^|/)zephyrex-cartography\\.ts$', '\\.test\\.ts$'] },
            to: {},
        },
        {
            name: 'geometry-is-pure',
            comment: 'Pure geometry must not depend on Foundry canvas or tool state.',
            severity: 'warn',
            from: { path: '^src/geometry/' },
            to: { path: '^src/(canvas|tools)/' },
        },
        {
            name: 'tools-must-not-import-canvas',
            comment: 'Tool/path state is Foundry-agnostic; the canvas layer depends on it, not the reverse.',
            severity: 'warn',
            from: { path: '^src/tools/' },
            to: { path: '^src/canvas/' },
        },
        {
            name: 'no-test-into-prod',
            severity: 'error',
            from: { pathNot: '\\.test\\.ts$' },
            to: { path: '\\.test\\.ts$' },
        },
    ],
    options: {
        doNotFollow: { path: 'node_modules' },
        tsConfig: { fileName: 'tsconfig.json' },
        tsPreCompilationDeps: true,
        exclude: { path: '(\\.test\\.ts$|^dist/)' },
    },
};
