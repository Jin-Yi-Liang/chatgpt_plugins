import { build } from 'esbuild';
import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = {
  manifest_version: 3,
  name: '对话导航 · ChatGPT',
  version,
  description: '按提问导航 ChatGPT 对话，自定义标题，选择回复并复制或导出 Markdown。所有处理都在本地完成。',
  permissions: ['storage', 'clipboardWrite'],
  host_permissions: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  content_scripts: [{
    matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
    js: ['content.js'], run_at: 'document_idle'
  }],
  action: { default_title: '对话导航', default_popup: 'popup.html' }
};
for (const browser of ['chrome', 'firefox']) {
  const outdir = path.join(root, 'dist', browser);
  await mkdir(outdir, { recursive: true });
  const current = structuredClone(manifest);
  if (browser === 'firefox') current.browser_specific_settings = {
    gecko: {
      id: 'conversation-navigator@local.extension',
      strict_min_version: '142.0',
      data_collection_permissions: { required: ['none'] }
    }
  };
  await writeFile(path.join(outdir, 'manifest.json'), JSON.stringify(current, null, 2) + '\n');
  await build({ entryPoints: [path.join(root, 'src/content.js')], outfile: path.join(outdir, 'content.js'), bundle: true, format: 'iife', target: ['chrome120', 'firefox140'], legalComments: 'eof', loader: { '.css': 'text' } });
  for (const file of ['popup.html', 'popup.js']) await copyFile(path.join(root, 'src', file), path.join(outdir, file));
  const notices = await Promise.all(['turndown', 'turndown-plugin-gfm'].map(async name => `${name}\n${await readFile(path.join(root, 'node_modules', name, 'LICENSE'), 'utf8')}`));
  await writeFile(path.join(outdir, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n\n'));
  await copyFile(path.join(root, 'LICENSE'), path.join(outdir, 'LICENSE'));
}
console.log('Built dist/chrome and dist/firefox');
await import('./build-userscript.mjs');
