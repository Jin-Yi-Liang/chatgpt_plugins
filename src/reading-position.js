import { hasLayout, scrollContainer, viewport } from './navigation.js';

const editorSelector = '#prompt-textarea, #mobile-composer-prompt, textarea[name="prompt"], textarea[name="prompt-textarea"], textarea[data-id="root"], [data-testid="composer-text-input"][contenteditable="true"]';
const sendSelector = '[data-testid="send-button"], #composer-submit-button, button[aria-label="Send prompt"], button[aria-label="Send message"], button[aria-label="发送提示"], button[aria-label="发送消息"]';
const scrollKeys = ['PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp', ' '];
const textOf = editor => (editor?.value ?? editor?.textContent ?? '').trim();
const inNavigator = event => event.composedPath().some(node => node.id === 'conversation-navigator-root');

function ownerOf(node) {
  const owner = node?.closest('[data-message-id], [data-turn-key], [data-turn-id], [data-testid^="conversation-turn"]');
  const identity = owner && ['data-message-id', 'data-turn-key', 'data-turn-id', 'data-testid'].map(attribute => ({ attribute, value: owner.getAttribute(attribute) })).find(item => item.value);
  return { owner, identity };
}
// An editor may consume its own wheel input. At its boundary (including an
// empty composer after sending), the browser can chain the gesture to the page.
function editorConsumesWheel(event) {
  const editor = event.target.closest?.(editorSelector);
  if (!editor || event.type !== 'wheel' || !event.deltaY) return false;
  const range = editor.scrollHeight - editor.clientHeight;
  return range > 1 && (event.deltaY < 0 ? editor.scrollTop > 1 : editor.scrollTop < range - 1);
}
function onScrollbar(event, container) {
  if (!container.isConnected || container.scrollHeight <= container.clientHeight + 1) return false;
  const documentPort = container === document.scrollingElement;
  const rect = documentPort ? { left: 0, right: innerWidth, top: 0, bottom: innerHeight } : container.getBoundingClientRect();
  const left = rect.left + container.clientLeft, right = left + container.clientWidth;
  // Check both edges for RTL/native left-hand scrollbars. An overlay scrollbar
  // may have zero layout width; include its hit area at the edge of the port.
  return event.clientY >= rect.top && event.clientY <= rect.bottom
    && (documentPort || event.target === container)
    && (event.clientX >= right - 2 || event.clientX < left || (documentPort && event.clientX <= 2));
}
function sameOwner(owner, identity) { return !identity || owner?.getAttribute(identity.attribute) === identity.value; }
function scrollAncestors(anchor) {
  const nodes = [];
  for (let node = anchor.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY)) nodes.push(node);
  }
  if (!nodes.includes(document.scrollingElement)) nodes.push(document.scrollingElement);
  return nodes.map(node => ({ node, top: node.scrollTop, range: Math.max(0, node.scrollHeight - node.clientHeight), reverse: getComputedStyle(node).flexDirection === 'column-reverse' }));
}
function readingTargets(turns) {
  const paired = turns.flatMap(turn => [turn.anchor, ...turn.answers]).filter(hasLayout);
  if (paired.length) return paired;
  // A virtual window may contain only a long assistant reply while its user
  // bubble is unmounted. Reading preservation must not require a paired turn.
  return [...document.querySelectorAll('[data-message-author-role="assistant"], [data-turn-key] [data-markdown-text-style], article .markdown')]
    .filter(node => !node.closest('[hidden], [aria-hidden="true"], [contenteditable="true"]') && hasLayout(node));
}
let styleSequence = 0;
function temporaryStyles(container, previous = null) {
  const marker = 'data-conversation-navigator-reading';
  const inherited = previous && container.getAttribute(marker) === previous.token;
  const saved = inherited ? previous.saved : ['scroll-behavior', 'overflow-anchor'].map(property => ({ property, value: container.style.getPropertyValue(property), priority: container.style.getPropertyPriority(property) }));
  const originalMarker = inherited ? previous.originalMarker : container.getAttribute(marker);
  const token = previous?.token || String(++styleSequence);
  container.setAttribute(marker, token);
  container.style.setProperty('scroll-behavior', 'auto', 'important');
  container.style.setProperty('overflow-anchor', 'none', 'important');
  return { saved, token, originalMarker, restore() {
    saved.forEach(({ property, value, priority }) => value ? container.style.setProperty(property, value, priority) : container.style.removeProperty(property));
    if (originalMarker === null) container.removeAttribute(marker); else container.setAttribute(marker, originalMarker);
  } };
}

