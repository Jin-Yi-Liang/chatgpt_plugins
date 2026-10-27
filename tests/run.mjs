import { chromium } from 'playwright';
import { Builder, By, Key } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { conversation, fallbackConversation } from './fixture.mjs';
import { experienceTests } from './experience.mjs';
import { navigationRegressions } from './navigation-regressions.mjs';
import { readingPositionTests, readingConversation } from './reading-position.mjs';
import { formulaCopyTests, formulaConversation } from './formula-copy.mjs';
import { headingOutlineTests } from './heading-outline.mjs';
import { distantNavigationTests } from './distant-navigation.mjs';
import { recycledConversation } from './recycled-fixture.mjs';
import { modernConversation } from './modern-fixture.mjs';
import { scrollConversation, virtualConversation, preloadedTallConversation } from './scroll-fixture.mjs';
import { installChromeScript, installFirefoxScript, firefoxTestScript, chromeManagerId, firefoxManagerUUID } from './tampermonkey.mjs';

const root = process.cwd();
const userscriptMode = process.env.TEST_RUNTIME === 'tampermonkey';
const managerDirectory = path.join(root, 'artifacts/tampermonkey');
const artifactDir = path.resolve(process.env.TEST_ARTIFACT_DIR || path.join(root, userscriptMode ? 'artifacts/tests-userscript' : 'artifacts/tests'));
const extensionRoot = path.resolve(process.env.TEST_EXTENSION_ROOT || path.join(root, 'dist'));
await mkdir(artifactDir, { recursive: true });
const report = { started: new Date().toISOString(), scope: 'Offline ChatGPT DOM fixtures, including user-supplied redacted current shell with synthetic content; real installed extensions and isolated headless browser profiles. Not a live signed-in ChatGPT conversation.', browsers: [] };
report.runtime = userscriptMode ? 'Real Tampermonkey with UI-installed userscript, GM API calls and fixed-version @require libraries' : 'WebExtension';
const reportPath = path.join(artifactDir, 'report.json');
const failures = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(fn, message) {
  const deadline = Date.now() + 12000;
  let last;
  while (Date.now() < deadline) { try { if (await fn()) return; } catch (error) { last = error; } await pause(100); }
  throw new Error(`Timeout: ${message}${last ? ` (${last.message})` : ''}`);
}

