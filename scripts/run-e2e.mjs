#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Run the Tier B e2e suite and merge its source coverage. Without a Foundry
 * release (FOUNDRY_RELEASE_DIR, default .foundry-release) it prints a skip
 * banner and succeeds, unless FOUNDRY_INTEGRATION=required. Extra arguments
 * go to Playwright (e.g. a spec filter, or --update-snapshots=missing).
 *
 * Usage: node scripts/run-e2e.mjs [playwright args...]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = resolve(ROOT, process.env['FOUNDRY_RELEASE_DIR'] ?? '.foundry-release');

if (!existsSync(resolve(RELEASE, 'main.js'))) {
    if (process.env['FOUNDRY_INTEGRATION'] === 'required') {
        console.error(`[e2e] no Foundry release at ${RELEASE}, and FOUNDRY_INTEGRATION=required`);
        process.exit(1);
    }
    console.warn(`[e2e] SKIPPED: no Foundry release at ${RELEASE} (set FOUNDRY_RELEASE_DIR to run the e2e suite)`);
    process.exit(0);
}

const PORT_BASE = Number(process.env['FOUNDRY_TEST_PORT'] ?? 30101);
const WORKERS = Math.max(1, Number(process.env['E2E_WORKERS'] ?? 1));
/** How long a previous run's servers get to release their ports and world databases. */
const PORT_WAIT_MS = 60_000;
const PORT_POLL_MS = 500;

function portFree(port) {
    return new Promise((done) => {
        const probe = createServer();
        probe.once('error', () => {
            done(false);
        });
        probe.listen(port, '127.0.0.1', () => {
            probe.close(() => {
                done(true);
            });
        });
    });
}

// A run straight after another (the gate, then pre-commit) must not start while the last run's
// servers are still shutting down: they hold the ports and the worlds' databases.
const deadline = Date.now() + PORT_WAIT_MS;
const ports = Array.from({ length: WORKERS }, (_, slot) => PORT_BASE + slot);
for (;;) {
    const free = await Promise.all(ports.map(portFree));
    if (free.every(Boolean)) {
        break;
    }
    if (Date.now() > deadline) {
        console.error(`[e2e] ports ${ports.join(', ')} are still in use after ${PORT_WAIT_MS / 1000}s`);
        process.exit(1);
    }
    await new Promise((done) => {
        setTimeout(done, PORT_POLL_MS);
    });
}

// Coverage and results describe one run; never merge a stale one.
for (const stale of ['.e2e-raw-coverage', '.e2e-coverage', '.e2e-results.json']) {
    rmSync(resolve(ROOT, stale), { recursive: true, force: true });
}

const run = (command, args) => spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' }).status ?? 1;
const tests = run(resolve(ROOT, 'node_modules/.bin/playwright'), ['test', '-c', 'playwright.e2e.config.ts', ...process.argv.slice(2)]);
const coverage = run(process.execPath, [resolve(ROOT, 'scripts/e2e-coverage.mjs')]);
process.exit(tests === 0 ? coverage : tests);
