import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const file = 'dist/userscript/chatgpt-conversation-navigator.user.js';
const source = await readFile(file, 'utf8');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
assert.ok(source.startsWith('// ==UserScript==\n'), 'Metadata must be at start of file');
assert.ok(source.includes('// ==/UserScript=='), 'Metadata end missing');
assert.ok(source.includes(`// @version      ${version}`), 'Version differs from package');
assert.ok(Buffer.byteLength(source) < 2 * 1024 * 1024, 'Greasy Fork size limit exceeded');
assert.deepEqual([...source.matchAll(/^\/\/ @match\s+(.+)$/gm)].map(m => m[1]), ['https://chatgpt.com/*','https://chat.openai.com/*']);
assert.deepEqual([...source.matchAll(/^\/\/ @grant\s+(.+)$/gm)].map(m => m[1]), ['GM_getValue','GM_setValue','GM_setClipboard','GM_registerMenuCommand']);
assert.ok(!/\b(?:chrome|browser)\.(?:runtime|storage|tabs)\b/.test(source), 'Extension API leaked into userscript');
assert.ok(!/\beval\s*\(|\bnew Function\s*\(/.test(source), 'Dynamic executable loader present');
const requirements = [...source.matchAll(/^\/\/ @require\s+(.+)$/gm)].map(m => m[1]);
assert.equal(requirements.length, 2);
for (const url of requirements) assert.match(url, /^https:\/\/cdn\.jsdelivr\.net\/npm\/[^@]+@[\d.]+\/dist\/.+\.js#sha256=[a-f0-9]{64}$/);
console.log(JSON.stringify({ file, version, bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex'), matches: 2, grants: 4, requirements: 2, check: 'passed' }, null, 2));