async function sharedTests(ui, entry) {
  async function check(name, fn) {
    try { await fn(); entry.tests.push({ name, passed: true }); console.log(`${entry.browser}: PASS ${name}`); }
    catch (error) { entry.tests.push({ name, passed: false, error: error.stack }); throw error; }
  }
  const q = '#conversation-navigator-root';
  const shadow = (fn, arg) => ui.eval(({ source, arg }) => {
    const root = document.querySelector('#conversation-navigator-root')?.shadowRoot;
    return new Function('root', 'arg', `return (${source})(root, arg)`)(root, arg);
  }, { source: fn.toString(), arg });
  const rows = () => shadow(root => root?.querySelectorAll('.row').length || 0);
  const title = index => shadow((root, index) => root.querySelectorAll('.title')[index]?.textContent, index);
  const status = () => shadow(root => root.querySelector('.status').textContent);
  if (!process.env.TEST_ONLY_READING && !process.env.TEST_ONLY_FORMULAS && !process.env.TEST_ONLY_DISTANT && !process.env.TEST_ONLY_HEADINGS) {
  if (!process.env.TEST_ONLY_STARTUP) {
  if (!process.env.TEST_ONLY_EXPERIENCE) {
  if (!process.env.TEST_ONLY_NAVIGATION) {
  await ui.goto('/c/fixture-primary');
  await check('真实扩展注入、导航提问与隐藏分支过滤', async () => {
    await wait(async () => await rows() === 3, 'three visible user turns');
    assert.equal(await title(0), '解释 RAG，并给出 Markdown 示例');
    assert.equal(await shadow(root => root.querySelector('.count').textContent), '3 条');
    assert.equal(await shadow(root => root.querySelector('#copy').disabled), true);
    assert.equal(await ui.eval(() => document.querySelector('#conversation-navigator-root').dataset.runtime), userscriptMode ? 'tampermonkey' : 'extension');
  });
  await check('点击导航滚动到对应提问', async () => {
    await ui.click('.row:nth-child(3) .jump');
    await wait(async () => await ui.eval(() => { const r = document.querySelector('[data-message-id="user-3"]').closest('article').getBoundingClientRect(); return scrollY > 1000 && r.top >= 0 && r.bottom < innerHeight; }), 'scroll to third question');
    assert.equal(await shadow(root => root.querySelectorAll('.row')[2].classList.contains('active')), true);
  });
  await check('自定义标题、安全显示与刷新持久化', async () => {
    await ui.click('.row:nth-child(1) .edit');
    await ui.fill('.editor textarea', 'RAG 学习笔记 <img src=x onerror=alert(1)>');
    await ui.click('[data-edit="save"]');
    assert.equal(await title(0), 'RAG 学习笔记 <img src=x onerror=alert(1)>');
    assert.equal(await shadow(root => root.querySelectorAll('.title img').length), 0);
    await ui.reload(); await wait(async () => (await title(0))?.startsWith('RAG 学习笔记'), 'persisted custom title');
  });
  await check('搜索原提问与自定义标题、选择搜索结果', async () => {
    await ui.fill('#search', 'RAG 学习'); assert.equal(await rows(), 1);
    await ui.click('#select-visible');
    assert.equal(await shadow(root => root.querySelector('#selected-count').textContent), '已选 1');
    await ui.fill('#search', '总结'); await ui.click('#select-visible');
    await ui.fill('#search', ''); assert.equal(await rows(), 3);
    assert.equal(await shadow(root => root.querySelector('#selected-count').textContent), '已选 2');
  });
  let markdown;
  await check('多选回复复制到真实剪贴板、连续 Markdown 与格式', async () => {
    await ui.click('#copy'); await wait(async () => (await status()).includes('已复制 2'), 'clipboard write');
    markdown = await ui.paste();
    await writeFile(path.join(artifactDir, `${entry.browser}-clipboard.md`), markdown);
    assert.ok(markdown.includes('## 第一份回复'));
    assert.ok(markdown.includes('### 第三份回复'));
    assert.ok(markdown.indexOf('第一份回复') < markdown.indexOf('第三份回复'));
    assert.ok(markdown.includes('**检索增强生成**'));
    assert.ok(markdown.includes('[来源链接](https://example.com/source)'));
    assert.ok(markdown.includes('```python\ndef answer():\n    return "RAG"\n```'));
    assert.ok(markdown.includes('````markdown'));
    assert.ok(markdown.includes('| 阶段 | 结果 |'));
    assert.ok(markdown.includes('文档 \\| 数据<br>下一行'));
    assert.ok(markdown.includes('| 无表头内容 | 第二列 |'));
    assert.ok(markdown.includes('~~过期内容~~'));
    assert.ok(markdown.includes('$E=mc^2$'));
    assert.ok(markdown.includes('$$\n\\frac{a_b}{c}\n$$'));
    assert.ok(markdown.includes('补充：支持连续导出。'));
    assert.ok(!markdown.includes('UNSELECTED_SECRET'));
    assert.ok(!markdown.includes('不应该导出的思考过程'));
    assert.ok(!markdown.includes('复制代码'));
    assert.ok(!markdown.includes('You said:'));
    assert.ok(!markdown.includes('重复公式'));
    assert.ok(!markdown.includes('RAG 学习笔记'));
    assert.ok(markdown.includes("\\<script\\>alert('文字')\\</script\\>"));
    await writeFile(path.join(artifactDir, `${entry.browser}-clipboard.md`), markdown);
  });
  await check('下载 .md 文件与复制内容逐字一致', async () => {
    const text = await ui.download(); assert.equal(text, markdown);
    await writeFile(path.join(artifactDir, `${entry.browser}-export.md`), text);
  });
  await check('可选导出标题、恢复标题、空标题与取消编辑', async () => {
    await ui.click('#settings-toggle'); await ui.click('#include-headings');
    const text = await ui.download(); assert.ok(text.includes('## RAG 学习笔记')); assert.ok(text.includes('\\<img'));
    await ui.click('.row:nth-child(1) .edit'); await ui.fill('.editor textarea', ' '); await ui.click('[data-edit="save"]');
    assert.ok((await status()).includes('标题不能为空')); await ui.click('[data-edit="cancel"]');
    await ui.click('.row:nth-child(1) .edit'); await ui.click('[data-edit="reset"]');
    assert.equal(await title(0), '解释 RAG，并给出 Markdown 示例');
    await ui.click('#settings-toggle');
  });
  await check('动态追加提问、暂无回复与生成中禁止残缺导出', async () => {
    await ui.eval(() => {
      const a = document.createElement('article'); a.dataset.testid = 'conversation-turn-7';
      a.innerHTML = '<div data-message-author-role="user" data-message-id="user-4"><div class="whitespace-pre-wrap">新增问题</div></div>'; document.querySelector('main').append(a);
    });
    await wait(async () => await rows() === 4, 'new turn');
    await ui.click('#select-none'); await ui.click('.row:nth-child(4) input'); await ui.click('#copy');
    assert.ok((await status()).includes('暂无可导出的回复'));
    await ui.eval(() => {
      const a = document.createElement('article'); a.innerHTML = '<div data-message-author-role="assistant"><div class="markdown"><p>生成中的回答</p></div></div><button data-testid="stop-button">停止</button>'; document.querySelector('main').append(a);
    });
    await wait(async () => await shadow(root => root.querySelectorAll('.meta')[3].textContent) === '模型回复', 'streaming answer');
    await ui.click('#copy'); assert.ok((await status()).includes('正在生成'));
    await ui.eval(() => { document.querySelector('[data-testid="stop-button"]').remove(); document.querySelector('main article:last-child .markdown p').textContent = '已经完成的回答'; });
    const text = await ui.download(); assert.ok(text.includes('已经完成的回答')); assert.ok(!text.includes('生成中的回答'));
  });
  await check('收起、展开、刷新保留偏好与窄屏', async () => {
    await ui.click('#collapse'); assert.equal(await shadow(root => root.querySelector('.panel').hidden), true);
    await ui.reload(); await wait(async () => !!await shadow(root => root?.querySelector('#expand') && !root.querySelector('#expand').hidden), 'collapsed preference');
    await ui.click('#expand'); await ui.resize(390, 740);
    const rect = await shadow(root => { const r = root.querySelector('.panel').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight }; });
    assert.ok(rect.left >= 0 && rect.right <= rect.width && rect.bottom <= rect.height);
    await ui.resize(1440, 1000);
    await ui.shortcut(); assert.equal(await shadow(root => root.querySelector('.panel').hidden), true);
    await ui.shortcut(); assert.equal(await shadow(root => root.querySelector('.panel').hidden), false);
  });
  await check('SPA 会话切换与标题按会话隔离、前进后退恢复', async () => {
    await ui.click('.row:nth-child(1) .edit'); await ui.fill('.editor textarea', '会话 A 的私有标题'); await ui.click('[data-edit="save"]');
    await ui.eval(() => history.pushState({}, '', '/c/fixture-secondary'));
    await wait(async () => await title(0) === '解释 RAG，并给出 Markdown 示例', 'secondary conversation titles');
    assert.equal(await shadow(root => root.querySelector('#selected-count').textContent), '已选 0');
    await ui.eval(() => history.back()); await wait(async () => await title(0) === '会话 A 的私有标题', 'back restores titles');
  });
  await check('深色主题、自定义标题重置与全选清空', async () => {
    await ui.eval(() => document.documentElement.classList.add('dark'));
    await wait(async () => await ui.eval(() => document.querySelector('#conversation-navigator-root').hasAttribute('data-dark')), 'dark theme');
    await ui.click('#settings-toggle'); await ui.click('#forget-titles'); assert.equal(await title(0), '解释 RAG，并给出 Markdown 示例');
    await ui.click('#settings-toggle'); await ui.click('#select-all'); assert.equal(await shadow(root => root.querySelector('#selected-count').textContent), '已选 3');
    await ui.click('#select-none'); assert.equal(await shadow(root => root.querySelector('#copy').disabled), true);
    await ui.screenshot(path.join(artifactDir, `${entry.browser}-panel.png`));
  });
  await check('无消息 ID 的兼容模式、重复问题稳定区分', async () => {
    await ui.goto('/c/fixture-fallback'); await wait(async () => await rows() === 2, 'fallback turns');
    assert.equal(await title(0), '重复提问'); assert.equal(await title(1), '重复提问');
    await ui.click('#settings-toggle'); await ui.select('#compatibility', 'compatibility'); await ui.click('#settings-toggle');
    await ui.click('.row:nth-child(2) .edit'); await ui.fill('.editor textarea', '第二个重复问题'); await ui.click('[data-edit="save"]');
    await ui.reload(); await wait(async () => await title(1) === '第二个重复问题', 'fallback rename persists');
    assert.equal(await title(0), '重复提问');
    await ui.click('#select-all'); const text = await ui.download(); assert.ok(text.includes('兼容回复一') && text.includes('兼容回复二'));
  });
  await check('新对话从草稿地址迁移为正式会话时保留标题', async () => {
    await ui.goto('/'); await wait(async () => await rows() === 3, 'draft conversation');
    await ui.click('.row:nth-child(1) .edit'); await ui.fill('.editor textarea', '草稿中的自定义标题'); await ui.click('[data-edit="save"]');
    await ui.click('.row:nth-child(1) input');
    await ui.eval(() => history.pushState({}, '', '/c/new-conversation'));
    await wait(async () => await title(0) === '草稿中的自定义标题' && await shadow(root => root.querySelector('#selected-count').textContent) === '已选 0', 'draft migration');
    await ui.reload(); await wait(async () => await title(0) === '草稿中的自定义标题', 'migrated persistence');
  });
  await check('用户提供的新版 DOM：没有旧角色与 article 仍识别提问', async () => {
    await ui.goto('/c/fixture-modern'); await wait(async () => await rows() === 2, 'modern shell two user turns');
    assert.equal(await ui.eval(() => document.querySelectorAll('article, [data-message-author-role], [data-turn], [data-testid^="conversation-turn"]').length), 0);
    assert.equal(await title(0), '相同提问：新版页面适配'); assert.equal(await title(1), '相同提问：新版页面适配');
    await ui.click('#settings-toggle'); await ui.select('#compatibility', 'auto'); await ui.click('#settings-toggle');
    await wait(async () => await rows() === 2, 'modern auto mode');
    await ui.click('.row:nth-child(2) .jump');
    await wait(async () => await ui.eval(() => { const box = document.querySelector('[data-turn-key="modern-2"] [data-user-message-bubble]').getBoundingClientRect(); return box.top >= 0 && box.bottom < innerHeight; }), 'modern nested scroll navigation');
    await ui.screenshot(path.join(artifactDir, `${entry.browser}-modern.png`));
  });
  await check('新版 DOM：重复提问独立改名并刷新保留', async () => {
    await ui.click('.row:nth-child(2) .edit'); await ui.fill('.editor textarea', '新版第二个提问'); await ui.click('[data-edit="save"]');
    await ui.reload(); await wait(async () => await title(1) === '新版第二个提问', 'modern title persistence');
    assert.equal(await title(0), '相同提问：新版页面适配');
    await ui.click('#settings-toggle'); await ui.select('#compatibility', 'compatibility'); await ui.click('#settings-toggle');
    await wait(async () => await rows() === 2, 'modern compatibility mode');
  });
  await check('新版 DOM：复制与下载只包含回复正文且保留四级标题', async () => {
    await ui.click('#settings-toggle');
    if (await shadow(root => root.querySelector('#include-headings').checked)) await ui.click('#include-headings');
    await ui.click('#settings-toggle'); await ui.click('#select-all'); await ui.click('#copy');
    await wait(async () => (await status()).includes('已复制 2'), 'modern clipboard write');
    // The modern shell fixture has no spare input; paste into an independent test-only input.
    await ui.eval(() => { const input = document.createElement('textarea'); input.id = 'paste-target'; document.body.append(input); });
    const text = await ui.paste();
    assert.ok(text.includes('#### 需要保留的四级标题'));
    assert.ok(text.includes('新版回复一') && text.includes('新版回复二'));
    assert.equal((text.match(/新版回复一/g) || []).length, 1); assert.equal((text.match(/新版回复二/g) || []).length, 1);
    assert.ok(text.includes('```python\nprint("modern")\n```'));
    assert.ok(!text.includes('正文外的操作文字')); assert.ok(!text.includes('相同提问'));
    assert.equal(await ui.download(), text);
    await writeFile(path.join(artifactDir, `${entry.browser}-modern-export.md`), text);
    // Add the legacy role attributes to the SAME messages: modern/legacy must not duplicate.
    await ui.eval(() => {
      for (const node of document.querySelectorAll('[data-user-message-bubble]')) node.setAttribute('data-message-author-role', 'user');
      for (const node of document.querySelectorAll('[data-chatgpt-selection-message-id]')) node.setAttribute('data-message-author-role', 'assistant');
    });
    await wait(async () => await rows() === 2, 'mixed markers deduplicated');
    const mixed = await ui.download(); assert.equal(mixed, text);
  });
  await check('兼容轮次 display:contents 与 main 外结构', async () => {
    for (const route of ['/c/fixture-contents', '/c/fixture-outside-main']) {
      await ui.goto(route); await wait(async () => await rows() === 2, 'compatibility layout');
      assert.equal(await title(0), '重复提问'); await ui.click('#select-all');
      const text = await ui.download(); assert.ok(text.includes('兼容回复一') && text.includes('兼容回复二'));
    }
  });
  await check(userscriptMode ? '真实 Tampermonkey 菜单注册与导航开关' : '工具栏弹出页渲染与内容脚本消息开关', async () => { await ui.popup(); await pause(300); });
  }
  const offset = index => ui.eval(index => {
    const scroller = document.querySelector('.thread-scroll-container');
    const target = document.querySelector(`[data-turn-key="scroll-${index}"] [data-user-message-bubble]`);
    return target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientTop;
  }, index);
  await check('单击跳转：DOM 同键重建后仍定位当前节点', async () => {
    await ui.goto('/c/fixture-scroll-reverse'); await wait(async () => await rows() === 12, 'scroll turns');
    await ui.eval(() => { const target = document.querySelector('[data-turn-key="scroll-1"] [data-user-message-bubble]'); target.replaceWith(target.cloneNode(true)); });
    await pause(350);
    await ui.click('.row[data-key="id:scroll-1"] .jump');
    assert.ok(Math.abs(await offset(1) - 24) <= 3, 'one native click immediately aligns the current node');
    assert.equal(await ui.eval(() => window.navigationClicks), 1);
  });
  await check('单击跳转：正向和反向长列表逐项定位无需补点', async () => {
    entry.navigationSamples = [];
    for (const layout of ['normal', 'reverse']) {
      await ui.goto(`/c/fixture-scroll-${layout}`); await wait(async () => await rows() === 12, 'scroll list');
      for (const index of [1, 9, 3, 12, 6, 2]) {
        const before = await ui.eval(() => window.navigationClicks);
        await ui.click(`.row[data-key="id:scroll-${index}"] .jump`);
        const immediate = await offset(index);
        assert.ok(Math.abs(immediate - 24) <= 3, `${layout} question ${index} immediate offset ${immediate}`);
        await pause(1200);
        const settled = await offset(index);
        assert.ok(Math.abs(settled - 24) <= 3, `${layout} question ${index} settled offset ${settled}`);
        assert.equal(await ui.eval(() => window.navigationClicks), before + 1);
        entry.navigationSamples.push({ layout, index, clicks: 1, immediateOffset: immediate, settledOffset: settled });
      }
    }
  });
  await check('单击跳转：延迟重排与节点替换后自动校正', async () => {
    await ui.goto('/c/fixture-scroll-reverse'); await wait(async () => await rows() === 12, 'late layout');
    await ui.eval(() => window.armLayoutChange(7));
    await ui.click('.row[data-key="id:scroll-7"] .jump');
    assert.ok(Math.abs(await offset(7) - 24) <= 3);
    await pause(1400); assert.ok(Math.abs(await offset(7) - 24) <= 3);
    assert.equal(await ui.eval(() => window.navigationClicks), 1);
    await ui.click('.row[data-key="id:scroll-2"] .jump');
    await ui.click('.row[data-key="id:scroll-10"] .jump');
    await pause(1200); assert.ok(Math.abs(await offset(10) - 24) <= 3, 'latest click wins');
    await ui.screenshot(path.join(artifactDir, `${entry.browser}-single-click.png`));
  });
  await check('窗口化会话：自动发现所有提问并恢复原滚动位置', async () => {
    await ui.goto('/c/fixture-virtual');
    await wait(async () => await ui.eval(() => document.querySelector('#conversation-navigator-root')?.dataset.discovery) === 'complete', 'full discovery');
    assert.equal(await rows(), 16);
    assert.equal(await title(0), '第 1 个窗口化提问：项目应保留并能选择删除');
    assert.equal(await title(15), '第 16 个窗口化提问：项目应保留并能选择删除');
    assert.ok(await ui.eval(() => document.querySelectorAll('[data-user-message-bubble]').length) < 16);
    assert.ok(Math.abs(await ui.eval(() => document.querySelector('.thread-scroll-container').scrollTop)) < 2);
  });
  await check('窗口化会话：未渲染项目单击定位且目录不丢项', async () => {
    for (const index of [1, 12, 5, 16]) {
      const before = await ui.eval(() => window.navigationClicks);
      await ui.click(`.row[data-key="id:virtual-${index}"] .jump`);
      await wait(async () => await ui.eval(index => {
        const target = document.querySelector(`[data-turn-key="virtual-${index}"] [data-user-message-bubble]`);
        if (!target) return false;
        const s = document.querySelector('.thread-scroll-container');
        return Math.abs(target.getBoundingClientRect().top - s.getBoundingClientRect().top - s.clientTop - 16) <= 3;
      }, index), 'virtualized single-click navigation');
      await pause(1100); assert.equal(await rows(), 16);
      assert.equal(await ui.eval(() => window.navigationClicks), before + 1);
    }
  });
  await check('导航真实滚轮：上下滚动和边界不带动会话页面', async () => {
    await shadow(root => { root.querySelector('.list').scrollTop = 0; });
    const before = await ui.eval(() => document.querySelector('.thread-scroll-container').scrollTop);
    await ui.wheel('.list', 650);
    await wait(async () => await shadow(root => root.querySelector('.list').scrollTop) > 100, 'real wheel scrolls navigation');
    assert.ok(Math.abs(await ui.eval(() => document.querySelector('.thread-scroll-container').scrollTop) - before) < 2);
    await ui.wheel('.list', -1500); await wait(async () => await shadow(root => root.querySelector('.list').scrollTop) === 0, 'wheel up');
    await ui.wheel('.list', -700); assert.ok(Math.abs(await ui.eval(() => document.querySelector('.thread-scroll-container').scrollTop) - before) < 2);
    assert.equal(await rows(), 16);
  });
  await check('回复 H1 子导航：默认关闭、只读、定位和收起', async () => {
    assert.equal(await shadow(root => root.querySelectorAll('.heading-jump').length), 0);
    await ui.click('.row[data-key="id:virtual-3"] .heading-toggle');
    assert.equal(await shadow(root => root.querySelector('.row[data-key="id:virtual-3"] .heading-list').querySelectorAll('.heading-jump').length), 2);
    assert.equal(await shadow(root => root.querySelectorAll('.heading-list .edit, .heading-list .delete, .heading-list input').length), 0);
    assert.ok(!await shadow(root => root.querySelector('.heading-list').textContent.includes('二级标题')));
    await ui.click('.row[data-key="id:virtual-3"] .heading-list > .heading-item:nth-child(1) > .heading-line > .heading-jump');
    await wait(async () => await ui.eval(() => {
      const h = document.querySelector('[data-turn-key="virtual-3"] h1'); if(!h)return false;
      const s = document.querySelector('.thread-scroll-container'); return Math.abs(h.getBoundingClientRect().top-s.getBoundingClientRect().top-s.clientTop-16)<=3;
    }), 'H1 navigation');
    await pause(1100);
    await ui.click('.row[data-key="id:virtual-3"] .heading-list > .heading-item:nth-child(2) > .heading-line > .heading-jump');
    await wait(async () => await ui.eval(() => {
      const h = document.querySelectorAll('[data-turn-key="virtual-3"] h1')[1]; if(!h)return false;
      const s = document.querySelector('.thread-scroll-container'); return Math.abs(h.getBoundingClientRect().top-s.getBoundingClientRect().top-s.clientTop-16)<=3;
    }), 'second H1 navigation');
    await ui.click('.row[data-key="id:virtual-3"] .heading-toggle');
    assert.equal(await shadow(root => root.querySelectorAll('.heading-jump').length), 0);
  });
  await check('删除导航：不删原始消息、不被重新发现、刷新保留', async () => {
    await ui.click('#select-all'); await ui.click('.row[data-key="id:virtual-3"] .delete');
    assert.equal(await rows(), 15); assert.equal(await shadow(root => root.querySelector('#selected-count').textContent), '已选 15');
    assert.ok(await ui.eval(() => !!document.querySelector('[data-turn-key="virtual-3"]')));
    assert.equal(await shadow(root => !!root.querySelector('.row[data-key="id:virtual-3"]')), false);
    const md = await ui.download(); assert.ok(!md.includes('窗口化回复 3\n')); assert.ok(md.includes('窗口化回复 1'));
    await ui.reload(); await wait(async () => await ui.eval(() => document.querySelector('#conversation-navigator-root')?.dataset.discovery) === 'complete', 'reload discovery');
    assert.equal(await rows(), 15); assert.equal(await shadow(root => !!root.querySelector('.row[data-key="id:virtual-3"]')), false);
    assert.equal(await shadow(root => root.querySelectorAll('.heading-jump').length), 0);
    await ui.goto('/c/fixture-virtual-other'); await wait(async () => await rows() === 16, 'deletion per conversation');
    await ui.screenshot(path.join(artifactDir, `${entry.browser}-navigation-full.png`));
  });
  await check('定位过程中用户手动滚动可接管控制', async () => {
    await ui.goto('/c/fixture-scroll-reverse'); await wait(async () => await rows() === 12, 'user control');
    await ui.click('.row[data-key="id:scroll-5"] .jump');
    const before = await ui.eval(() => document.querySelector('.thread-scroll-container').scrollTop);
    await ui.manualScroll(); await pause(600);
    const manual = await ui.eval(() => document.querySelector('.thread-scroll-container').scrollTop);
    assert.ok(Math.abs(manual - before) > 20, 'real scroll key moves the conversation');
    await pause(700);
    assert.ok(Math.abs(await ui.eval(() => document.querySelector('.thread-scroll-container').scrollTop) - manual) < 2, 'navigator does not pull the user back');
  });
  }
  if (!process.env.TEST_ONLY_NAVIGATION) await experienceTests(ui, { check, shadow, wait, pause, artifactDir, entry });
  }
  if (!process.env.TEST_ONLY_EXPERIENCE && !process.env.TEST_ONLY_NAVIGATION) await navigationRegressions(ui, { check, shadow, wait, pause, entry });
  }
  if (!process.env.TEST_ONLY_READING && !process.env.TEST_ONLY_FORMULAS && !process.env.TEST_ONLY_HEADINGS && (process.env.TEST_ONLY_DISTANT || (!process.env.TEST_ONLY_STARTUP && !process.env.TEST_ONLY_EXPERIENCE && !process.env.TEST_ONLY_NAVIGATION))) await distantNavigationTests(ui, { check, shadow, wait, pause, entry });
  if (!process.env.TEST_ONLY_READING && !process.env.TEST_ONLY_FORMULAS && (process.env.TEST_ONLY_HEADINGS || (!process.env.TEST_ONLY_DISTANT && !process.env.TEST_ONLY_STARTUP && !process.env.TEST_ONLY_EXPERIENCE && !process.env.TEST_ONLY_NAVIGATION))) await headingOutlineTests(ui, { check, shadow, wait, pause, artifactDir, entry });
  if (!process.env.TEST_ONLY_READING && (process.env.TEST_ONLY_FORMULAS || (!process.env.TEST_ONLY_HEADINGS && !process.env.TEST_ONLY_DISTANT && !process.env.TEST_ONLY_STARTUP && !process.env.TEST_ONLY_EXPERIENCE && !process.env.TEST_ONLY_NAVIGATION))) await formulaCopyTests(ui, { check, shadow, wait, pause, artifactDir, entry });
  if (process.env.TEST_ONLY_READING || (!process.env.TEST_ONLY_FORMULAS && !process.env.TEST_ONLY_HEADINGS && !process.env.TEST_ONLY_DISTANT && !process.env.TEST_ONLY_STARTUP && !process.env.TEST_ONLY_EXPERIENCE && !process.env.TEST_ONLY_NAVIGATION)) await readingPositionTests(ui, { check, shadow, wait, pause, artifactDir, entry });
  if (ui.errors.length) throw new Error(`Browser errors: ${ui.errors.join('\n')}`);
}

