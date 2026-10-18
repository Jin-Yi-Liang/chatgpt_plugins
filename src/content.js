import styles from './panel.css';
import { findAdapter } from './platforms.js';
import { selectedMarkdown } from './markdown.js';
import { readStorage, writeStorage, registerToggle, copyText, downloadText, runtimeKind } from './storage.js';
import { version } from '../package.json';
import { createNavigation } from './navigation.js';
import { createInventory } from './inventory.js';
import { createDiscovery, needsDiscovery } from './discovery.js';
import { installFormulaCopy } from './formula-copy.js';

const adapter = findAdapter(location);
if (adapter && !document.getElementById('conversation-navigator-root')) start();

async function start() {
  const host = document.createElement('div');
  host.id = 'conversation-navigator-root';
  host.dataset.version = version;
  host.dataset.runtime = runtimeKind;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <aside class="panel" aria-label="ChatGPT 对话导航">
      <div class="header"><div class="brand" aria-hidden="true">≡</div><div class="heading"><strong>对话导航</strong><small>ChatGPT · 按提问浏览</small></div><span class="count">0</span><button class="icon" id="settings-toggle" aria-label="设置" aria-expanded="false">⚙</button><button class="icon" id="collapse" aria-label="收起导航">−</button></div>
      <div class="search"><input id="search" type="search" aria-label="搜索提问或自定义标题" placeholder="搜索提问或标题…"><button id="clear-search" aria-label="清空搜索" title="清空搜索" hidden>×</button></div>
      <div class="selection"><button id="select-all">全选</button><button id="select-visible">选中搜索结果</button><button id="select-none">清空</button><span id="selected-count">已选 0</span></div>
      <div class="list-tools"><span id="results-count">共 0 条</span><button id="locate-current" title="在目录中显示当前提问">当前提问</button></div>
      <div id="selection-hint" class="selection-hint" hidden></div>
      <div class="list" role="list" aria-label="提问列表"></div>
      <div class="settings" hidden><label><input id="include-headings" type="checkbox">导出包含提问 / 自定义标题</label><label>页面适配<select id="compatibility"><option value="auto">自动识别</option><option value="compatibility">兼容模式</option></select></label><label>双击公式复制<select id="formula-format"><option value="latex">LaTeX 源码</option><option value="markdown">Markdown 公式</option></select></label><p>双击模型回复中的公式即可复制，复制结果可按 Ctrl+V 粘贴。</p><p>DeepSeek、Claude 接口已预留，当前版本支持 ChatGPT。标题、删除状态与偏好保存在本地，对话正文仅在本页内存中用于导航和导出。</p><button id="forget-titles">重置本会话标题</button></div>
      <div class="footer"><div class="export-buttons"><button class="primary" id="copy" disabled>复制 Markdown</button><button id="export" disabled>导出 .md</button></div><div class="status" role="status" aria-live="polite">勾选问题，按对话顺序合并模型回复。</div></div>
    </aside><button class="launcher" id="expand" hidden aria-label="展开对话导航">≡ 对话导航 <span>0</span></button><div class="formula-toast" role="status" aria-live="polite" hidden></div>`;
  const style = document.createElement('style'); style.textContent = styles; shadow.prepend(style);
  document.body.append(host);
  const $ = selector => shadow.querySelector(selector);
  $('.heading small').textContent = `ChatGPT · v${version}`;
  let settings = { collapsed: false, includeHeadings: false, mode: 'auto', formulaFormat: 'latex' };
  let turns = [], titles = {}, deleted = new Set(), selected = new Set(), expanded = new Set(), conversation = '', signature = '', editing = null;
  let inventory = createInventory(), scanned = false;
  const rowCache = new Map();
  let panelReturnFocus = null;
  const navigation = createNavigation();
  const collect = () => adapter.collect(document, settings.mode);
  function accept(observed) {
    turns = inventory.merge(observed);
    const nextSignature = JSON.stringify(turns.map(turn => [turn.key, turn.prompt, turn.answers.length, turn.headings.map(heading => [heading.key, heading.title, heading.level, heading.parentKey])]));
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
  let formulaNoticeTimer;
  function formulaNotice(text) {
    notify(text);
    const toast = $('.formula-toast'); toast.textContent = text; toast.hidden = false;
    clearTimeout(formulaNoticeTimer);
    formulaNoticeTimer = setTimeout(() => { toast.hidden = true; }, 3000);
  }
  installFormulaCopy({
    copy: text => copyText(text, shadow), notice: formulaNotice, getFormat: () => settings.formulaFormat,
    isReply: node => {
      if (node.closest('[data-user-message-bubble]')) return false;
      const role = node.closest('[data-message-author-role]');
      if (role) return role.getAttribute('data-message-author-role') === 'assistant';
      if (node.closest('[data-markdown-text-style]') && node.closest('[data-chatgpt-conversation-selection-target], [data-turn-key], [data-thread-user-message-navigation-content]')) return true;
      return collect().some(turn => turn.answers.some(answer => answer.contains(node)));
    }
  });
  function reportStorageError(error) { console.warn('[Conversation Navigator] Storage unavailable', error); notify('本地保存失败，修改仍可在本页使用。请检查扩展是否仍启用。'); }
  function enqueueSave(key, value) {
    writeQueue = writeQueue.catch(() => {}).then(() => writeStorage(key, value));
    writeQueue.catch(reportStorageError);
  }
  function persist() { if (conversation) enqueueSave(`conversation:${conversation}`, { titles: { ...titles }, deleted: [...deleted] }); }
  function saveSettings() { enqueueSave('settings', { ...settings }); }
  function collapsed(value) {
    if (value && $('.panel').contains(shadow.activeElement)) panelReturnFocus = shadow.activeElement;
    settings.collapsed = value;
    $('.panel').hidden = value;
    $('#expand').hidden = !value;
    (value ? $('#expand') : panelReturnFocus?.isConnected ? panelReturnFocus : $('#search')).focus({ preventScroll: true });
    saveSettings();
  }
  function matchingTurns() {
    const query = $('#search').value.trim().toLocaleLowerCase();
    return turns.filter(turn => !deleted.has(turn.key) && (!query || `${turn.prompt} ${titles[turn.key] || ''}`.toLocaleLowerCase().includes(query)));
  }
  function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
  function updateButtons() {
    const filtered = matchingTurns();
    const visibleKeys = new Set(filtered.map(turn => turn.key));
    const total = turns.length - deletedInInventory();
    const hiddenSelected = [...selected].filter(key => !visibleKeys.has(key)).length;
    setText($('#selected-count'), `已选 ${selected.size}`);
    setText($('#results-count'), $('#search').value.trim() ? `匹配 ${filtered.length} / 共 ${total} 条` : `共 ${total} 条`);
    $('#selection-hint').hidden = !hiddenSelected;
    setText($('#selection-hint'), hiddenSelected ? `筛选外还有 ${hiddenSelected} 条已选回复，将一并导出。` : '');
    $('#clear-search').hidden = !$('#search').value;
    $('#copy').disabled = $('#export').disabled = !selected.size || !loaded;
    $('#select-all').disabled = !total;
    $('#select-visible').disabled = !filtered.length;
    $('#select-none').disabled = !selected.size;
    $('#locate-current').disabled = !total;
  }
  function deletedInInventory() { return turns.reduce((count, turn) => count + Number(deleted.has(turn.key)), 0); }
  let jumpGeneration = 0;
  async function jump(key, headingKey = null) {
    discovery.cancel();
    // Row listeners keep only the stable key; React may have replaced the original DOM node.
    // Resolve refreshes missing targets on demand; a live target needs no full transcript scan.
    const route = location.href;
    const scope = conversation, attempt = ++jumpGeneration;
    activeKey = key;
    updateActive();
    notify('正在定位…等待目标内容加载。');
    const result = await navigation.navigate(() => location.href === route && conversation === scope && !deleted.has(key)
      ? inventory.resolve(key, collect, headingKey) : { cancelled: true });
    if (attempt !== jumpGeneration || conversation !== scope || location.href !== route) return;
    if (result.cancelled) notify('定位已停止。');
    else if (result.success) notify(headingKey ? '已定位到回复标题。' : '已定位到提问。');
    else notify(result.reason === 'timeout' ? '定位未完成：目标仍未加载或页面持续重排，请稍后重试。' : '该目标暂时不可用，请等待页面加载后重试。');
  }
  let highlightedRow = null;
  function updateActive() {
    const next = rowCache.get(activeKey)?.row;
    if (highlightedRow !== next) {
      highlightedRow?.classList.remove('active');
      highlightedRow?.querySelector('.jump').setAttribute('aria-current', 'false');
      next?.classList.add('active');
      next?.querySelector('.jump').setAttribute('aria-current', 'true');
      highlightedRow = next;
    }
  }
  function beginEdit(row, turn) {
    if (editing === turn.key) { row.querySelector('textarea')?.focus(); return; }
    if (editing) rowCache.get(editing)?.row.querySelector('.editor')?.remove();
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
        titles[turn.key] = title; persist();
      } else if (action === 'reset') { delete titles[turn.key]; persist(); }
      editing = null; box.remove(); render(); row.querySelector('.edit').focus({ preventScroll: true });
    };
    box.addEventListener('click', event => { const action = event.target.closest('[data-edit]')?.dataset.edit; if (action) finish(action); });
    let composing = false;
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; });
    input.addEventListener('keydown', event => {
      if (composing || event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { event.preventDefault(); finish('cancel'); }
      else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); finish('save'); }
    });
    row.append(box); input.focus(); input.select();
  }
  // Keep unchanged rows in place: streaming replies must not replace editors or keyboard focus.
  function reconcile(parent, nodes) {
    let cursor = parent.firstChild;
    for (const node of nodes) {
      if (node === cursor) cursor = cursor.nextSibling;
      else parent.insertBefore(node, cursor);
    }
    while (cursor) { const next = cursor.nextSibling; cursor.remove(); cursor = next; }
  }
  function createRow(key) {
    const row = document.createElement('div');
    row.className = 'row'; row.setAttribute('role', 'listitem'); row.dataset.key = key;
    row.innerHTML = '<input type="checkbox"><span class="number"></span><button class="jump" aria-current="false"><span class="title"></span><span class="meta"></span></button><button class="edit" title="自定义标题">✎</button><button class="delete" title="删除导航项">×</button><button class="heading-toggle"></button>';
    const parts = Object.fromEntries(['number', 'jump', 'title', 'meta', 'edit', 'delete', 'heading-toggle'].map(name => [name, row.querySelector(`.${name}`)]));
    const checkbox = row.querySelector('input');
    checkbox.addEventListener('change', () => { checkbox.checked ? selected.add(key) : selected.delete(key); updateButtons(); });
    parts.jump.addEventListener('click', () => jump(key));
    parts.edit.addEventListener('click', () => beginEdit(row, turns.find(turn => turn.key === key)));
    parts.delete.addEventListener('click', () => {
      const visible = matchingTurns();
      const index = visible.findIndex(turn => turn.key === key);
      const nextKey = (visible[index + 1] || visible[index - 1])?.key;
      deleted.add(key); selected.delete(key); expanded.delete(key);
      if (editing === key) editing = null;
      if (activeKey === key) activeKey = nextKey || '';
      persist(); render(); notify('已删除该导航项。');
      (rowCache.get(nextKey)?.delete || $('#search')).focus({ preventScroll: true });
    });
    parts['heading-toggle'].addEventListener('click', () => { expanded.has(key) ? expanded.delete(key) : expanded.add(key); render(); });
    const group = document.createElement('div'); group.className = 'heading-list'; group.setAttribute('role', 'list'); group.setAttribute('aria-label', '回复标题');
    return { row, checkbox, group, headingNodes: new Map(), headingExpanded: new Set(), ...parts };
  }
  function patchRow(parts, turn, index) {
    const label = titles[turn.key] || turn.prompt;
    parts.checkbox.checked = selected.has(turn.key);
    parts.checkbox.setAttribute('aria-label', `选择第 ${index} 条回复`);
    setText(parts.number, String(index).padStart(2, '0'));
    parts.jump.title = label; setText(parts.title, label);
    setText(parts.meta, `${titles[turn.key] ? '已自定义 · ' : ''}${turn.answers.length ? '模型回复' : '等待回复'}`);
    parts.edit.setAttribute('aria-label', `编辑第 ${index} 条标题`);
    parts.delete.setAttribute('aria-label', `删除第 ${index} 条导航`);
    const open = expanded.has(turn.key) && !!turn.headings.length;
    const toggle = parts['heading-toggle'];
    toggle.disabled = !turn.headings.length;
    toggle.title = turn.headings.length ? `${open ? '收起' : '展开'}回复标题（H1–H3，共 ${turn.headings.length} 项）` : '回复暂无一至三级标题';
    toggle.setAttribute('aria-label', `${open ? '收起' : '展开'}第 ${index} 条回复标题`);
    toggle.setAttribute('aria-expanded', String(open)); setText(toggle, open ? '▾' : '▸');
    const keys = new Set(turn.headings.map(heading => heading.key));
    for (const key of parts.headingNodes.keys()) if (!keys.has(key)) { parts.headingNodes.delete(key); parts.headingExpanded.delete(key); }
    if (open) {
      const children = new Map();
      for (const heading of turn.headings) {
        const parent = keys.has(heading.parentKey) ? heading.parentKey : null;
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(heading);
      }
      function outline(parent) {
        return (children.get(parent) || []).map(heading => {
          let node = parts.headingNodes.get(heading.key);
          if (!node) {
            const item = document.createElement('div'); item.className = 'heading-item'; item.setAttribute('role', 'listitem'); item.dataset.headingKey = heading.key;
            const line = document.createElement('div'); line.className = 'heading-line';
            const button = document.createElement('button'); button.className = 'heading-jump';
            button.addEventListener('click', () => jump(turn.key, heading.key));
            const toggle = document.createElement('button'); toggle.className = 'heading-children-toggle';
            toggle.addEventListener('click', () => {
              parts.headingExpanded.has(heading.key) ? parts.headingExpanded.delete(heading.key) : parts.headingExpanded.add(heading.key);
              render();
            });
            const group = document.createElement('div'); group.className = 'heading-children'; group.setAttribute('role', 'list');
            line.append(button); item.append(line);
            node = { item, line, button, toggle, group }; parts.headingNodes.set(heading.key, node);
          }
          node.item.dataset.level = heading.level;
          setText(node.button, heading.title); node.button.title = heading.title;
          node.button.setAttribute('aria-label', `${heading.level}级标题：${heading.title}`);
          const hasChildren = children.has(heading.key);
          const childOpen = hasChildren && parts.headingExpanded.has(heading.key);
          if (hasChildren) {
            if (node.toggle.parentNode !== node.line) node.line.append(node.toggle);
            node.toggle.setAttribute('aria-expanded', String(childOpen));
            node.toggle.setAttribute('aria-label', `${childOpen ? '收起' : '展开'}“${heading.title}”的子标题`);
            node.toggle.title = `${childOpen ? '收起' : '展开'}子标题`;
            setText(node.toggle, childOpen ? '▾' : '▸');
          } else node.toggle.remove();
          if (childOpen) {
            reconcile(node.group, outline(heading.key));
            if (node.group.parentNode !== node.item) node.item.append(node.group);
          } else node.group.remove();
          return node.item;
        });
      }
      reconcile(parts.group, outline(null));
      if (parts.group.parentNode !== parts.row) parts.row.insertBefore(parts.group, parts.row.querySelector('.editor'));
    } else parts.group.remove();
  }

  function render() {
    const list = $('.list');
    const previousScroll = list.scrollTop;
    const filtered = matchingTurns();
    const indices = new Map(turns.map((turn, index) => [turn.key, index + 1]));
    for (const key of rowCache.keys()) {
      if (!indices.has(key) || deleted.has(key)) { rowCache.delete(key); if (editing === key) editing = null; }
    }
    const total = turns.length - deletedInInventory();
    setText($('.count'), `${total} 条`); setText($('#expand span'), `${total} 条`);
    const nodes = filtered.map(turn => {
      if (!rowCache.has(turn.key)) rowCache.set(turn.key, createRow(turn.key));
      const parts = rowCache.get(turn.key); patchRow(parts, turn, indices.get(turn.key)); return parts.row;
    });
    if (!nodes.length) {
      const empty = document.createElement('div'); empty.className = 'empty';
      empty.textContent = turns.length ? total ? '没有匹配的提问。清空搜索可查看完整目录。' : '本会话的导航项已全部删除。原始对话仍保留。' : settings.mode === 'compatibility'
        ? `兼容模式尚未识别到提问。请确认对话已加载，且扩展版本为 v${version}。`
        : '等待对话内容…\n开始提问后，这里会显示导航。若已有对话，请在设置中尝试兼容模式。';
      nodes.push(empty);
    }
    reconcile(list, nodes);
    list.scrollTop = previousScroll; updateButtons(); updateActive();
  }
  function closestTurn() {
    const boundary = innerHeight / 3;
    let current = null, closest = Infinity;
    for (const turn of turns) {
      if (!turn.anchor.isConnected || deleted.has(turn.key)) continue;
      const distance = Math.abs(turn.anchor.getBoundingClientRect().top - boundary);
      if (distance < closest) { closest = distance; current = turn; }
    }
    return current;
  }
  function locateCurrent() {
    const current = turns.find(turn => turn.key === activeKey && !deleted.has(turn.key)) || closestTurn() || matchingTurns()[0];
    if (!current) return;
    activeKey = current.key; $('#search').value = ''; render();
    const row = rowCache.get(current.key)?.row;
    if (!row) return;
    const list = $('.list'), area = list.getBoundingClientRect(), rect = row.getBoundingClientRect();
    if (rect.top < area.top || rect.bottom > area.bottom) list.scrollTop += rect.top - area.top - Math.max(0, (list.clientHeight - rect.height) / 2);
    row.querySelector('.jump').focus({ preventScroll: true });
  }
  async function refresh() {
    clearTimeout(timer); timer = null;
    host.toggleAttribute('data-dark', document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark');
    if (discovery.active && adapter.conversationKey(location, turns) === conversation) return;
    let next = adapter.collect(document, settings.mode);
    const nextConversation = adapter.conversationKey(location, next);
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
        const name = document.title.replace(/\s*[-|] ChatGPT\s*$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80) || 'ChatGPT';
        await downloadText(result.text, `${name}-${new Date().toISOString().slice(0, 10)}.md`, shadow);
      } else {
        await copyText(result.text, shadow);
      }
      notify(download ? `已导出 ${result.count} 条模型回复。` : `已复制 ${result.count} 条模型回复到剪贴板。`);
    } catch (error) { console.warn('[Conversation Navigator] Export failed', error); notify(download ? '下载失败，请检查浏览器的下载设置。' : '复制失败，请检查剪贴板权限，或使用「导出 .md」。'); }
  }

  try { const saved = await readStorage('settings'); if (saved) settings = { ...settings, ...saved }; } catch (error) { reportStorageError(error); }
  $('.panel').hidden = settings.collapsed; $('#expand').hidden = !settings.collapsed;
  $('#formula-format').value = settings.formulaFormat === 'markdown' ? 'markdown' : 'latex';
  $('#include-headings').checked = settings.includeHeadings; $('#compatibility').value = settings.mode;
  $('#collapse').addEventListener('click', () => collapsed(true)); $('#expand').addEventListener('click', () => collapsed(false));
  $('#settings-toggle').addEventListener('click', () => { const value = !$('.settings').hidden; $('.settings').hidden = value; $('#settings-toggle').setAttribute('aria-expanded', String(!value)); });
  $('#search').addEventListener('input', render);
  $('#clear-search').addEventListener('click', () => { $('#search').value = ''; render(); $('#search').focus({ preventScroll: true }); });
  $('#locate-current').addEventListener('click', locateCurrent);
  $('#select-all').addEventListener('click', () => { selected = new Set(turns.filter(turn => !deleted.has(turn.key)).map(turn => turn.key)); render(); });
  $('#select-visible').addEventListener('click', () => { matchingTurns().forEach(turn => selected.add(turn.key)); render(); });
  $('#select-none').addEventListener('click', () => { selected.clear(); render(); });
  $('#include-headings').addEventListener('change', () => { settings.includeHeadings = $('#include-headings').checked; saveSettings(); });
  $('#formula-format').addEventListener('change', () => { settings.formulaFormat = $('#formula-format').value; saveSettings(); });
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
  registerToggle(() => collapsed(!settings.collapsed));
  document.addEventListener('keydown', event => { if (event.altKey && event.shiftKey && event.code === 'KeyN') { event.preventDefault(); collapsed(!settings.collapsed); } });
  let scrollFrame;
  document.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      if (!turns.length || navigation.active || discovery.active) return;
      const current = closestTurn();
      if (current && activeKey !== current.key) { activeKey = current.key; updateActive(); }
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
