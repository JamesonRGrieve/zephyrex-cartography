// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vite';

// Foundry loads the built ESM + CSS from the module directory. Foundry runtime
// globals (game, Hooks, foundry, canvas, CONFIG, PIXI) are provided by the host
// page — referenced as globals, never imported, so nothing needs externalising.
// `src/static/` (localisation) is copied verbatim into `dist/`.
export default defineConfig({
    publicDir: 'src/static',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
        cssCodeSplit: false,
        copyPublicDir: true,
        lib: {
            entry: 'src/zephyrex-cartography.ts',
            formats: ['es'],
            fileName: (): string => 'zephyrex-cartography.js',
        },
        rollupOptions: {
            output: { assetFileNames: 'zephyrex-cartography.[ext]' },
        },
    },
});
