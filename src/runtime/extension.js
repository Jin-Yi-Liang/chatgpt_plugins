const api = globalThis.browser || globalThis.chrome;
export { downloadText } from './download.js';
export const runtimeKind = 'extension';
export async function readStorage(key) { return (await api.storage.local.get(key))[key]; }
export async function writeStorage(key, value) { await api.storage.local.set({ [key]: value }); }
export function registerToggle(callback) {
  api.runtime.onMessage.addListener(message => { if (message.type === 'conversation-navigator:toggle') callback(); });
}
export async function copyText(text, shadow) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const focused = shadow.activeElement;
    const textarea = document.createElement('textarea');
    textarea.value = text; textarea.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
    shadow.append(textarea); textarea.focus(); textarea.select();
    const copied = document.execCommand('copy'); textarea.remove(); focused?.focus();
    if (!copied) throw new Error('Clipboard write rejected');
  }
}
