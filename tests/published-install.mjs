import { chromium } from 'playwright';
import { Builder, By } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromeManagerId, firefoxManagerUUID, installChromeScript } from './tampermonkey.mjs';
import { conversation } from './fixture.mjs';
import { readingConversation } from './reading-position.mjs';

const publicConversation = conversation.replace('<h2>第一份回复</h2>', '<h1>公开一级标题</h1><p style="height:1000px">公开安装验收</p><h2>公开二级标题</h2><p style="height:1000px">二级正文</p><h3 id="public-h3">公开三级标题</h3>');

// Tests the public distribution path in fresh profiles, without the author's login.
const root = process.cwd();
const artifacts = path.resolve(process.env.PUBLICATION_ARTIFACT_DIR || 'artifacts/publication');
const links = JSON.parse(await readFile(process.env.PUBLICATION_LINKS_FILE || 'tests/published-release.json', 'utf8'));
const testProxy = process.env.PUBLICATION_PROXY;
const receipt = { page: links.page, install: links.install, version: links.version, browsers: [] };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) {
  const end = Date.now() + 30000;
  while (Date.now() < end) { const result = await fn(); if (result) return result; await delay(100); }
  throw new Error(`Timed out: ${label}`);
}
await mkdir(artifacts, { recursive: true });