export function createReadingPosition({ collect, enabled, beforeHold, onState }) {
  let hold = null, frame = 0, pendingTimer = null;
  function cancel() {
    if (!hold) return;
    hold.styles.restore(); hold = null;
    clearTimeout(pendingTimer); cancelAnimationFrame(frame); frame = 0;
    onState('idle');
  }
  function confirm() {
    if (!hold || hold.confirmed) return;
    hold.confirmed = true; clearTimeout(pendingTimer); onState('held');
  }
  function observe(turns) {
    if (!hold) return;
    if (location.href !== hold.route || !enabled()) { cancel(); return; }
    if (turns.some(turn => !hold.keys.has(turn.key))) confirm();
  }
  function restore() {
    const state = hold;
    if (!state) return;
    if (!enabled() || location.href !== state.route) { cancel(); return; }
    if (!state.confirmed && state.text && (!state.editor.isConnected || !textOf(state.editor))) confirm();
    let owner = state.owner;
    if ((!hasLayout(owner) || !sameOwner(owner, state.identity)) && state.identity) {
      const { attribute, value } = state.identity;
      owner = document.querySelector(`[${attribute}="${CSS.escape(value)}"]`);
    }
    const anchorOwned = hasLayout(state.anchor) && sameOwner(state.owner, state.identity) && (!state.owner || (state.owner.isConnected && state.owner.contains(state.anchor)));
    const reference = anchorOwned ? state.anchor : hasLayout(owner) ? owner : null;
    let next = reference ? scrollContainer(reference) : state.container;
    if (!next.isConnected) {
      const targets = readingTargets(collect());
      if (!targets.length) return;
      next = scrollContainer(targets[0]);
    }
    // A short transcript may acquire its first scrollbar only after submission.
    // Keep every pre-existing scroll ancestor observable, then rebind to the
    // effective scroll port once overflow/layout changes.
    let rebound = false;
    if (next !== state.container && (next !== document.scrollingElement || next.scrollHeight > next.clientHeight + 1 || !state.container.isConnected)) {
      const original = state.ancestors.find(item => item.node === next);
      state.styles.restore(); state.container = next; state.styles = temporaryStyles(next, state.styles);
      if (original) { state.top = original.top; state.range = original.range; state.reverse = original.reverse; }
      rebound = true;
    }
    for (const saved of state.ancestors) {
      if (!saved.node.isConnected || saved.node === state.container) continue;
      const range = Math.max(0, saved.node.scrollHeight - saved.node.clientHeight);
      const top = saved.top - (saved.reverse ? range - saved.range : 0);
      const destination = Math.max(saved.reverse ? -range : 0, Math.min(saved.reverse ? 0 : range, top));
      if (Math.abs(saved.node.scrollTop - destination) > 1) saved.node.scrollTo({ top: destination, behavior: 'instant' });
    }
    const container = state.container, area = viewport(container);
    if (rebound) { state.offset = state.screenTop - area.top; state.ownerOffset = state.ownerScreenTop === null ? null : state.ownerScreenTop - area.top; }
    const range = Math.max(0, container.scrollHeight - container.clientHeight);
    let top = state.top - (state.reverse ? range - state.range : 0);
    const anchorValid = hasLayout(state.anchor) && container.contains(state.anchor) && sameOwner(state.owner, state.identity) && (!state.owner || (state.owner.isConnected && state.owner.contains(state.anchor)));
    if (anchorValid) top = container.scrollTop + state.anchor.getBoundingClientRect().top - area.top - state.offset;
    else if (hasLayout(owner) && sameOwner(owner, state.identity) && container.contains(owner) && state.ownerOffset !== null) {
      top = container.scrollTop + owner.getBoundingClientRect().top - area.top - state.ownerOffset;
    }
    const min = state.reverse ? -range : 0, max = state.reverse ? 0 : range;
    const destination = Math.max(min, Math.min(max, top));
    if (Math.abs(container.scrollTop - destination) > 1) container.scrollTo({ top: destination, behavior: 'instant' });
  }
  function queue() { if (hold && !frame) frame = requestAnimationFrame(() => { frame = 0; restore(); }); }
  function arm(editor, allowEmpty = false) {
    if (!enabled() || !editor || (!allowEmpty && !textOf(editor))) return;
    if (hold && hold.route === location.href) { queue(); return; }
    const turns = collect();
    const targets = readingTargets(turns);
    if (!targets.length) return;
    const container = scrollContainer(targets[0]), area = viewport(container);
    const port = container === document.scrollingElement ? { left: 0, width: innerWidth } : container.getBoundingClientRect();
    const point = document.elementFromPoint(port.left + Math.min(port.width * 0.45, 450), area.top + Math.min(80, area.height / 4));
    let anchor = point?.closest('p, li, pre, table, h1, h2, h3, .markdown, [data-user-message-bubble], [data-message-author-role], [data-markdown-text-style]');
    const chatBody = anchor?.closest('[data-message-author-role="assistant"], [data-markdown-text-style], article .markdown');
    if (!anchor || !container.contains(anchor) || (!chatBody && !targets.some(target => target === anchor || target.contains(anchor)))) {
      anchor = targets.find(node => { const rect = node.getBoundingClientRect(); return rect.bottom > area.top && rect.top < area.top + area.height; });
    }
    if (!anchor) return;
    const { owner, identity } = ownerOf(anchor);
    const state = { route: location.href, editor, text: textOf(editor), keys: new Set(turns.map(turn => turn.key)),
      container, anchor, owner, identity, ancestors: scrollAncestors(anchor), screenTop: anchor.getBoundingClientRect().top, ownerScreenTop: hasLayout(owner) ? owner.getBoundingClientRect().top : null, top: container.scrollTop, range: Math.max(0, container.scrollHeight - container.clientHeight),
      reverse: getComputedStyle(container).flexDirection === 'column-reverse', offset: anchor.getBoundingClientRect().top - area.top,
      ownerOffset: hasLayout(owner) ? owner.getBoundingClientRect().top - area.top : null,
      styles: temporaryStyles(container), confirmed: false };
    beforeHold(); hold = state; onState('pending');
    // A rejected/unsent Enter must not leave a permanent guard. Actual prompt
    // insertion or a cleared composer confirms submission without touching payloads.
    pendingTimer = setTimeout(() => { if (hold === state && !state.confirmed) cancel(); }, 10000);
    queue();
  }
  function sendingButton(target) {
    const button = target.closest('button');
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true' || button.matches('[data-testid="stop-button"]') || /^(stop|停止|中止)/i.test(button.getAttribute('aria-label') || '')) return null;
    if (button.matches(sendSelector) || (button.type === 'submit' && button.form?.querySelector(editorSelector))) return button;
    return null;
  }
  function editorFor(button) { return button.form?.querySelector(editorSelector) || document.querySelector(editorSelector); }
  window.addEventListener('keydown', event => {
    if (!event.isTrusted || inNavigator(event)) return;
    if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f')) { cancel(); return; }
    const editor = event.target.closest?.(editorSelector);
    if (editor && event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) arm(editor);
    else if (!editor && scrollKeys.includes(event.key)) cancel();
  }, true);
  for (const type of ['pointerdown', 'click']) window.addEventListener(type, event => {
    if (!event.isTrusted || inNavigator(event) || !(event.target instanceof Element)) return;
    const button = sendingButton(event.target);
    if (button) { arm(editorFor(button), true); return; }
    const clicked = event.target.closest('button');
    if (clicked && /(?:scroll|jump).*(?:bottom|latest)|(?:滚动|跳转|转到|跳至).*(?:底部|最新)/i.test(`${clicked.getAttribute('aria-label') || ''} ${clicked.title} ${clicked.textContent}`)) { cancel(); return; }
    if (type === 'pointerdown' && hold && [hold.container, ...hold.ancestors.map(item => item.node)].some(port => onScrollbar(event, port))) cancel();
  }, true);
  document.addEventListener('submit', event => { if (event.isTrusted && !inNavigator(event)) arm(event.target.querySelector?.(editorSelector)); }, true);
  // Restoration watches all saved scroll ancestors, so user takeover must not
  // depend on a hit inside the original inner port. Capture on window before
  // document/root handlers can stop propagation. Never prevent the native input:
  // this preserves wheel/trackpad momentum and the site's own follow cancellation.
  for (const type of ['wheel', 'touchstart']) window.addEventListener(type, event => {
    if (hold && event.isTrusted && !inNavigator(event) && !event.ctrlKey && !event.metaKey && !editorConsumesWheel(event)) cancel();
  }, { capture: true, passive: true });
  document.addEventListener('scroll', event => {
    if (hold && (event.target === hold.container || hold.ancestors.some(item => item.node === event.target) || (event.target === document && hold.ancestors.some(item => item.node === document.scrollingElement)))) restore();
  }, { capture: true, passive: true });
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', queue); window.addEventListener('popstate', () => { if (hold && location.href !== hold.route) cancel(); });
  onState('idle');
  return { cancel, observe, get active() { return hold !== null; } };
}
