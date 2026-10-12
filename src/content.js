import styles from './panel.css';
import { findAdapter } from './platforms.js';
import { selectedMarkdown } from './markdown.js';
import { readStorage, writeStorage, extensionAPI } from './storage.js';
import { version } from '../package.json';
import { createNavigation } from './navigation.js';
import { createInventory } from './inventory.js';
import { createDiscovery, needsDiscovery } from './discovery.js';

const adapter = findAdapter(location);
if (adapter && !document.getElementById('conversation-navigator-root')) start();

async function start() {
  const host = document.createElement('div');
  host.id = 'conversation-navigator-root';
  host.dataset.version = version;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <aside class="panel" aria-label="ChatGPT 对话导航">
      <div class="header"><div class="brand" aria-hidden="true">≡</div><div class="heading"><strong>对话导航</strong><small>ChatGPT · 按提问浏览</small></div><span class="count">0</span><button class="icon" id="settings-toggle" aria-label="设置" aria-expanded="false">⚙</button><button class="icon" id="collapse" aria-label="收起导航">−</button></div>
      <div class="search"><input id="search" type="search" aria-label="搜索提问或自定义标题" placeholder="搜索提问或标题…"></div>
      <div class="selection"><button id="select-all">全选</button><button id="select-visible">选中搜索结果</button><button id="select-none">清空</button><span id="selected-count">已选 0</span></div>
      <div class="list" role="list" aria-label="提问列表"></div>
      <div class="settings" hidden><label><input id="include-headings" type="checkbox">导出包含提问 / 自定义标题</label><label>页面适配<select id="compatibility"><option value="auto">自动识别</option><option value="compatibility">兼容模式</option></select></label><p>DeepSeek、Claude 接口已预留，当前版本支持 ChatGPT。标题、删除状态与偏好保存在本地，对话正文仅在本页内存中用于导航和导出。</p><button id="forget-titles">重置本会话标题</button></div>
      <div class="footer"><div class="export-buttons"><button class="primary" id="copy" disabled>复制 Markdown</button><button id="export" disabled>导出 .md</button></div><div class="status" role="status" aria-live="polite">勾选问题，按对话顺序合并模型回复。</div></div>
    </aside><button class="launcher" id="expand" hidden aria-label="展开对话导航">≡ 对话导航 <span>0</span></button>`;
  const style = document.createElement('style'); style.textContent = styles; shadow.prepend(style);
  document.body.append(host);
  const $ = selector => shadow.querySelector(selector);
  $('.heading small').textContent = `ChatGPT · v${version}`;
  let settings = { collapsed: false, includeHeadings: false, mode: 'auto' };
  let turns = [], titles = {}, deleted = new Set(), selected = new Set(), expanded = new Set(), conversation = '', signature = '', editing = null;
  let inventory = createInventory(), scanned = false;
  const navigation = createNavigation();
  const collect = () => adapter.collect(document, settings.mode);
  function accept(observed) {
    turns = inventory.merge(observed);
    const nextSignature = JSON.stringify(turns.map(turn => [turn.key, turn.prompt, turn.answers.length, turn.headings.map(heading => [heading.key, heading.title])]));
    if (nextSignature !== signature) { signature = nextSignature; render(); }
    else updateButtons();
  }
  const discovery = createDiscovery({ collect, merge: accept, context: () => conversation, onState: (state, scope) => {
    if (scope !== conversation) return;
    host.dataset.discovery = state;
    if (state === 'running') notify('正在整理完整对话目录…');
    else notify(`已识别 ${turns.filter(turn => !deleted.has(turn.key)).length} 条提问。勾选后可复制或导出回复。`);
  } });
  let activeKey = '', generation = 0, loaded = false, timer = null, writeQueue = Promise.resolve();
  let lastFirstKey = '';

  function notify(text) { $('.status').textContent = text; }
  function reportStorageError(error) { console.warn('[Conversation Navigator] Storage unavailable', error); notify('本地保存失败，修改仍可在本页使用。请检查扩展是否仍启用。'); }
  function enqueueSave(key, value) {
    writeQueue = writeQueue.catch(() => {}).then(() => writeStorage(key, value));
    writeQueue.catch(reportStorageError);
  }
  function persist() { if (conversation) enqueueSave(`conversation:${conversation}`, { titles: { ...titles }, deleted: [...deleted] }); }
  function saveSettings() { enqueueSave('settings', { ...settings }); }
  function collapsed(value) {
    settings.collapsed = value;
    $('.panel').hidden = value;
    $('#expand').hidden = !value;
    saveSettings();
  }
  function matchingTurns() {
    const query = $('#search').value.trim().toLocaleLowerCase();
    return turns.filter(turn => !deleted.has(turn.key) && (!query || `${turn.prompt} ${titles[turn.key] || ''}`.toLocaleLowerCase().includes(query)));
  }
  function updateButtons() {
    $('#selected-count').textContent = `已选 ${selected.size}`;
    $('#copy').disabled = $('#export').disabled = !selected.size || !loaded;
    $('#select-all').disabled = $('#select-visible').disabled = !turns.length;
    $('#select-none').disabled = !selected.size;
  }
  async function jump(key, headingKey = null) {
    discovery.cancel();
    // Row listeners keep only the stable key; React may have replaced the original DOM node.
    accept(collect());
    const route = location.href;
    activeKey = key;
    updateActive();
    const result = await navigation.navigate(() => location.href === route && !deleted.has(key) ? inventory.resolve(key, collect, headingKey) : null);
    if (!result.cancelled && !result.success) notify('该提问尚未完成加载，请稍后再定位。');
  }
  function updateActive() { shadow.querySelectorAll('.row').forEach(row => { row.classList.toggle('active', row.dataset.key === activeKey); row.querySelector('.jump')?.setAttribute('aria-current', row.dataset.key === activeKey ? 'true' : 'false'); }); }
  function beginEdit(row, turn) {
    if (editing) render();
    editing = turn.key;
    const box = document.createElement('div');
    box.className = 'editor';
    box.innerHTML = '<textarea maxlength="500" aria-label="自定义导航标题"></textarea><div class="editor-actions"><button class="primary" data-edit="save">保存</button><button data-edit="reset">恢复原提问</button><button data-edit="cancel">取消</button></div>';
    const input = box.querySelector('textarea');
    input.value = titles[turn.key] || turn.prompt;
    const finish = action => {
      if (action === 'save') {
        const title = input.value.trim();
        if (!title) { notify('标题不能为空。也可以选择「恢复原提问」。'); input.focus(); return; }
        titles[turn.key] = title;
        persist();
      } else if (action === 'reset') { delete titles[turn.key]; persist(); }
      editing = null; render();
    };
    box.addEventListener('click', event => { const action = event.target.closest('[data-edit]')?.dataset.edit; if (action) finish(action); });
    input.addEventListener('keydown', event => { if (event.key === 'Escape') finish('cancel'); else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); finish('save'); } });
    const currentRow = [...shadow.querySelectorAll('.row')].find(item => item.dataset.key === turn.key) || row;
    currentRow.append(box); input.focus(); input.select();
  }
  function render() {
    editing = null;
    const list = $('.list');
    const previousScroll = list.scrollTop;
    list.replaceChildren();
    const filtered = matchingTurns();
    const total = turns.filter(turn => !deleted.has(turn.key)).length;
    $('.count').textContent = `${total} 条`;
    $('#expand span').textContent = `${total} 条`;
    if (!filtered.length) {
      const empty = document.createElement('div'); empty.className = 'empty';
      empty.textContent = turns.length ? '没有匹配的提问。' : settings.mode === 'compatibility'
        ? `兼容模式尚未识别到提问。请确认对话已加载，且扩展版本为 v${version}。`
        : '等待对话内容…\n开始提问后，这里会显示导航。若已有对话，请在设置中尝试兼容模式。';
      list.append(empty);
    }
    for (const turn of filtered) {
      const index = turns.indexOf(turn) + 1;
      const row = document.createElement('div'); row.className = 'row'; row.setAttribute('role', 'listitem'); row.dataset.key = turn.key;
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(turn.key); checkbox.setAttribute('aria-label', `选择第 ${index} 条回复`);
      checkbox.addEventListener('change', () => { checkbox.checked ? selected.add(turn.key) : selected.delete(turn.key); updateButtons(); });
      const number = document.createElement('span'); number.className = 'number'; number.textContent = String(index).padStart(2, '0');
      const link = document.createElement('button'); link.className = 'jump'; link.title = turn.prompt;
      const title = document.createElement('span'); title.className = 'title'; title.textContent = titles[turn.key] || turn.prompt;
      const meta = document.createElement('span'); meta.className = 'meta'; meta.textContent = `${titles[turn.key] ? '已自定义 · ' : ''}${turn.answers.length ? '模型回复' : '等待回复'}`;
      link.append(title, meta); link.addEventListener('click', () => jump(turn.key));
      const edit = document.createElement('button'); edit.className = 'edit'; edit.textContent = '✎'; edit.title = '自定义标题'; edit.setAttribute('aria-label', `编辑第 ${index} 条标题`); edit.addEventListener('click', () => beginEdit(row, turn));
      const remove = document.createElement('button'); remove.className = 'delete'; remove.textContent = '×'; remove.title = '删除导航项'; remove.setAttribute('aria-label', `删除第 ${index} 条导航`);
      remove.addEventListener('click', () => { deleted.add(turn.key); selected.delete(turn.key); persist(); render(); notify('已删除该导航项。'); });
      const toggle = document.createElement('button'); toggle.className = 'heading-toggle'; toggle.textContent = expanded.has(turn.key) ? '▾' : '▸'; toggle.disabled = !turn.headings.length;
      toggle.title = turn.headings.length ? '展开 / 收起回复一级标题' : '回复暂无一级标题'; toggle.setAttribute('aria-label', `展开第 ${index} 条回复一级标题`); toggle.setAttribute('aria-expanded', String(expanded.has(turn.key)));
      toggle.addEventListener('click', () => { expanded.has(turn.key) ? expanded.delete(turn.key) : expanded.add(turn.key); render(); });
      row.append(checkbox, number, link, edit, remove, toggle);
      if (expanded.has(turn.key)) {
        const group = document.createElement('div'); group.className = 'heading-list';
        for (const heading of turn.headings) {
          const button = document.createElement('button'); button.className = 'heading-jump'; button.textContent = heading.title; button.title = heading.title;
          button.addEventListener('click', () => jump(turn.key, heading.key)); group.append(button);
        }
        row.append(group);
      }
      list.append(row);
    }
    list.scrollTop = previousScroll; updateButtons(); updateActive();
  }
  async function refresh() {
    clearTimeout(timer); timer = null;
    let next = adapter.collect(document, settings.mode);
    const nextConversation = adapter.conversationKey(location, next);
    host.toggleAttribute('data-dark', document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark');
    if (nextConversation !== conversation) {
      navigation.cancel(); discovery.cancel(); inventory = createInventory(); scanned = false;
      const previous = conversation, previousTitles = { ...titles }, previousDeleted = new Set(deleted), previousFirst = lastFirstKey;
      conversation = nextConversation; loaded = false; selected.clear(); expanded.clear(); editing = null; titles = {}; deleted = new Set(); turns = []; signature = ''; host.dataset.discovery = 'idle'; $('#search').value = ''; render();
      const currentGeneration = ++generation;
      // Finish queued saves before a rapid back/forward navigation reads them.
      await writeQueue.catch(() => {});
      let stored;
      try { stored = await readStorage(`conversation:${conversation}`); } catch (error) { reportStorageError(error); }
      if (currentGeneration !== generation) return;
      titles = stored?.titles && typeof stored.titles === 'object' ? stored.titles : {};
      deleted = new Set(Array.isArray(stored?.deleted) ? stored.deleted : []);
      // A newly created conversation moves from a draft URL to /c/<id>.
      if (!stored && previous.includes(':draft:') && !conversation.includes(':draft:') && previousFirst && previousFirst === next[0]?.key) { titles = previousTitles; deleted = previousDeleted; persist(); }
      loaded = true; activeKey = ''; notify('勾选问题，按对话顺序合并模型回复。');
      next = adapter.collect(document, settings.mode);
      if (adapter.conversationKey(location, next) !== conversation) { schedule(); return; }
    }
    if (!loaded) return;
    accept(next); lastFirstKey = turns[0]?.key || '';
    if (!scanned && next.length && needsDiscovery(next)) {
      scanned = true;
      discovery.run().catch(error => { console.error('[Conversation Navigator] Discovery', error); notify('目录整理未完成，滚动对话后会继续识别提问。'); });
    }
  }
  function schedule() { if (!timer) timer = setTimeout(() => { refresh().catch(error => { console.error('[Conversation Navigator]', error); notify('页面读取失败，请刷新页面或尝试兼容模式。'); }); }, 220); }

  async function exportText(download) {
    const currentTurns = adapter.collect(document, settings.mode);
    if (adapter.conversationKey(location, currentTurns) !== conversation) { schedule(); notify('会话正在切换，请稍后再导出。'); return; }
    const streaming = document.querySelector('[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="停止生成"]');
    if (streaming && selected.has(turns.at(-1)?.key || currentTurns.at(-1)?.key)) { notify('所选回复正在生成，请等待完成后再导出。'); return; }
    accept(currentTurns);
    const result = selectedMarkdown(turns, selected, titles, settings.includeHeadings);
    if (result.missing.length) { notify(`有 ${result.missing.length} 条所选提问暂无可导出的回复，请等待或取消勾选。`); return; }
    if (!result.text) { notify('没有可导出的回复，请先勾选已完成的提问。'); return; }
    try {
      if (download) {
        const blob = new Blob([result.text], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url;
        const name = document.title.replace(/\s*[-|] ChatGPT\s*$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80) || 'ChatGPT';
        link.download = `${name}-${new Date().toISOString().slice(0, 10)}.md`;
        shadow.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        try { await navigator.clipboard.writeText(result.text); }
        catch {
          // Firefox and pages with restricted Clipboard API still support the permission-backed copy command.
          const focused = shadow.activeElement;
          const textarea = document.createElement('textarea'); textarea.value = result.text; textarea.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0'; shadow.append(textarea); textarea.focus(); textarea.select();
          const copied = document.execCommand('copy'); textarea.remove(); focused?.focus();
          if (!copied) throw new Error('Clipboard write rejected');
        }
      }
      notify(download ? `已导出 ${result.count} 条模型回复。` : `已复制 ${result.count} 条模型回复到剪贴板。`);
    } catch (error) { console.warn('[Conversation Navigator] Export failed', error); notify(download ? '下载失败，请检查浏览器的下载设置。' : '复制失败，请检查剪贴板权限，或使用「导出 .md」。'); }
  }

  try { const saved = await readStorage('settings'); if (saved) settings = { ...settings, ...saved }; } catch (error) { reportStorageError(error); }
  $('.panel').hidden = settings.collapsed; $('#expand').hidden = !settings.collapsed;
  $('#include-headings').checked = settings.includeHeadings; $('#compatibility').value = settings.mode;
  $('#collapse').addEventListener('click', () => collapsed(true)); $('#expand').addEventListener('click', () => collapsed(false));
  $('#settings-toggle').addEventListener('click', () => { const value = !$('.settings').hidden; $('.settings').hidden = value; $('#settings-toggle').setAttribute('aria-expanded', String(!value)); });
  $('#search').addEventListener('input', render);
  $('#select-all').addEventListener('click', () => { selected = new Set(turns.filter(turn => !deleted.has(turn.key)).map(turn => turn.key)); render(); });
  $('#select-visible').addEventListener('click', () => { matchingTurns().forEach(turn => selected.add(turn.key)); render(); });
  $('#select-none').addEventListener('click', () => { selected.clear(); render(); });
  $('#include-headings').addEventListener('change', () => { settings.includeHeadings = $('#include-headings').checked; saveSettings(); });
  $('#compatibility').addEventListener('change', () => { settings.mode = $('#compatibility').value; signature = ''; saveSettings(); schedule(); });
  $('#forget-titles').addEventListener('click', () => { titles = {}; persist(); render(); notify('已恢复本会话的原始提问标题。'); });
  $('#copy').addEventListener('click', () => exportText(false)); $('#export').addEventListener('click', () => exportText(true));
  $('.list').tabIndex = 0;
  $('.panel').addEventListener('wheel', event => {
    const editable = event.composedPath().find(node => node.tagName === 'TEXTAREA' || node.tagName === 'SELECT');
    if (editable) return;
    const list = $('.list');
    const scale = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? list.clientHeight : 1;
    list.scrollTop += event.deltaY * scale;
    event.preventDefault(); event.stopPropagation();
  }, { passive: false });
  extensionAPI.runtime.onMessage.addListener(message => { if (message.type === 'conversation-navigator:toggle') collapsed(!settings.collapsed); });
  document.addEventListener('keydown', event => { if (event.altKey && event.shiftKey && event.code === 'KeyN') { event.preventDefault(); collapsed(!settings.collapsed); } });
  let scrollFrame;
  document.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      if (!turns.length || navigation.active || discovery.active) return;
      const boundary = innerHeight / 3;
      let current = turns[0];
      let closest = Infinity;
      for (const turn of turns.filter(turn => turn.anchor.isConnected && !deleted.has(turn.key))) {
        const distance = Math.abs(turn.anchor.getBoundingClientRect().top - boundary);
        if (distance < closest) { closest = distance; current = turn; }
      }
      if (activeKey !== current.key) { activeKey = current.key; updateActive(); }
    });
  }, { passive: true, capture: true });
  new MutationObserver(records => { if (records.some(record => record.target !== host && !host.contains(record.target))) schedule(); })
    .observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-message-author-role', 'data-message-id', 'data-turn-id', 'data-turn-key', 'data-user-message-bubble', 'data-markdown-text-style', 'data-chatgpt-selection-message-id', 'hidden', 'aria-hidden'] });
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  // SPA pushState does not emit popstate; polling also handles an empty new-chat route.
  let previousURL = location.href;
  setInterval(() => { if (location.href !== previousURL) { previousURL = location.href; schedule(); } }, 650);
  window.addEventListener('popstate', schedule);
  await refresh();
}
