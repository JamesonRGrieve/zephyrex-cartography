// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
        exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],
        environment: 'happy-dom',
        globals: true,
        testTimeout: 30000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**/*.ts'],
            exclude: ['node_modules/**', 'dist/**', '**/*.test.ts', '**/*.stories.ts', 'src/zephyrex-cartography.ts'],
        },
    },
});
