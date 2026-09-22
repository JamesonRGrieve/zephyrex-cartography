// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vite';

// Foundry loads the built ESM + CSS from the module directory. Foundry runtime
// globals (game, Hooks, foundry, canvas, CONFIG, PIXI) are provided by the host
// page — referenced as globals, never imported, so nothing needs externalising.
export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
        cssCodeSplit: false,
        lib: {
            entry: 'src/cartography-draw.ts',
            formats: ['es'],
            fileName: (): string => 'cartography-draw.js',
        },
        rollupOptions: {
            output: { assetFileNames: 'cartography-draw.[ext]' },
        },
    },
});
