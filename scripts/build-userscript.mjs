import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const dependencies = [
  { name: 'turndown', file: 'dist/turndown.js' },
  { name: 'turndown-plugin-gfm', file: 'dist/turndown-plugin-gfm.js' }
];
const requirements = [];
for (const dependency of dependencies) {
  const directory = path.join(root, 'node_modules', dependency.name);
  const info = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const hash = createHash('sha256').update(await readFile(path.join(directory, dependency.file))).digest('hex');
  requirements.push(`// @require      https://cdn.jsdelivr.net/npm/${dependency.name}@${info.version}/${dependency.file}#sha256=${hash}`);
}
const header = [
  '// ==UserScript==',
  '// @name         对话导航 · ChatGPT',
  '// @name:zh-CN   对话导航 · ChatGPT',
  '// @name:en      Conversation Navigator for ChatGPT',
  '// @namespace    https://github.com/Jin-Yi-Liang/chatgpt_plugins',
  `// @version      ${version}`,
  '// @description  按提问导航 ChatGPT，自定义和删除目录，逐层折叠回复 H1/H2/H3，多选复制与导出 Markdown。',
  '// @description:en Navigate ChatGPT questions and nested H1/H2/H3 reply headings; customize, select, copy and export Markdown.',
  '// @match        https://chatgpt.com/*',
  '// @match        https://chat.openai.com/*',
  '// @run-at       document-idle',
  '// @noframes',
  '// @grant        GM_getValue',
  '// @grant        GM_setValue',
  '// @grant        GM_setClipboard',
  '// @grant        GM_registerMenuCommand',
  '// @license      MIT',
  '// @homepageURL  https://github.com/Jin-Yi-Liang/chatgpt_plugins',
  '// @supportURL   https://github.com/Jin-Yi-Liang/chatgpt_plugins/issues',
  ...requirements,
  '// ==/UserScript==',
  '// Main implementation is included below. Third-party libraries use fixed-version @require with SHA-256.',
  '// Source: https://github.com/Jin-Yi-Liang/chatgpt_plugins (MIT).',
  ''
].join('\n');
await mkdir(path.join(root, 'dist/userscript'), { recursive: true });
const outfile = path.join(root, 'dist/userscript/chatgpt-conversation-navigator.user.js');
const result = await build({
  entryPoints: [path.join(root, 'src/content.js')], bundle: true, write: false, format: 'iife',
  target: ['chrome138', 'firefox142'], minify: false, legalComments: 'inline', loader: { '.css': 'text' },
  alias: { turndown: path.join(root, 'src/runtime/turndown-global.js'), 'turndown-plugin-gfm': path.join(root, 'src/runtime/gfm-global.js') },
  plugins: [{ name: 'userscript-runtime', setup(builder) {
    builder.onResolve({ filter: /^\.\/storage\.js$/ }, () => ({ path: path.join(root, 'src/runtime/userscript.js') }));
  } }]
});
await writeFile(outfile, `${header}\n${result.outputFiles[0].text}`);
console.log(outfile);
