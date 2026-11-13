import { readFile, readdir, stat, access } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const json = async name => JSON.parse(await readFile(resolve(root, name), 'utf8'));
const snapshot = await json('source-snapshot.json');
const resources = await json('local-resources.json');
const pkg = await json('package.json');
const info = await json('info.json');
if (![snapshot.version, resources.version, info.version].every(version => version === pkg.version)) throw Error('Version mismatch');
const external = new Set(resources.files.map(row => row.path));
const files = [...snapshot.files.map(row => row.path), ...(await readdir(resolve(root, 'tools'))).filter(name => name.endsWith('.mjs')).map(name => 'tools/' + name)];
let scripts = 0, imports = 0;
for (const name of files) {
  const path = resolve(root, name);
  await stat(path);
  if (!/\.m?js$/.test(name)) continue;
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw Error(name + ': ' + (result.stderr || result.error || 'Syntax check failed'));
  scripts++;
  const text = await readFile(path, 'utf8');
  for (const match of text.matchAll(/\b(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
    if (!match[1].startsWith('.')) continue;
    const target = resolve(dirname(path), match[1]);
    const rel = relative(root, target).split(sep).join('/');
    if (rel === '..' || rel.startsWith('../')) throw Error('Import outside repository: ' + name);
    if (!external.has(rel)) await access(target);
    imports++;
  }
}
if (process.argv.includes('--snapshot')) {
  for (const row of snapshot.files) {
    const data = await readFile(resolve(root, row.path));
    if (data.length !== row.bytes || createHash('sha256').update(data).digest('hex') !== row.sha256) throw Error('Snapshot mismatch: ' + row.path);
  }
}
console.log(JSON.stringify({ version: pkg.version, scripts, imports, snapshotVerified: process.argv.includes('--snapshot'), localResourcesRequired: resources.files.length }));
