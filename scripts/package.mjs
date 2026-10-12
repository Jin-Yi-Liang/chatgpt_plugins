import { execFileSync } from 'node:child_process';
import { mkdir, readFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
await mkdir('artifacts/packages', { recursive: true });
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
for (const browser of ['chrome', 'firefox']) {
  const file = path.resolve(`artifacts/packages/conversation-navigator-${browser}-${version}.zip`);
  execFileSync('zip', ['-q', '-r', '-FS', file, '.'], { cwd: `dist/${browser}` });
  console.log(file);
}
const script = path.resolve(`artifacts/packages/conversation-navigator-${version}.user.js`);
await copyFile('dist/userscript/chatgpt-conversation-navigator.user.js', script);
console.log(script);