const chromeProfile = await mkdtemp(path.join(tmpdir(), 'navigator-public-chrome-'));
let context;
try {
  await mkdir(path.join(chromeProfile, 'Default'));
  await writeFile(path.join(chromeProfile, 'Default/Preferences'), JSON.stringify({ extensions: { ui: { developer_mode: true } } }));
  const manager = path.join(root, 'artifacts/tampermonkey/chrome');
  context = await chromium.launchPersistentContext(chromeProfile, { channel: 'chromium', headless: true,
    ...(testProxy ? { proxy: { server: testProxy } } : {}),
    locale: 'en-US', viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${manager}`, `--load-extension=${manager}`] });
  const page = await context.newPage();
  await page.goto('chrome://extensions/');
  await page.getByRole('button', { name: 'Details', exact: true }).first().click();
  const permission = page.getByRole('switch', { name: /^Allow User Scripts/ });
  if (await permission.getAttribute('aria-checked') !== 'true') await permission.click();
  await page.goto(`chrome-extension://${chromeManagerId}/options.html`);
  await page.getByText('Utilities', { exact: true }).waitFor();
  let upgradedContent = null;
  let upgradeFromVersion = null;
  if (process.env.PUBLICATION_UPGRADE_FROM) {
    const previousCode = await readFile(process.env.PUBLICATION_UPGRADE_FROM, 'utf8');
    upgradeFromVersion = previousCode.match(/^\/\/\s+@version\s+(\S+)/m)?.[1];
    assert.ok(upgradeFromVersion, 'old release version metadata');
    await installChromeScript(context, page, path.resolve(process.env.PUBLICATION_UPGRADE_FROM));
    await context.route('https://chatgpt.com/**', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('public-streaming-wheel') ? readingConversation('manual-composer') : route.request().url().includes('public-reading-short') ? readingConversation('short') : route.request().url().includes('public-reading-smoke') ? readingConversation('normal') : publicConversation }));
    upgradedContent = await context.newPage();
    await upgradedContent.goto('https://chatgpt.com/c/public-install-smoke');
    await until(() => upgradedContent.locator('#conversation-navigator-root .row').count().then(count => count === 3), 'old release runs before upgrade');
    assert.equal(await upgradedContent.locator('#conversation-navigator-root').getAttribute('data-version'), upgradeFromVersion);
    await upgradedContent.locator('#conversation-navigator-root .row[data-key="id:user-1"] .edit').click();
    await upgradedContent.locator('#conversation-navigator-root .editor textarea').fill('升级后应保留的标题');
    await upgradedContent.locator('#conversation-navigator-root [data-edit="save"]').click();
    await upgradedContent.locator('#conversation-navigator-root .row[data-key="id:user-2"] .delete').click();
    await until(() => upgradedContent.locator('#conversation-navigator-root .row').count().then(count => count === 2), 'old release deletion saved');
    await delay(300);
  }
  for (let attempt=0;;attempt++) {
    try { await page.goto(links.page, { waitUntil: 'domcontentloaded' }); break; }
    catch(error) { if(attempt>=2 || !/ERR_NETWORK_CHANGED|Timeout/.test(error.message))throw error; }
  }
  const install = page.getByRole('link', { name: /^(安装此脚本|更新到 .+ 版本)$/ });
  assert.equal(await install.getAttribute('href'), links.install);
  const previousInstallers = new Set(context.pages().filter(tab => tab.url().includes('/ask.html')));
  // Tampermonkey may interrupt the ordinary navigation as it opens its installer.
  await install.click().catch(error => { if (!/interrupted|ERR_BLOCKED_BY_CLIENT|Download is starting/.test(error.message)) throw error; });
  console.log(JSON.stringify({ phase: 'Chrome public link clicked', pages: context.pages().map(tab => tab.url()) }));
  const installer = await until(async () => context.pages().find(tab => !previousInstallers.has(tab) && tab.url().includes(`chrome-extension://${chromeManagerId}/ask.html`)), 'public Chrome install confirmation');
  await installer.getByRole('button', { name: /^(Install|Update|Reinstall)$/ }).click();
  await page.goto(`chrome-extension://${chromeManagerId}/options.html`);
  await page.getByText('Installed Userscripts', { exact: true }).click();
  await page.getByText('Conversation Navigator for ChatGPT', { exact: true }).first().waitFor();
  await until(async () => (await page.locator('body').innerText()).includes(links.version), 'updated dashboard version');
  await page.screenshot({ path: path.join(artifacts, 'chrome-public-installed.png') });
  // Exercise the publicly installed production script with controlled HTTPS data.
  // Use a fresh content tab: the installer's final dashboard redirect can be delayed.
  await context.route('https://chatgpt.com/**', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('public-streaming-wheel') ? readingConversation('manual-composer') : route.request().url().includes('public-reading-short') ? readingConversation('short') : route.request().url().includes('public-reading-smoke') ? readingConversation('normal') : publicConversation }));
  const content = upgradedContent || await context.newPage();
  if (upgradedContent) await content.reload();
  else await content.goto('https://chatgpt.com/c/public-install-smoke');
  await until(() => content.locator('#conversation-navigator-root .row').count().then(count => count === (upgradedContent ? 2 : 3)), 'public Chrome script runs');
  assert.equal(await content.locator('#conversation-navigator-root').getAttribute('data-version'), links.version);
  if (upgradedContent) assert.equal(await content.locator('#conversation-navigator-root .row[data-key="id:user-1"] .title').textContent(), '升级后应保留的标题');
  await content.locator('#conversation-navigator-root .row[data-key="id:user-3"] .jump').click();
  await until(() => content.evaluate(() => document.querySelector('[data-message-id="user-3"]').getBoundingClientRect().top < innerHeight), 'public Chrome navigation');
  const outline = content.locator('#conversation-navigator-root .row[data-key="id:user-1"]');
  await outline.locator('.heading-toggle').click();
  assert.equal(await outline.locator('.heading-jump').count(), 1, 'only H1 initially visible');
  await outline.locator('.heading-item[data-level="1"] > .heading-line > .heading-children-toggle').click();
  assert.equal(await outline.locator('.heading-item[data-level="3"]').count(), 0, 'H3 initially closed');
  await outline.locator('.heading-item[data-level="2"] > .heading-line > .heading-children-toggle').click();
  await outline.locator('.heading-item[data-level="3"] > .heading-line > .heading-jump').click();
  await until(() => content.evaluate(() => Math.abs(document.querySelector('#public-h3').getBoundingClientRect().top - 16) <= 3), 'public H3 navigation');
  const supportsFormulaCopy = Number(links.version.split('.')[0]) > 0 || Number(links.version.split('.')[1]) >= 5;
  if (supportsFormulaCopy) {
    await content.locator('[data-message-id="answer-1"] .katex-html').first().dblclick();
    await until(async () => (await content.locator('#conversation-navigator-root .formula-toast').innerText()).includes('已复制 LaTeX'), 'public formula copy callback');
    await content.locator('#paste-target').fill('');
    await content.locator('#paste-target').focus();
    await content.keyboard.press('Control+V');
    assert.equal(await content.locator('#paste-target').inputValue(), 'E=mc^2', 'public double-click -> actual Ctrl+V');
  }
  let readingPosition = null, readingOverflowTransition = null, streamingScroll = null;
  if (Number(links.version.split('.')[0]) > 0 || Number(links.version.split('.')[1]) >= 6) {
    await content.goto('https://chatgpt.com/c/public-reading-smoke');
    await until(() => content.locator('#conversation-navigator-root .row').count().then(count => count === 8), 'public reading fixture ready');
    await content.evaluate(() => window.prepareReading());
    const before = await content.evaluate(() => { const p=document.getElementById('thread');return document.getElementById('reading-line-3').getBoundingClientRect().top-p.getBoundingClientRect().top-p.clientTop; });
    await content.locator('#prompt-textarea').fill('公开升级：发送后保留当前阅读位置');
    await content.locator('#prompt-textarea').press('Enter');
    await delay(2800);
    readingPosition = await content.evaluate(() => { const p=document.getElementById('thread');return {afterOffset:document.getElementById('reading-line-3').getBoundingClientRect().top-p.getBoundingClientRect().top-p.clientTop,state:document.querySelector('#conversation-navigator-root').dataset.readingPosition,...window.readingStats}; });
    readingPosition.beforeOffset = before;
    assert.ok(Math.abs(readingPosition.afterOffset-before)<=3, 'public send preserves historical reading paragraph');
    assert.equal(readingPosition.submissions, 1); assert.equal(readingPosition.streamed, 4); assert.equal(readingPosition.state, 'held');
  }
  if (Number(links.version.split('.')[0]) > 0 || Number(links.version.split('.')[1]) > 6 || (Number(links.version.split('.')[1]) === 6 && Number(links.version.split('.')[2]) >= 1)) {
    await content.goto('https://chatgpt.com/c/public-reading-short');
    await until(() => content.locator('#conversation-navigator-root .row').count().then(count => count === 3), 'public short conversation ready');
    await content.evaluate(() => window.prepareReading());
    const before = await content.evaluate(() => { const p=document.getElementById('thread');return {offset:document.getElementById('reading-line-3').getBoundingClientRect().top-p.getBoundingClientRect().top-p.clientTop,range:p.scrollHeight-p.clientHeight}; });
    assert.equal(before.range,0,'short conversation initially has no overflow');
    await content.locator('#prompt-textarea').fill('公开升级：首个滚动条出现后仍保留位置');
    await content.locator('#prompt-textarea').press('Enter');await delay(2800);
    readingOverflowTransition = await content.evaluate(() => { const p=document.getElementById('thread');return {afterOffset:document.getElementById('reading-line-3').getBoundingClientRect().top-p.getBoundingClientRect().top-p.clientTop,range:p.scrollHeight-p.clientHeight,state:document.querySelector('#conversation-navigator-root').dataset.readingPosition,...window.readingStats}; });
    readingOverflowTransition.beforeOffset=before.offset;
    assert.ok(readingOverflowTransition.range>0);assert.ok(Math.abs(readingOverflowTransition.afterOffset-before.offset)<=3,'public first-overflow transition preserves position');
    assert.equal(readingOverflowTransition.submissions,1);
  }
  if (Number(links.version.split('.')[0]) > 0 || Number(links.version.split('.')[1]) > 6 || (Number(links.version.split('.')[1]) === 6 && Number(links.version.split('.')[2]) >= 2)) {
    await content.goto('https://chatgpt.com/c/public-streaming-wheel');
    await until(() => content.locator('#conversation-navigator-root .row').count().then(n=>n===8),'public streaming fixture ready');
    await content.evaluate(()=>window.prepareReading());
    await content.locator('#prompt-textarea').fill('公开升级：流式期间滚动可接管');
    await content.locator('#prompt-textarea').press('Enter');
    await until(()=>content.evaluate(()=>window.readingStats.streamed>=1),'public stream started');
    const box=await content.locator('#prompt-textarea').boundingBox();
    await content.mouse.move(box.x+box.width/2,box.y+box.height/2);await content.mouse.wheel(0,220);
    await until(()=>content.evaluate(()=>document.querySelector('#conversation-navigator-root').dataset.readingPosition==='idle'&&document.scrollingElement.scrollTop>40),'public native wheel takes control');
    await delay(300);const moved=await content.evaluate(()=>document.scrollingElement.scrollTop);
    await delay(2600);
    streamingScroll=await content.evaluate(()=>({top:document.scrollingElement.scrollTop,state:document.querySelector('#conversation-navigator-root').dataset.readingPosition,...window.readingStats}));
    assert.equal(streamingScroll.state,'idle');assert.equal(streamingScroll.streamed,4);assert.equal(streamingScroll.submissions,1);
    assert.ok(Math.abs(streamingScroll.top-moved)<=3,'stream continues without rolling back manual scroll');
    await content.screenshot({path:path.join(artifacts,'chrome-public-streaming-scroll.png')});
  }
  receipt.browsers.push({ browser: 'chromium', engine: context.browser().version(), publicInstall: true, dashboardVersion: links.version,
    productionHTTPSFixture: 'Actual question and nested H3 navigation clicks passed', nestedHeadings: true, readingPosition, readingOverflowTransition, streamingScroll, formulaClipboard: supportsFormulaCopy ? 'Double-click -> native Ctrl+V exactly E=mc^2' : null,
    upgrade: upgradedContent ? { from: upgradeFromVersion, to: links.version, customTitlePreserved: true, deletionPreserved: true } : null });
} catch (error) {
  const pages = [];
  for (const [index, tab] of (context?.pages() || []).entries()) {
    pages.push({ url: tab.url(), text: await tab.locator('body').innerText().catch(() => '') });
    await tab.screenshot({ path: path.join(artifacts, `chrome-install-diagnostic-${index}.png`) }).catch(() => {});
  }
  await writeFile(path.join(artifacts, 'chrome-install-diagnostic.json'), JSON.stringify(pages, null, 2));
  console.error(JSON.stringify(pages.map(page => ({ url: page.url, text: page.text.slice(0, 800) }))));
  if (Number(links.version.split('.')[0]) > 0 || Number(links.version.split('.')[1]) > 6 || (Number(links.version.split('.')[1]) === 6 && Number(links.version.split('.')[2]) >= 2)) {
    await content.goto('https://chatgpt.com/c/public-streaming-wheel');
    await until(() => content.locator('#conversation-navigator-root .row').count().then(n=>n===8),'public streaming fixture ready');
    await content.evaluate(()=>window.prepareReading());
    await content.locator('#prompt-textarea').fill('公开升级：流式期间滚动可接管');
    await content.locator('#prompt-textarea').press('Enter');
    await until(()=>content.evaluate(()=>window.readingStats.streamed>=1),'public stream started');
    const box=await content.locator('#prompt-textarea').boundingBox();
    await content.mouse.move(box.x+box.width/2,box.y+box.height/2);await content.mouse.wheel(0,220);
    await until(()=>content.evaluate(()=>document.querySelector('#conversation-navigator-root').dataset.readingPosition==='idle'&&document.scrollingElement.scrollTop>40),'public native wheel takes control');
    await delay(300);const moved=await content.evaluate(()=>document.scrollingElement.scrollTop);
    await delay(2600);
    streamingScroll=await content.evaluate(()=>({top:document.scrollingElement.scrollTop,state:document.querySelector('#conversation-navigator-root').dataset.readingPosition,...window.readingStats}));
    assert.equal(streamingScroll.state,'idle');assert.equal(streamingScroll.streamed,4);assert.equal(streamingScroll.submissions,1);
    assert.ok(Math.abs(streamingScroll.top-moved)<=3,'stream continues without rolling back manual scroll');
    await content.screenshot({path:path.join(artifacts,'chrome-public-streaming-scroll.png')});
  }
  receipt.browsers.push({ browser: 'chromium', passed: false, error: error.stack });
  throw error;
} finally {
  await context?.close(); await rm(chromeProfile, { recursive: true, force: true });
  await writeFile(path.join(artifacts, 'install-report.json'), JSON.stringify(receipt, null, 2));
}

