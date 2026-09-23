#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Unit-test coverage ratchet over the pure core (the vitest coverage scope in
 * vitest.config.ts). Reads the json-summary a `vitest run --coverage` wrote,
 * so run the tests with coverage first (`pnpm test:coverage`).
 *
 * Ratchet semantics, per metric (lines, statements, functions, branches):
 *   - The percentage may never drop below the baseline.
 *   - A metric that reaches 100% graduates to strict: it must stay at 100%,
 *     and `--update` will not lower it.
 *   - A rise is allowed; lock it in with `--update` in the same commit.
 *
 * Baseline file: .coverage-baseline (JSON).
 *
 * Usage:
 *   node scripts/coverage-ratchet.mjs           # check
 *   node scripts/coverage-ratchet.mjs --update  # rewrite baseline
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SUMMARY = resolve(process.cwd(), '.coverage', 'coverage-summary.json');
const BASELINE = resolve(process.cwd(), '.coverage-baseline');
const METRICS = ['lines', 'statements', 'functions', 'branches'];
const FULL = 100;
const updateMode = process.argv.includes('--update');

if (!existsSync(SUMMARY)) {
    console.error('[coverage-ratchet] no coverage summary — run `pnpm test:coverage` first.');
    process.exit(2);
}

const total = JSON.parse(readFileSync(SUMMARY, 'utf8')).total;
const current = Object.fromEntries(METRICS.map((m) => [m, total[m].pct]));
const prior = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
const priorStrict = new Set(prior?.strict ?? []);

const strictViolations = METRICS.filter((m) => priorStrict.has(m) && current[m] < FULL);
if (strictViolations.length > 0) {
    console.error('[coverage-ratchet] STRICT-MODE VIOLATION: these metrics reached 100% and have regressed:');
    for (const m of strictViolations) {
        console.error(`  ${m}: ${current[m]}%`);
    }
    console.error('`--update` will NOT silence this. Cover the new code (see .coverage/index.html).');
    process.exit(1);
}

const strict = METRICS.filter((m) => priorStrict.has(m) || current[m] === FULL);

function writeBaseline() {
    writeFileSync(BASELINE, `${JSON.stringify({ ...current, strict }, null, 2)}\n`, 'utf8');
}

if (updateMode || prior === null) {
    writeBaseline();
    console.log(`[coverage-ratchet] baseline ${prior === null ? 'initialised' : 'updated'}: ${METRICS.map((m) => `${m} ${current[m]}%`).join(', ')}`);
    process.exit(0);
}

const regressions = METRICS.filter((m) => current[m] < prior[m]);
if (regressions.length > 0) {
    console.error('[coverage-ratchet] FAIL: coverage fell below the baseline:');
    for (const m of regressions) {
        console.error(`  ${m}: ${prior[m]}% -> ${current[m]}%`);
    }
    console.error('Cover the new or changed code (see .coverage/index.html).');
    process.exit(1);
}

const gains = METRICS.filter((m) => current[m] > prior[m]);
if (gains.length > 0) {
    console.log(`[coverage-ratchet] OK: coverage rose (${gains.map((m) => `${m} ${prior[m]}% -> ${current[m]}%`).join(', ')}). Lock it in: pnpm coverage:ratchet:update`);
} else {
    console.log('[coverage-ratchet] OK: coverage unchanged.');
}
