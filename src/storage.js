const api = globalThis.browser || globalThis.chrome;
export const extensionAPI = api;
export async function readStorage(key) {
  const result = await api.storage.local.get(key);
  return result[key];
}
export async function writeStorage(key, value) { await api.storage.local.set({ [key]: value }); }