await mkdir(path.join(root, '.test-profiles'), { recursive: true });
const firefoxProfile = await mkdtemp(path.join(root, '.test-profiles/navigator-public-firefox-'));
let driver;
try {
  const options = new firefox.Options().addArguments('-headless')
    .setBinary(process.env.FIREFOX_BINARY || '/snap/firefox/current/usr/lib/firefox/firefox')
    .setPreference('intl.locale.requested', 'en-US')
    .setPreference('extensions.webextensions.uuids', JSON.stringify({ 'firefox@tampermonkey.net': firefoxManagerUUID }));
  if (testProxy) {
    const proxyURL = new URL(testProxy);
    options.setPreference('network.proxy.type', 1)
      .setPreference('network.proxy.http', proxyURL.hostname).setPreference('network.proxy.http_port', Number(proxyURL.port))
      .setPreference('network.proxy.ssl', proxyURL.hostname).setPreference('network.proxy.ssl_port', Number(proxyURL.port));
  }
  const service = new firefox.ServiceBuilder(process.env.GECKODRIVER || '/snap/bin/geckodriver')
    .addArguments('--profile-root', path.join(root, '.test-profiles'), '--allow-system-access');
  driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();
  await driver.installAddon(path.join(root, 'artifacts/tampermonkey/firefox.xpi'), true);
  await driver.get(`moz-extension://${firefoxManagerUUID}/options.html`);
  await until(async () => (await driver.findElements(By.xpath('//*[text()="Utilities"]'))).length, 'Firefox manager initialized');
  await driver.get(links.page);
  const install = await driver.findElement(By.linkText('安装此脚本'));
  assert.equal(await install.getAttribute('href'), links.install);
  await install.click();
  await until(async () => {
    for (const handle of await driver.getAllWindowHandles()) {
      await driver.switchTo().window(handle);
      if ((await driver.getCurrentUrl()).includes('/ask.html')) return true;
    }
    return false;
  }, 'public Firefox install confirmation');
  await (await driver.findElement(By.xpath('//input[@value="Install"] | //button[normalize-space(.)="Install"]'))).click();
  await driver.switchTo().window((await driver.getAllWindowHandles())[0]);
  await driver.get(`moz-extension://${firefoxManagerUUID}/options.html`);
  const installedTab = await until(async () => (await driver.findElements(By.xpath('//*[text()="Installed Userscripts"]')))[0], 'Firefox dashboard initialized');
  await installedTab.click();
  await until(async () => {
    const text = await driver.findElement(By.css('body')).getText();
    return text.includes('Conversation Navigator for ChatGPT') && text.includes(links.version);
  }, 'public Firefox installed dashboard version');
  await driver.manage().window().setRect({ width: 1440, height: 1000 });
  await writeFile(path.join(artifacts, 'firefox-public-installed.png'), await driver.takeScreenshot(), 'base64');
  receipt.browsers.push({ browser: 'firefox', engine: (await driver.getCapabilities()).get('browserVersion'), publicInstall: true,
    dashboardVersion: links.version, scope: 'Public page -> actual Tampermonkey install -> installed dashboard; no signed-in ChatGPT claim' });
} catch (error) {
  if (driver) {
    console.error(JSON.stringify({ url: await driver.getCurrentUrl(), text: (await driver.findElement(By.css('body')).getText()).slice(0, 1200) }));
    await writeFile(path.join(artifacts, 'firefox-install-diagnostic.png'), await driver.takeScreenshot(), 'base64');
  }
  receipt.browsers.push({ browser: 'firefox', passed: false, error: error.stack });
  throw error;
} finally {
  await driver?.quit(); await rm(firefoxProfile, { recursive: true, force: true });
  receipt.passed = receipt.browsers.length === 2 && receipt.browsers.every(browser => browser.publicInstall);
  await writeFile(path.join(artifacts, 'install-report.json'), JSON.stringify(receipt, null, 2));
}
console.log(JSON.stringify(receipt, null, 2));
