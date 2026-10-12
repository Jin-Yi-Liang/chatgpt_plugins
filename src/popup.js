const api = globalThis.browser || globalThis.chrome;
document.querySelector('#toggle').addEventListener('click', async () => {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    await api.tabs.sendMessage(tab.id, { type: 'conversation-navigator:toggle' });
    window.close();
  } catch { document.querySelector('#status').textContent = '请先打开或刷新 ChatGPT 页面。'; }
});
document.querySelector('#open').addEventListener('click', () => api.tabs.create({ url: 'https://chatgpt.com/' }));
