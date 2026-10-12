import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { By } from 'selenium-webdriver';

export const chromeManagerId = 'dhdgffkkebhmkfjojejmpbldmpobfkfo';
export const firefoxManagerUUID = 'dc81c8a2-0dbf-4c9a-ab5e-7ff39d0f6842';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function installChromeScript(context, page, scriptFile) {
  await page.goto('chrome://extensions/');
  await page.getByRole('button', { name: 'Details', exact: true }).first().click();
  const permission = page.getByRole('switch', { name: /^Allow User Scripts/ });
  if (await permission.getAttribute('aria-checked') !== 'true') await permission.click();
  await page.goto(`chrome-extension://${chromeManagerId}/options.html`);
  await page.getByText('Utilities', { exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(scriptFile);
  let installer;
  for (let i = 0; i < 150; i++) { installer = context.pages().find(tab => tab.url().includes(`/${'ask.html'}`)); if (installer) break; await pause(100); }
  if (!installer) throw new Error('Tampermonkey installation confirmation did not open');
  await installer.getByRole('button', { name: 'Install', exact: true }).click();
  await page.getByText('Installed Userscripts', { exact: true }).click();
  await page.getByText('Conversation Navigator for ChatGPT', { exact: true }).first().waitFor();
}

export async function installFirefoxScript(driver, scriptFile) {
  await driver.get(`moz-extension://${firefoxManagerUUID}/options.html`);
  let utilities;
  for (let i = 0; i < 100; i++) { const found = await driver.findElements(By.xpath('//*[text()="Utilities"]')); if (found.length) { utilities = found[0]; break; } await pause(100); }
  if (!utilities) throw new Error('Firefox Tampermonkey dashboard did not load');
  await utilities.click();
  await (await driver.findElement(By.css('input[type=file]'))).sendKeys(scriptFile);
  let installer;
  for (let i = 0; i < 150; i++) {
    for (const handle of await driver.getAllWindowHandles()) { await driver.switchTo().window(handle); if ((await driver.getCurrentUrl()).includes('/ask.html')) { installer = handle; break; } }
    if (installer) break; await pause(100);
  }
  if (!installer) throw new Error('Firefox Tampermonkey install dialog did not open');
  await (await driver.findElement(By.xpath('//input[@value="Install"] | //button[normalize-space(.)="Install"]'))).click();
  await driver.switchTo().window((await driver.getAllWindowHandles())[0]);
}

export async function firefoxTestScript(outputDirectory) {
  const source = await readFile('dist/userscript/chatgpt-conversation-navigator.user.js', 'utf8');
  const file = path.join(outputDirectory, 'navigator.user.js');
  await writeFile(file, source.replace('// @match        https://chatgpt.com/*', '// @match        https://chatgpt.com/*\n// @match        http://chatgpt.com/*'));
  return file;
}
