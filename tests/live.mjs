import { chromium } from 'playwright';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

await mkdir('artifacts/live', { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), 'navigator-live-'));
const report = { started: new Date().toISOString(), url: 'https://chatgpt.com/', isolatedProfile: true, requestInterception: false, signedIn: false, checks: [], limitation: '' };
let context;
try {
  const extension = path.resolve('dist/chrome');
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const page = await context.newPage();
  await page.goto(report.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.locator('#conversation-navigator-root').waitFor({ state: 'attached', timeout: 15000 });
  report.title = await page.title(); report.finalURL = page.url();
  report.checks.push({ name: '真实 ChatGPT 域名自动注入', passed: true });
  await page.screenshot({ path: 'artifacts/live/chatgpt-page.png' });
  const body = await page.locator('body').innerText();
  if (/verify you are human|checking your browser|just a moment|验证您是真人|请完成安全验证/i.test(body + report.title)) {
    report.limitation = '真实网站要求人机验证；没有绕过验证。已验证扩展在该域名注入，但不能验证登录后的对话。';
  } else {
    const composer = page.locator('#prompt-textarea');
    if (await composer.count() && await composer.isVisible()) {
      report.composer = await composer.evaluate(el => ({ tag: el.tagName, contentEditable: el.isContentEditable }));
      // A harmless test conversation is sent only if anonymous ChatGPT exposes a composer.
      await composer.fill('这是浏览器导航插件的功能测试。请用 Markdown 回复：标题“插件测试”，一段简短文字，以及一个内容为 print("ok") 的 Python 代码块。');
      const send = page.locator('[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="发送提示"]');
      if (await send.count() && await send.first().isEnabled()) {
        await send.first().click();
        try {
          await page.locator('[data-message-author-role="assistant"] .markdown').first().waitFor({ timeout: 45000 });
          await page.waitForFunction(() => !document.querySelector('[data-testid="stop-button"]'), { timeout: 45000 });
          report.checks.push({ name: '匿名真实对话生成', passed: true });
          const rows = page.locator('#conversation-navigator-root .row');
          await rows.first().waitFor(); report.turns = await rows.count();
          await rows.first().locator('.jump').click();
          await rows.first().locator('.edit').click();
          await page.locator('#conversation-navigator-root .editor textarea').fill('真实网页验证');
          await page.locator('#conversation-navigator-root [data-edit="save"]').click();
          await rows.first().locator('input').check();
          const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#conversation-navigator-root #export').click()]);
          await download.saveAs('artifacts/live/chatgpt-reply.md');
          await page.locator('#conversation-navigator-root #copy').click();
          const status = await page.locator('#conversation-navigator-root .status').innerText();
          report.checks.push({ name: '真实对话导航、改名、选择、下载', passed: true }, { name: '真实网页剪贴板写入状态', passed: status.includes('已复制') });
          await page.screenshot({ path: 'artifacts/live/chatgpt-conversation.png' });
        } catch (error) { report.limitation = `真实匿名会话未完成：${error.message}`; }
      } else report.limitation = '真实网页有输入框，但匿名状态无法发送；登录后的会话仍需验收。';
    } else report.limitation = '独立浏览器未登录，真实网站未提供可用的匿名输入框；登录后的会话仍需验收。';
  }
} catch (error) { report.limitation = `真实网站访问或注入未完成：${error.message}`; report.error = error.stack; }
finally { await context?.close(); await rm(profile, { recursive: true, force: true }); }
report.finished = new Date().toISOString();
report.fullConversationVerified = report.checks.some(item => item.name === '匿名真实对话生成' && item.passed);
await writeFile('artifacts/live/report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
