// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Every story, rendered in a real browser from the static Storybook build:
 * it must mount without errors, and (locally) match its committed screenshot.
 *
 * Pixel baselines are taken with the system Chromium (`/usr/bin/chromium`, or
 * `CHROMIUM_PATH`). CI runs Playwright's bundled Chromium, which renders fonts
 * differently, so under CI snapshots are ignored and only rendering is checked.
 * Refresh baselines deliberately with `pnpm test:storybook --update-snapshots`.
 */
import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const PORT = Number(process.env['STORYBOOK_TEST_PORT'] ?? 6107);
const SYSTEM_CHROMIUM = '/usr/bin/chromium';
const executablePath = process.env['CHROMIUM_PATH'] ?? (existsSync(SYSTEM_CHROMIUM) ? SYSTEM_CHROMIUM : undefined);

export default defineConfig({
    testDir: './tests/storybook',
    fullyParallel: true,
    workers: Math.max(1, Number(process.env['STORYBOOK_WORKERS'] ?? 2)),
    forbidOnly: process.env['CI'] !== undefined,
    ignoreSnapshots: process.env['CI'] !== undefined,
    retries: 0,
    reporter: 'list',
    expect: {
        timeout: 15_000,
        toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled' },
    },
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        browserName: 'chromium',
        viewport: { width: 900, height: 700 },
        launchOptions: {
            ...(executablePath === undefined ? {} : { executablePath }),
            args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
        },
    },
    webServer: {
        command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory storybook-static`,
        url: `http://127.0.0.1:${PORT}/index.json`,
        reuseExistingServer: process.env['CI'] === undefined,
        stdout: 'ignore',
        stderr: 'pipe',
    },
});
