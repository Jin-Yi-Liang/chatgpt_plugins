import { chromium } from 'playwright';
import { Builder, By } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromeManagerId, firefoxManagerUUID } from './tampermonkey.mjs';
import { conversation } from './fixture.mjs';

// Tests the public distribution path in fresh profiles, without the author's login.
const root = process.cwd();
const artifacts = path.resolve(process.env.PUBLICATION_ARTIFACT_DIR || 'artifacts/publication');
const links = JSON.parse(await readFile(process.env.PUBLICATION_LINKS_FILE || 'tests/published-release.json', 'utf8'));
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
    locale: 'en-US', viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${manager}`, `--load-extension=${manager}`] });
  const page = await context.newPage();
  await page.goto('chrome://extensions/');
  await page.getByRole('button', { name: 'Details', exact: true }).first().click();
  const permission = page.getByRole('switch', { name: /^Allow User Scripts/ });
  if (await permission.getAttribute('aria-checked') !== 'true') await permission.click();
  await page.goto(`chrome-extension://${chromeManagerId}/options.html`);
  await page.getByText('Utilities', { exact: true }).waitFor();
  await page.goto(links.page);
  const install = page.getByRole('link', { name: '安装此脚本', exact: true });
  assert.equal(await install.getAttribute('href'), links.install);
  // Tampermonkey may interrupt the ordinary navigation as it opens its installer.
  await install.click().catch(error => { if (!/interrupted|ERR_BLOCKED_BY_CLIENT|Download is starting/.test(error.message)) throw error; });
  console.log(JSON.stringify({ phase: 'Chrome public link clicked', pages: context.pages().map(tab => tab.url()) }));
  const installer = await until(async () => context.pages().find(tab => tab.url().includes(`chrome-extension://${chromeManagerId}/ask.html`)), 'public Chrome install confirmation');
  await installer.getByRole('button', { name: 'Install', exact: true }).click();
  await page.goto(`chrome-extension://${chromeManagerId}/options.html`);
  await page.getByText('Installed Userscripts', { exact: true }).click();
  await page.getByText('Conversation Navigator for ChatGPT', { exact: true }).first().waitFor();
  assert.ok((await page.locator('body').innerText()).includes(links.version));
  await page.screenshot({ path: path.join(artifacts, 'chrome-public-installed.png') });
  // Exercise the publicly installed production script with controlled HTTPS data.
  // Use a fresh content tab: the installer's final dashboard redirect can be delayed.
  await context.route('https://chatgpt.com/**', route => route.fulfill({ contentType: 'text/html', body: conversation }));
  const content = await context.newPage();
  await content.goto('https://chatgpt.com/c/public-install-smoke');
  await until(() => content.locator('#conversation-navigator-root .row').count().then(count => count === 3), 'public Chrome script runs');
  assert.equal(await content.locator('#conversation-navigator-root').getAttribute('data-version'), links.version);
  await content.locator('#conversation-navigator-root .row:nth-child(3) .jump').click();
  await until(() => content.evaluate(() => document.querySelector('[data-message-id="user-3"]').getBoundingClientRect().top < innerHeight), 'public Chrome navigation');
  receipt.browsers.push({ browser: 'chromium', engine: context.browser().version(), publicInstall: true, dashboardVersion: links.version,
    productionHTTPSFixture: '3 questions injected; actual navigation click passed' });
} catch (error) {
  const pages = [];
  for (const [index, tab] of (context?.pages() || []).entries()) {
    pages.push({ url: tab.url(), text: await tab.locator('body').innerText().catch(() => '') });
    await tab.screenshot({ path: path.join(artifacts, `chrome-install-diagnostic-${index}.png`) }).catch(() => {});
  }
  await writeFile(path.join(artifacts, 'chrome-install-diagnostic.json'), JSON.stringify(pages, null, 2));
  console.error(JSON.stringify(pages.map(page => ({ url: page.url, text: page.text.slice(0, 800) }))));
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
