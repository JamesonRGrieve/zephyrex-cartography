#!/usr/bin/env node
/**
 * Reproducible terrain-texture fetch for the bundled FOSS packs. Reads
 * assets/textures/PACKS.json (each pack: provider, verified CC0 licence, and a
 * biome/role -> source-asset-id map), downloads every asset into
 * assets/textures/<pack>/<key>.jpg, and regenerates each pack's CREDITS.md.
 *
 * Two provider types:
 *   - "polyhaven": direct Diffuse JPG download (+ author lookup via the info API)
 *   - "ambientcg": download the 1K-JPG zip and extract the *_Color.jpg map
 *
 * All bundled packs are CC0 1.0 (public domain) with redistribution explicitly
 * permitted — verified per provider licence page. Attribution is a courtesy.
 *
 *   node scripts/fetch-textures.mjs            # all packs (skips files already present)
 *   node scripts/fetch-textures.mjs --pack X  # one pack
 *   node scripts/fetch-textures.mjs --force     # re-download even if present
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEX_DIR = resolve(HERE, '..', 'assets', 'textures');
const args = process.argv.slice(2);
const only = args.includes('--pack') ? args[args.indexOf('--pack') + 1] : null;
const force = args.includes('--force');

const manifest = JSON.parse(await readFile(resolve(TEX_DIR, 'PACKS.json'), 'utf8'));

async function download(url) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return Buffer.from(await res.arrayBuffer());
}

async function polyhavenAuthors(id) {
    try {
        const res = await fetch(`https://api.polyhaven.com/info/${id}`);
        return res.ok ? Object.keys((await res.json()).authors ?? {}).join(', ') : '';
    } catch {
        return '';
    }
}

/** Download a Poly Haven Diffuse JPG to `dest`. Returns a credit row. */
async function fetchPolyhaven(pack, key, id, dest) {
    const res = `${pack.resolution}`;
    if (force || !existsSync(dest)) {
        const url = `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/${res}/${id}/${id}_diff_${res}.jpg`;
        await writeFile(dest, await download(url));
    }
    const authors = (await polyhavenAuthors(id)) || 'Poly Haven';
    return `| \`${key}.jpg\` | ${id} | ${authors} | https://polyhaven.com/a/${id} |`;
}

/** Download an ambientCG 1K-JPG zip and extract its Color map to `dest`. */
async function fetchAmbientcg(pack, key, id, dest) {
    if (force || !existsSync(dest)) {
        const zipUrl = `https://ambientcg.com/get?file=${id}_${pack.resolution}-JPG.zip`;
        const tmp = await mkdtemp(join(tmpdir(), 'acg-'));
        try {
            const zipPath = join(tmp, `${id}.zip`);
            await writeFile(zipPath, await download(zipUrl));
            execFileSync('unzip', ['-j', '-o', zipPath, '*Color*', '-d', tmp], { stdio: 'ignore' });
            const color = (await readdir(tmp)).find((f) => /color\.(jpg|jpeg|png)$/i.test(f));
            if (!color) {
                throw new Error(`no Color map in ${id} zip`);
            }
            await copyFile(join(tmp, color), dest);
        } finally {
            await rm(tmp, { recursive: true, force: true });
        }
    }
    return `| \`${key}.jpg\` | ${id} | ambientCG | https://ambientcg.com/view?id=${id} |`;
}

for (const [name, pack] of Object.entries(manifest.packs)) {
    if (only && only !== name) {
        continue;
    }
    const dir = resolve(TEX_DIR, name);
    await mkdir(dir, { recursive: true });
    const rows = [];
    for (const [key, id] of Object.entries(pack.assets)) {
        const dest = resolve(dir, `${key}.jpg`);
        process.stdout.write(`[fetch-textures] ${name}/${key} <- ${id} ... `);
        const row = pack.type === 'ambientcg' ? await fetchAmbientcg(pack, key, id, dest) : await fetchPolyhaven(pack, key, id, dest);
        rows.push(row);
        process.stdout.write('ok\n');
    }
    const md = `# ${pack.provider} terrain textures — credits

Bundled from **${pack.provider}** (<${pack.provider_url}>) under **${pack.license}**
(${pack.license_url}) — public domain, redistribution/bundling explicitly
permitted. Attribution is a courtesy, not a requirement. Each file is the Colour
/ Diffuse map at ${pack.resolution} resolution, fetched by \`scripts/fetch-textures.mjs\`
from \`../PACKS.json\`. Water, ocean, and river are intentionally untextured.

| File | Source asset | Author(s) | Source |
|------|--------------|-----------|--------|
${rows.join('\n')}
`;
    await writeFile(resolve(dir, 'CREDITS.md'), md);
    process.stdout.write(`[fetch-textures] ${name}: wrote CREDITS.md (${rows.length} textures)\n`);
}
