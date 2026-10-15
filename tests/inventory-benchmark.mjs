import { chromium } from 'playwright';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
await mkdir('artifacts/performance', { recursive: true });
const baseline = execFileSync('git', ['show', 'b20bc04:src/inventory.js'], { encoding: 'utf8' });
const candidate = await readFile('src/inventory.js', 'utf8');
async function bundle(source) {
  return (await build({ stdin: { contents: source, resolveDir: path.join(root, 'src') }, bundle: true,
    write: false, format: 'iife', globalName: 'Subject' })).outputFiles[0].text;
}
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const result = { browser: await browser.version(), recorded: new Date().toISOString(), baseline: 'b20bc04',
  scope: 'Real Chromium, fixed rendered 1500-turn DOM, direct inventory module; excludes collection/UI rendering.', sourceSHA256: { baseline: createHash('sha256').update(baseline).digest('hex'), candidate: createHash('sha256').update(candidate).digest('hex') }, samples: [] };
try {
  for (const [label, source] of [['baseline', baseline], ['candidate', candidate], ['candidate', candidate], ['baseline', baseline]]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent('<style>main{height:700px;overflow:auto}article{height:120px}h1{font-size:16px}</style><main></main>');
    await page.addScriptTag({ content: await bundle(source) });
    const sample = await page.evaluate(() => {
      const main = document.querySelector('main');
      main.innerHTML = Array.from({ length: 1500 }, (_, index) => `<article id="q${index}"><div>Question ${index}</div><section><h1>Heading ${index}</h1><p>Reply</p></section></article>`).join('');
      const turns = [...main.children].map((anchor, index) => ({ key: `q${index}`, prompt: `Question ${index}`, anchor, answers: [anchor.querySelector('section')] }));
      const inventory = Subject.createInventory();
      const time = fn => { const start = performance.now(); fn(); return performance.now() - start; };
      const initial = time(() => inventory.merge(turns));
      const tail = turns.slice(-12);
      for (let i = 0; i < 10; i++) inventory.merge(tail);
      const streaming = time(() => {
        for (let i = 0; i < 100; i++) {
          tail.at(-1).answers[0].querySelector('p').textContent = `Reply token ${i}`;
          inventory.merge(tail);
        }
      });
      inventory.merge(turns);
      const resolving = time(() => {
        for (let i = 0; i < 100; i++) inventory.resolve('q750', () => turns);
      });
      let sortCalls = 0;
      const sort = Array.prototype.sort;
      Array.prototype.sort = function (...args) { sortCalls++; return sort.apply(this, args); };
      try { for (let i = 0; i < 10; i++) inventory.merge(tail); } finally { Array.prototype.sort = sort; }
      return { initialMilliseconds: initial, streaming100Milliseconds: streaming, resolve100Milliseconds: resolving,
        unchangedMerge10SortCalls: sortCalls, count: inventory.all().length,
        keys: [inventory.all()[0].key, inventory.all().at(-1).key] };
    });
    result.samples.push({ label, ...sample });
    await page.close();
  }
  // Differential correctness with actual DOM nodes and fixed pseudo-random windows.
  const page = await browser.newPage();
  await page.setContent('<style>main{height:500px;overflow:auto}article{height:150px}</style><main></main>');
  await page.addScriptTag({ content: (await bundle(baseline)).replace('var Subject', 'var Baseline') });
  await page.addScriptTag({ content: (await bundle(candidate)).replace('var Subject', 'var Candidate') });
  result.correctness = await page.evaluate(() => {
    const main = document.querySelector('main');
    main.innerHTML = Array.from({ length: 100 }, (_, index) => `<article><section><h1>Heading ${index}</h1><h1>Same</h1><h1>Same</h1></section></article>`).join('');
    const turns = [...main.children].map((anchor, index) => ({ key: `q${index}`, prompt: `Q${index}`, anchor, answers: [anchor.querySelector('section')] }));
    const baseline = Baseline.createInventory(), candidate = Candidate.createInventory();
    let seed = 42, windows = 0;
    const same = (a, b, label) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${label}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
    const merge = window => {
      const a = baseline.merge(window), b = candidate.merge(window);
      same(a.map(turn => turn.key), b.map(turn => turn.key), 'order');
      same(a.map(turn => turn.headings.map(heading => ({ key: heading.key, title: heading.title }))), b.map(turn => turn.headings.map(heading => ({ key: heading.key, title: heading.title }))), 'headings');
      windows++;
    };
    for (let i = 0; i < 120; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const from = seed % 90;
      merge(turns.slice(from, from + 10));
    }
    merge(turns);
    // Replace a same-key node, then stream new H1 content and remove its old heading.
    const replacement = turns[50].anchor.cloneNode(true);
    turns[50].anchor.replaceWith(replacement);
    turns[50] = { ...turns[50], anchor: replacement, answers: [replacement.querySelector('section')] };
    merge(turns.slice(45, 55));
    if (candidate.resolve('q50', () => turns).anchor !== replacement) throw new Error('stale replacement anchor');
    replacement.querySelector('h1').textContent = 'New heading';
    merge(turns.slice(45, 55));
    const heading = candidate.all().find(turn => turn.key === 'q50').headings[0];
    if (candidate.resolve('q50', () => turns, heading.key).anchor !== replacement.querySelector('h1')) throw new Error('stale heading anchor');
    // Unmounted entries keep their hints and receive a direction relative to the mounted window.
    turns[0].anchor.remove(); turns[99].anchor.remove();
    merge(turns.slice(45, 55));
    same(candidate.resolve('q0', () => turns.slice(45, 55)).hint.direction, -1, 'backward seek');
    same(candidate.resolve('q99', () => turns.slice(45, 55)).hint.direction, 1, 'forward seek');
    // Duplicate keys, disconnected insertion, and contradictory edges preserve the old fallback.
    merge([turns[55], turns[55], turns[54]]);
    merge([]);
    return { passed: true, windows, tested: ['overlapping/disconnected windows', 'complete ordering', 'same-key node replacement', 'streamed H1 and duplicate H1 keys', 'unmounted directions', 'empty window', 'duplicate keys and graph cycles'] };
  });
  assert.equal(result.correctness.passed, true);
  await page.close();
} finally { await browser.close(); }
await writeFile('artifacts/performance/inventory-report.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
