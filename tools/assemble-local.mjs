import { readFile, mkdir, copyFile, stat, realpath } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
if (args.length !== 4 || !option('--resources') || !option('--output')) throw Error('Usage: node tools/assemble-local.mjs --resources <existing-extension> --output <new-directory>');
const source = await realpath(resolve(option('--resources')));
const output = resolve(option('--output'));
try { await stat(output); throw Error('Output already exists; choose a new directory.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const within = (base, target) => { const part = relative(base, target); return part === '' || (part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part)); };
if (within(source, output) || within(output, source) || within(output, root)) throw Error('Output must be separate from the resource source and must not contain this repository.');
const manifest = JSON.parse(await readFile(resolve(root, 'local-resources.json'), 'utf8'));
const snapshot = JSON.parse(await readFile(resolve(root, 'source-snapshot.json'), 'utf8'));
const localInfo = JSON.parse((await readFile(resolve(source, 'info.json'), 'utf8')).replace(/^\uFEFF/, ''));
if (localInfo.version !== manifest.version) throw Error('Local resources must match version ' + manifest.version);
const safePath = (base, name) => { const path = resolve(base, name); if (!within(base, path) || path === base) throw Error('Invalid manifest path'); return path; };
for (const row of manifest.files) {
  const path = safePath(source, row.path);
  if (!within(source, await realpath(path))) throw Error('Resource link leaves source directory: ' + row.path);
  const bytes = await readFile(path);
  if (bytes.length !== row.bytes || createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw Error('Resource mismatch: ' + row.path);
}
await mkdir(dirname(output), { recursive: true });
// Refuse an output parent redirected into the source through a symlink.
const physicalOutput = resolve(await realpath(dirname(output)), relative(dirname(output), output));
if (within(source, physicalOutput) || within(physicalOutput, source) || within(physicalOutput, await realpath(root))) throw Error('Output resolves into a protected source directory.');
await mkdir(output);
for (const row of manifest.files) {
  const dest = safePath(output, row.path);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(safePath(source, row.path), dest);
}
for (const name of [...snapshot.files.map(row => row.path), 'package.json', 'LICENSE', 'README.md', 'NOTICE.md', 'licenses/decade-ui-LICENSE.txt']) {
  const dest = safePath(output, name);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(safePath(root, name), dest);
}
console.log(JSON.stringify({ version: manifest.version, resourcesVerified: manifest.files.length, output }));
