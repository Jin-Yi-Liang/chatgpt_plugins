export const runtimeKind = 'tampermonkey';
export { downloadText } from './download.js';
export async function readStorage(key) { return GM_getValue(key); }
export async function writeStorage(key, value) { GM_setValue(key, value); }
export function registerToggle(callback) { GM_registerMenuCommand('显示 / 收起对话导航', callback); }
export async function copyText(text) {
  await new Promise((resolve, reject) => {
    try { GM_setClipboard(text, { type: 'text', mimetype: 'text/plain' }, resolve); }
    catch (error) { reject(error); }
  });
}
