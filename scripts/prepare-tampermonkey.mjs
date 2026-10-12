import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const directory = path.resolve('artifacts/tampermonkey');
await mkdir(directory, { recursive: true });
function download(url, output) { execFileSync('curl', ['-fsSL', '--retry', '2', '--max-time', '90', url, '-o', output], { stdio: 'inherit' }); }
async function exists(file) { try { await access(file); return true; } catch { return false; } }
const chromeURL = 'https://clients2.google.com/service/update2/crx?response=redirect&prodversion=156.0.8078.4&acceptformat=crx2,crx3&x=id%3Ddhdgffkkebhmkfjojejmpbldmpobfkfo%26uc';
if (!await exists(path.join(directory, 'chrome.crx'))) download(chromeURL, path.join(directory, 'chrome.crx'));
if (!await exists(path.join(directory, 'amo.json'))) download('https://addons.mozilla.org/api/v5/addons/addon/tampermonkey/', path.join(directory, 'amo.json'));
const amo = JSON.parse(await readFile(path.join(directory, 'amo.json'), 'utf8'));
if (!await exists(path.join(directory, 'firefox.xpi'))) download(amo.current_version.file.url, path.join(directory, 'firefox.xpi'));
const crx = await readFile(path.join(directory, 'chrome.crx'));
if (crx.subarray(0, 4).toString() !== 'Cr24' || crx.readUInt32LE(4) !== 3) throw new Error('Expected official CRX3 archive');
const header = crx.subarray(12, 12 + crx.readUInt32LE(8));
function varint(bytes, i) { let value = 0, shift = 0; while (true) { const b = bytes[i++]; value |= (b & 127) << shift; if (!(b & 128)) return [value, i]; shift += 7; } }
function* fields(bytes) {
  let i = 0;
  while (i < bytes.length) {
    let tag; [tag, i] = varint(bytes, i);
    if ((tag & 7) === 2) { let size; [size, i] = varint(bytes, i); yield [tag >> 3, bytes.subarray(i, i + size)]; i += size; }
    else if ((tag & 7) === 0) [, i] = varint(bytes, i);
    else throw new Error('Unexpected CRX protobuf field');
  }
}
let publicKey;
for (const [field, proof] of fields(header)) {
  if (![2, 3].includes(field)) continue;
  const key = [...fields(proof)].find(([n]) => n === 1)?.[1];
  if (!key) continue;
  const id = [...createHash('sha256').update(key).digest('hex').slice(0, 32)].map(char => String.fromCharCode(97 + parseInt(char, 16))).join('');
  if (id === 'dhdgffkkebhmkfjojejmpbldmpobfkfo') publicKey = key;
}
if (!publicKey) throw new Error('Official Tampermonkey CRX identity not found');
await writeFile(path.join(directory, 'chrome.zip'), crx.subarray(12 + header.length));
execFileSync('unzip', ['-oq', path.join(directory, 'chrome.zip'), '-d', path.join(directory, 'chrome')]);
const manifestPath = path.join(directory, 'chrome/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
// Preserve the ID from the signed vendor package when loading unpacked in Chrome for Testing.
manifest.key = publicKey.toString('base64');
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
const firefoxData = await readFile(path.join(directory, 'firefox.xpi'));
const firefoxHash = createHash('sha256').update(firefoxData).digest('hex');
if (amo.current_version.file.hash && amo.current_version.file.hash !== `sha256:${firefoxHash}`) throw new Error('AMO package hash mismatch');
const sources = { chrome: { url: chromeURL, version: manifest.version, sha256: createHash('sha256').update(crx).digest('hex'), installation: 'Official CRX unpacked with its signed-header public key; implementation files unchanged' }, firefox: { url: amo.current_version.file.url, version: amo.current_version.version, sha256: firefoxHash, installation: 'Official signed AMO XPI' } };
await writeFile(path.join(directory, 'sources.json'), JSON.stringify(sources, null, 2));
console.log(`Tampermonkey: Chrome ${manifest.version}, Firefox ${amo.current_version.version}`);
