#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Ratchet for the Tier B e2e suite, read from the last `pnpm test:e2e` run
 * (.e2e-results.json and .e2e-coverage/coverage-summary.json):
 *   1. No test may fail, and the passed count may not fall (a deleted or
 *      skipped spec is a regression).
 *   2. Source coverage (lines, statements, functions, branches) as the real
 *      Foundry drives the module may not fall. A metric at 100% locks there.
 *
 * Without a Foundry release the suite is skipped, and so is this check,
 * unless FOUNDRY_INTEGRATION=required.
 *
 * Baseline file: .e2e-baseline (JSON).
 * Usage: node scripts/e2e-ratchet.mjs [--update]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS = resolve(ROOT, '.e2e-results.json');
const SUMMARY = resolve(ROOT, '.e2e-coverage', 'coverage-summary.json');
const BASELINE = resolve(ROOT, '.e2e-baseline');
const RELEASE = resolve(ROOT, process.env['FOUNDRY_RELEASE_DIR'] ?? '.foundry-release');
const METRICS = ['lines', 'statements', 'functions', 'branches'];
const FULL = 100;
const updateMode = process.argv.includes('--update');

if (!existsSync(resolve(RELEASE, 'main.js')) && process.env['FOUNDRY_INTEGRATION'] !== 'required') {
    console.warn('[e2e-ratchet] SKIPPED: no Foundry release, so the e2e suite did not run.');
    process.exit(0);
}
if (!existsSync(RESULTS) || !existsSync(SUMMARY)) {
    console.error('[e2e-ratchet] no e2e results or coverage: run `pnpm test:e2e` first.');
    process.exit(2);
}

const stats = JSON.parse(readFileSync(RESULTS, 'utf8')).stats;
const total = JSON.parse(readFileSync(SUMMARY, 'utf8')).total;
const current = { passed: stats.expected, ...Object.fromEntries(METRICS.map((m) => [m, total[m].pct])) };
const failed = stats.unexpected + stats.flaky;
if (failed > 0) {
    console.error(`[e2e-ratchet] FAIL: ${failed} e2e test(s) failed or flaked.`);
    process.exit(1);
}

const prior = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
const priorStrict = new Set(prior?.strict ?? []);
const strictBroken = METRICS.filter((m) => priorStrict.has(m) && current[m] < FULL);
if (strictBroken.length > 0) {
    console.error(`[e2e-ratchet] STRICT-MODE VIOLATION: ${strictBroken.join(', ')} reached 100% and regressed. --update will not silence this.`);
    process.exit(1);
}
const strict = METRICS.filter((m) => priorStrict.has(m) || current[m] === FULL);

if (updateMode || prior === null) {
    writeFileSync(BASELINE, `${JSON.stringify({ ...current, strict }, null, 2)}\n`);
    console.log(`[e2e-ratchet] baseline ${prior === null ? 'initialised' : 'updated'}: ${JSON.stringify(current)}`);
    process.exit(0);
}

const regressions = ['passed', ...METRICS].filter((key) => current[key] < prior[key]);
if (regressions.length > 0) {
    console.error('[e2e-ratchet] FAIL: regressed against .e2e-baseline:');
    for (const key of regressions) {
        console.error(`  ${key}: ${prior[key]} -> ${current[key]}`);
    }
    process.exit(1);
}
const gains = ['passed', ...METRICS].filter((key) => current[key] > prior[key]);
console.log(
    gains.length > 0
        ? `[e2e-ratchet] OK: improved (${gains.map((key) => `${key} ${prior[key]} -> ${current[key]}`).join(', ')}). Lock it in: pnpm e2e:ratchet:update`
        : '[e2e-ratchet] OK: unchanged.',
);