const htmlFor = url => url.includes('fixture-reading-') ? readingConversation(url.split('fixture-reading-')[1].split(/[?#]/)[0])
  : url.includes('fixture-formula') ? formulaConversation
  : url.includes('fixture-heading-virtual') ? recycledConversation(false, 64, true)
  : url.includes('fixture-recycled-') ? recycledConversation(url.includes('reverse'))
  : url.includes('fixture-preloaded-tall') ? preloadedTallConversation()
  : url.includes('fixture-experience-100') ? scrollConversation(false, 100)
  : url.includes('fixture-scroll-') ? scrollConversation(url.includes('reverse'))
  : url.includes('fixture-virtual') ? virtualConversation()
  : url.includes('fixture-modern') ? modernConversation
  : url.includes('fixture-contents') ? fallbackConversation.replaceAll('<article ', '<article style="display:contents" ')
  : url.includes('fixture-outside-main') ? fallbackConversation.replace('<main>', '<section>').replace('</main>', '</section>')
  : url.includes('fixture-fallback') ? fallbackConversation : conversation;
const browserList = (process.env.TEST_BROWSERS || 'chromium,firefox').split(',');
if (browserList.includes('chromium')) {
  const entry = { browser: 'chromium', engine: '', extension: 'dist/chrome manifest unchanged, --load-extension', tests: [] }; report.browsers.push(entry);
  const profile = await mkdtemp(path.join(tmpdir(), 'navigator-chromium-'));
  let context;
  try {
    const chromeExtension = userscriptMode ? path.join(managerDirectory, 'chrome') : path.join(extensionRoot, 'chrome');
    if (userscriptMode) {
      await mkdir(path.join(profile, 'Default'), { recursive: true });
      await writeFile(path.join(profile, 'Default/Preferences'), JSON.stringify({ extensions: { ui: { developer_mode: true } } }));
      entry.manager = JSON.parse(await readFile(path.join(managerDirectory, 'sources.json'), 'utf8')).chrome;
      entry.extension = 'Official Tampermonkey CRX unpacked with original ID; own WebExtension NOT loaded; production .user.js imported through manager UI';
    }
    context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, ignoreDefaultArgs: ['--hide-scrollbars'], locale: 'en-US', viewport: { width: 1440, height: 1000 }, args: [`--disable-extensions-except=${chromeExtension}`, `--load-extension=${chromeExtension}`] });
    entry.engine = context.browser()?.version();
    await context.route('https://chatgpt.com/**', route => route.fulfill({ contentType: 'text/html', body: htmlFor(route.request().url()) }));
    const page = await context.newPage();
    if (userscriptMode) await installChromeScript(context, page, path.join(root, 'dist/userscript/chatgpt-conversation-navigator.user.js'));
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const ui = {
      errors, eval: (fn, arg) => page.evaluate(fn, arg),
      goto: route => page.goto(`https://chatgpt.com${route}`), reload: () => page.reload(),
      pageFill: (selector,value) => page.locator(selector).fill(value),
      pageKey: (selector,key) => page.locator(selector).press(key),
      pageClick: selector => page.locator(selector).click(),
      async pageScrollbar(selector) { const p=await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.right-11,y:r.top+el.clientHeight*(el.scrollTop+el.clientHeight/2)/el.scrollHeight}}); await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x,p.y+100,{steps:10});await page.mouse.up(); },
      doubleClick: selector => page.locator(selector).dblclick(),
      async pageWheel(selector,delta) { const r=await page.locator(selector).boundingBox(); await page.mouse.move(r.x+Math.min(r.width/2,350),r.y+Math.min(r.height/2,180)); await page.mouse.wheel(0,delta); },
      click: selector => page.locator(`#conversation-navigator-root ${selector}`).click(),
      press: (selector, key) => page.locator(`#conversation-navigator-root ${selector}`).press(key),
      fill: (selector, value) => page.locator(`#conversation-navigator-root ${selector}`).fill(value),
      select: (selector, value) => page.locator(`#conversation-navigator-root ${selector}`).selectOption(value),
      resize: (width, height) => page.setViewportSize({ width, height }),
      screenshot: file => page.screenshot({ path: file }),
      shortcut: () => page.keyboard.press('Alt+Shift+N'),
      manualScroll: () => page.locator('.thread-scroll-container').press('PageDown'),
      async wheel(selector, delta) { const rect = await page.locator(`#conversation-navigator-root ${selector}`).boundingBox(); await page.mouse.move(rect.x + rect.width/2, rect.y + rect.height/2); await page.mouse.wheel(0, delta); },
      async paste() { await page.locator('#paste-target').fill(''); await page.locator('#paste-target').focus(); await page.keyboard.press('Control+V'); return page.locator('#paste-target').inputValue(); },
      async download() { const [download] = await Promise.all([page.waitForEvent('download'), ui.click('#export')]); const file = await download.path(); assert.ok(download.suggestedFilename().endsWith('.md')); return readFile(file, 'utf8'); },
      async popup() {
        if (userscriptMode) {
          const popup = await context.newPage();
          await popup.goto(`chrome-extension://${chromeManagerId}/action.html`);
          const tabId = await popup.evaluate(async () => (await chrome.tabs.query({})).find(tab => tab.url?.startsWith('https://chatgpt.com/')).id);
          await popup.evaluate(id => chrome.tabs.update(id, { active: true }), tabId);
          await popup.reload();
          await popup.getByText('显示 / 收起对话导航', { exact: true }).click();
          await wait(async () => !await page.locator('#conversation-navigator-root .panel').isVisible(), 'GM menu toggles panel');
          if (!popup.isClosed()) await popup.close();
          await page.bringToFront(); await ui.click('#expand');
          return;
        }
        const session = await context.newCDPSession(page); const targets = await session.send('Target.getTargets');
        let id = targets.targetInfos.find(t => t.url.startsWith('chrome-extension://'))?.url.split('/')[2];
        if (!id) {
          // The extension has no background worker; Chrome's extensions page exposes its assigned ID.
          const inventory = await context.newPage(); await inventory.goto('chrome://extensions/');
          id = await inventory.evaluate(() => document.querySelector('extensions-manager').shadowRoot.querySelector('extensions-item-list').shadowRoot.querySelector('extensions-item')?.id);
          await inventory.close();
        }
        assert.ok(id, 'extension registered in chrome://extensions');
        const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
        assert.equal(await popup.locator('h1').textContent(), '对话导航');
        const tabId = await popup.evaluate(async () => (await chrome.tabs.query({})).find(tab => tab.url?.includes('chatgpt.com')).id);
        // Exercise the identical extension-to-content-script message used by the toolbar popup.
        await popup.evaluate(tabId => chrome.tabs.sendMessage(tabId, { type: 'conversation-navigator:toggle' }), tabId);
        assert.equal(await page.locator('#conversation-navigator-root .panel').isVisible(), false);
        await popup.evaluate(tabId => chrome.tabs.sendMessage(tabId, { type: 'conversation-navigator:toggle' }), tabId);
        assert.equal(await page.locator('#conversation-navigator-root .panel').isVisible(), true);
        await popup.close();
        await page.bringToFront();
      }
    };
    await sharedTests(ui, entry);
  } catch (error) { entry.error = error.stack; failures.push(error); console.error(error); }
  finally { await context?.close(); await rm(profile, { recursive: true, force: true }); }
}

