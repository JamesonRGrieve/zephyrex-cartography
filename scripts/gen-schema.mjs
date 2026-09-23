#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Generate the published stamp-pack JSON Schema from its zod source of truth
 * (src/stamps/schema.ts, loaded directly via Node's TypeScript type stripping).
 *
 *   node scripts/gen-schema.mjs           # write schema/stamp-pack.v1.schema.json
 *   node scripts/gen-schema.mjs --check   # fail if the committed file is stale
 *
 * Output is formatted with the repo's Prettier config so lint-staged never
 * rewrites it into a spurious "stale" state.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { z } from 'zod';
import { STAMP_PACK_SCHEMA_URL, stampPackSchema } from '../src/stamps/schema.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'schema', 'stamp-pack.v1.schema.json');
const check = process.argv.includes('--check');

// `io: "input"` describes what a pack author writes: defaulted fields stay optional.
const json = {
    $id: STAMP_PACK_SCHEMA_URL,
    title: 'Zephyrex Cartography stamp pack (v1)',
    ...z.toJSONSchema(stampPackSchema, { io: 'input' }),
};
const options = (await prettier.resolveConfig(OUT)) ?? {};
const text = prettier.format(JSON.stringify(json), { ...options, parser: 'json' });

if (check) {
    const current = await readFile(OUT, 'utf8').catch(() => '');
    if (current !== text) {
        console.error('[schema] schema/stamp-pack.v1.schema.json is stale — run: pnpm schema:gen');
        process.exit(1);
    }
    console.log('[schema] OK: published JSON Schema matches the zod source.');
} else {
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, text);
    console.log(`[schema] wrote ${OUT}`);
}
