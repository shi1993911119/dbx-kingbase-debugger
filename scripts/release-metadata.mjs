import {readFile, writeFile, stat, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || path.join(root, 'dist'));
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const metadata = JSON.parse(await readFile(path.join(root, '.dbx-store.json'), 'utf8'));
const repository = 'shi1993911119/dbx-kingbase-debugger';
const tag = `v${manifest.version}`;
const artifacts = [];
for (const target of ['darwin-arm64', 'windows-x64']) {
  const name = `${manifest.id}-${manifest.version}-${target}.dbxp`;
  const file = path.join(output, name);
  const bytes = await readFile(file);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const size = (await stat(file)).size;
  const artifact = JSON.parse(await readFile(file.replace(/\.dbxp$/, '.artifact.json'), 'utf8'));
  if (artifact.sha256 !== digest || artifact.size !== size || artifact.target !== target) throw new Error(`Artifact metadata mismatch: ${target}`);
  artifacts.push({target, url: name, sha256: digest, size});
}
const plugin = Object.fromEntries(['id', 'publisher', 'version', 'name', 'description', 'permissions'].map(key => [key, manifest[key]]));
await writeFile(path.join(output, 'release-candidates.json'), JSON.stringify({schemaVersion: 1, plugin, artifacts}, null, 2) + '\n');
await writeFile(path.join(output, 'SHA256SUMS'), artifacts.map(a => `${a.sha256}  ${a.url}`).join('\n') + '\n');
const submission = path.join(output, 'store-submission');
await mkdir(path.join(submission, 'publishers'), {recursive: true});
await mkdir(path.join(submission, 'candidates'), {recursive: true});
await writeFile(path.join(submission, 'publishers', `${manifest.publisher}.json`), JSON.stringify({id: manifest.publisher, name: manifest.publisher, status: 'unverified'}, null, 2) + '\n');
const candidate = {schemaVersion: 1, id: manifest.id, publisher: manifest.publisher, version: manifest.version, ...metadata,
  icon: `https://raw.githubusercontent.com/${repository}/${tag}/${metadata.icon}`,
  source: `https://github.com/${repository}/tree/${tag}`,
  permissions: manifest.permissions,
  targets: artifacts.map(a => ({...a, url: `https://github.com/${repository}/releases/download/${tag}/${a.url}`}))};
await writeFile(path.join(submission, 'candidates', `${manifest.id}.json`), JSON.stringify(candidate, null, 2) + '\n');
console.log(`Prepared ${manifest.id}@${manifest.version}: two byte-pinned candidates, release-candidates.json, SHA256SUMS and store submission files`);