if (browserList.includes('firefox')) {
  const entry = { browser: 'firefox', engine: '', extension: 'dist/firefox content unchanged; test-only HTTP chatgpt.com match added, browser-local HTTP proxy returns synthetic fixture without contacting ChatGPT', tests: [] }; report.browsers.push(entry);
  await mkdir(path.join(root, '.test-profiles'), { recursive: true });
  const scratch = await mkdtemp(path.join(root, '.test-profiles', 'navigator-firefox-'));
  let driver, server;
  try {
    const downloadDir = path.join(scratch, 'downloads'); await mkdir(downloadDir);
    const addonDir = path.join(scratch, 'addon'); await cp(path.join(extensionRoot, 'firefox'), addonDir, { recursive: true });
    const manifest = JSON.parse(await readFile(path.join(addonDir, 'manifest.json')));
    manifest.host_permissions.push('http://chatgpt.com/*'); manifest.content_scripts[0].matches.push('http://chatgpt.com/*');
    await writeFile(path.join(addonDir, 'manifest.json'), JSON.stringify(manifest));
    let addon = path.join(scratch, 'addon.xpi'); execFileSync('zip', ['-q', '-r', addon, '.'], { cwd: addonDir });
    if (userscriptMode) {
      addon = path.join(managerDirectory, 'firefox.xpi');
      entry.manager = JSON.parse(await readFile(path.join(managerDirectory, 'sources.json'), 'utf8')).firefox;
      entry.extension = 'Official signed Tampermonkey XPI; own WebExtension NOT installed; UI-imported userscript with test-only HTTP ChatGPT match';
    }
    server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html;charset=utf-8' }); res.end(htmlFor(req.url)); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://chatgpt.com';
    const extensionUUID = '899ba7fd-f617-42b7-a118-6c75fb4be955';
    const options = new firefox.Options().addArguments('-headless').setBinary(process.env.FIREFOX_BINARY || '/snap/firefox/current/usr/lib/firefox/firefox')
      .setPreference('extensions.webextensions.uuids', JSON.stringify({ 'conversation-navigator@local.extension': extensionUUID, 'firefox@tampermonkey.net': firefoxManagerUUID }))
      .setPreference('intl.locale.requested', 'en-US')
      .setPreference('browser.download.folderList', 2).setPreference('browser.download.dir', downloadDir)
      .setPreference('browser.download.useDownloadDir', true).setPreference('browser.helperApps.neverAsk.saveToDisk', 'text/markdown,text/plain,application/octet-stream')
      .setPreference('browser.download.always_ask_before_handling_new_types', false)
      .setPreference('network.proxy.type', 1).setPreference('network.proxy.http', '127.0.0.1').setPreference('network.proxy.http_port', server.address().port)
      .setPreference('network.stricttransportsecurity.preloadlist', false)
      .setPreference('dom.security.https_only_mode', false).setPreference('dom.security.https_first', false).setPreference('dom.security.https_first_schemeless', false);
    await mkdir(path.join(root, '.test-profiles'), { recursive: true });
    const service = new firefox.ServiceBuilder(process.env.GECKODRIVER || '/snap/bin/geckodriver').addArguments('--profile-root', path.join(root, '.test-profiles'), '--allow-system-access').setStdio('inherit');
    driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();
    const capabilities = await driver.getCapabilities(); entry.engine = capabilities.get('browserVersion');
    entry.addonId = await driver.installAddon(addon, true);
    if (userscriptMode) await installFirefoxScript(driver, await firefoxTestScript(scratch));
    await driver.manage().window().setRect({ width: 1440, height: 1000 });
    const element = selector => driver.executeScript('return document.querySelector("#conversation-navigator-root").shadowRoot.querySelector(arguments[0])', selector);
    const ui = {
      errors: [], eval: (fn, arg) => driver.executeScript(`return (${fn.toString()})(arguments[0])`, arg ?? null),
      goto: async route => {
        await driver.get(`${origin}${route}`);
        // The manager may asynchronously open its welcome tab after installation.
        // Keep this synthetic conversation selected so Firefox does not throttle rAF.
        const content = await driver.getWindowHandle();
        for (const handle of await driver.getAllWindowHandles()) {
          if (handle !== content) { await driver.switchTo().window(handle); await driver.close(); }
        }
        await driver.switchTo().window(content);
        await wait(async () => await driver.executeScript('return document.visibilityState') === 'visible', 'foreground Firefox fixture');
      }, reload: () => driver.navigate().refresh(),
      click: async selector => {
        const content = await driver.getWindowHandle();
        for (const handle of await driver.getAllWindowHandles()) {
          if (handle !== content) { await driver.switchTo().window(handle); await driver.close(); }
        }
        await driver.switchTo().window(content);
        await wait(async () => await driver.executeScript('return document.visibilityState') === 'visible', 'foreground Firefox click');
        await (await element(selector)).click();
      },
      pageFill: async (selector,value) => {const el=await driver.findElement(By.css(selector));await el.clear();if(value)await el.sendKeys(value);},
      pageKey: async (selector,key) => (await driver.findElement(By.css(selector))).sendKeys(({Enter:Key.ENTER,'Shift+Enter':Key.chord(Key.SHIFT,Key.ENTER)})[key]||key),
      pageClick: async selector => (await driver.findElement(By.css(selector))).click(),
      async pageWheel(selector,delta) { const point=await driver.executeScript('const r=document.querySelector(arguments[0]).getBoundingClientRect();return {x:Math.round(r.x+Math.min(r.width/2,350)),y:Math.round(r.y+Math.min(r.height/2,180))}',selector); await driver.actions({async:true}).scroll(point.x,point.y,0,delta).perform(); },
      async pageScrollbar(selector) { const p=await driver.executeScript('const el=document.querySelector(arguments[0]),r=el.getBoundingClientRect();return {x:Math.round(r.right-11),y:Math.round(r.top+el.clientHeight*(el.scrollTop+el.clientHeight/2)/el.scrollHeight)}',selector); await driver.actions({async:true}).move({x:p.x,y:p.y}).press().move({x:p.x,y:p.y+100,duration:250}).release().perform(); },
      doubleClick: async selector => {
        const content = await driver.getWindowHandle();
        for (const handle of await driver.getAllWindowHandles()) {
          if (handle !== content) { await driver.switchTo().window(handle); await driver.close(); }
        }
        await driver.switchTo().window(content);
        const target = await driver.findElement(By.css(selector));
        await driver.executeScript('arguments[0].scrollIntoView({block:"center"})',target);
        await driver.actions({async:true}).doubleClick(target).perform();
      },
      press: async (selector, key) => (await element(selector)).sendKeys(({Enter: Key.ENTER, Escape: Key.ESCAPE, Space: Key.SPACE, Tab: Key.TAB})[key] || key),
      fill: async (selector, value) => { const el = await element(selector); await el.clear(); if (value) await el.sendKeys(value); else await driver.executeScript('arguments[0].dispatchEvent(new Event("input", {bubbles:true}))', el); },
      select: async (selector, value) => driver.executeScript('const el=document.querySelector("#conversation-navigator-root").shadowRoot.querySelector(arguments[0]);el.value=arguments[1];el.dispatchEvent(new Event("change",{bubbles:true}))', selector, value),
      resize: (width, height) => driver.manage().window().setRect({ width, height }),
      screenshot: async file => writeFile(file, await driver.takeScreenshot(), 'base64'),
      shortcut: async () => (await driver.findElement(By.css('body'))).sendKeys(Key.chord(Key.ALT, Key.SHIFT, 'n')),
      manualScroll: async () => (await driver.findElement(By.css('.thread-scroll-container'))).sendKeys(Key.PAGE_DOWN),
      async wheel(selector, delta) {
        const point = await driver.executeScript('const r=document.querySelector("#conversation-navigator-root").shadowRoot.querySelector(arguments[0]).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}', selector);
        await driver.actions({async:true}).scroll(point.x,point.y,0,delta).perform();
      },
      async paste() { const el = await driver.findElement(By.id('paste-target')); await el.clear(); await el.sendKeys(Key.chord(Key.CONTROL, 'v')); return el.getAttribute('value'); },
      async download() {
        const { readdir } = await import('node:fs/promises');
        const before = new Set(await readdir(downloadDir)); await ui.click('#export'); let file;
        await wait(async () => { file = (await readdir(downloadDir)).find(name => !before.has(name) && name.endsWith('.md')); return !!file; }, 'Firefox Markdown download');
        return readFile(path.join(downloadDir, file), 'utf8');
      },
      async popup() {
        if (userscriptMode) {
          const original = await driver.getWindowHandle();
          await driver.switchTo().newWindow('tab');
          await driver.get(`moz-extension://${firefoxManagerUUID}/action.html`);
          const tabId = await driver.executeAsyncScript(`const done=arguments[arguments.length-1];browser.tabs.query({}).then(tabs=>done(tabs.find(tab=>tab.url?.startsWith('http://chatgpt.com/')).id));`);
          await driver.executeAsyncScript(`const done=arguments[arguments.length-1];browser.tabs.update(arguments[0],{active:true}).then(()=>done(true));`,tabId);
          await driver.navigate().refresh();
          const menu = await driver.wait(async () => { const items=await driver.findElements(By.xpath('//*[text()="显示 / 收起对话导航"]'));return items[0]||false; },12000);
          await menu.click();
          const handles=await driver.getAllWindowHandles();
          await driver.switchTo().window(original);
          await wait(async () => await ui.eval(() => document.querySelector('#conversation-navigator-root').shadowRoot.querySelector('.panel').hidden), 'Firefox GM menu');
          for(const handle of handles.filter(handle=>handle!==original)){await driver.switchTo().window(handle);await driver.close();}
          await driver.switchTo().window(original);
          await ui.click('#expand');
          return;
        }
        const contentHandle = await driver.getWindowHandle();
        await driver.switchTo().newWindow('tab');
        await driver.get(`moz-extension://${extensionUUID}/popup.html`);
        assert.equal(await driver.findElement(By.css('h1')).getText(), '对话导航');
        const tabId = await driver.executeAsyncScript(`const done=arguments[arguments.length-1];browser.tabs.query({}).then(tabs=>done(tabs.find(tab=>tab.url?.startsWith('http://chatgpt.com/')).id));`);
        await driver.executeAsyncScript(`const done=arguments[arguments.length-1];browser.tabs.sendMessage(arguments[0],{type:'conversation-navigator:toggle'}).then(()=>done(true));`, tabId);
        await driver.switchTo().window(contentHandle);
        assert.equal(await ui.eval(() => document.querySelector('#conversation-navigator-root').shadowRoot.querySelector('.panel').hidden), true);
        const handles = await driver.getAllWindowHandles();
        await driver.switchTo().window(handles.find(handle => handle !== contentHandle)); await driver.close(); await driver.switchTo().window(contentHandle);
        await ui.click('#expand');
      }
    };
    await sharedTests(ui, entry);
  } catch (error) {
    entry.error = error.stack; failures.push(error); console.error(error);
    if (driver) {
      try { entry.failureState = await driver.executeScript('return {url:location.href,title:document.title,body:document.body.innerText.slice(0,1000),extension:!!document.querySelector("#conversation-navigator-root"),roleNodes:document.querySelectorAll("[data-message-author-role]").length}'); await writeFile(path.join(artifactDir, 'firefox-failure.png'), await driver.takeScreenshot(), 'base64'); console.error(entry.failureState); } catch {}
    }
  }
  finally { await driver?.quit(); if (server) await new Promise(resolve => server.close(resolve)); await rm(scratch, { recursive: true, force: true }); }
}
report.finished = new Date().toISOString(); report.passed = failures.length === 0;
report.extensionRoot = extensionRoot;
report.bundleSHA256 = Object.fromEntries(await Promise.all(['chrome/content.js', 'chrome/manifest.json', 'firefox/content.js', 'firefox/manifest.json'].map(async file => [`dist/${file}`, createHash('sha256').update(await readFile(path.join(extensionRoot, file))).digest('hex')])));
if (userscriptMode) report.userscriptSHA256 = createHash('sha256').update(await readFile('dist/userscript/chatgpt-conversation-navigator.user.js')).digest('hex');
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(`Report: ${reportPath}`);
if (failures.length) process.exitCode = 1;
