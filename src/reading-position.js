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
function sameOwner(owner, identity) { return !identity || owner?.getAttribute(identity.attribute) === identity.value; }
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
    if (!state.container.isConnected) {
      const targets = collect().flatMap(turn => [turn.anchor, ...turn.answers]).filter(hasLayout);
      if (!targets.length) return;
      state.styles.restore(); state.container = scrollContainer(targets[0]);
      state.styles = temporaryStyles(state.container, state.styles);
    }
    const container = state.container, area = viewport(container);
    const range = Math.max(0, container.scrollHeight - container.clientHeight);
    let top = state.top - (state.reverse ? range - state.range : 0);
    let owner = state.owner;
    if ((!hasLayout(owner) || !sameOwner(owner, state.identity)) && state.identity) {
      const { attribute, value } = state.identity;
      owner = document.querySelector(`[${attribute}="${CSS.escape(value)}"]`);
    }
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
    const targets = turns.flatMap(turn => [turn.anchor, ...turn.answers]).filter(hasLayout);
    if (!targets.length) return;
    const container = scrollContainer(targets[0]), area = viewport(container);
    const port = container === document.scrollingElement ? { left: 0, width: innerWidth } : container.getBoundingClientRect();
    const point = document.elementFromPoint(port.left + Math.min(port.width * 0.45, 450), area.top + Math.min(80, area.height / 4));
    let anchor = point?.closest('p, li, pre, table, h1, h2, h3, [data-user-message-bubble], [data-message-author-role], [data-markdown-text-style]');
    if (!anchor || !container.contains(anchor) || !targets.some(target => target === anchor || target.contains(anchor))) {
      anchor = targets.find(node => { const rect = node.getBoundingClientRect(); return rect.bottom > area.top && rect.top < area.top + area.height; });
    }
    if (!anchor) return;
    const { owner, identity } = ownerOf(anchor);
    const state = { route: location.href, editor, text: textOf(editor), keys: new Set(turns.map(turn => turn.key)),
      container, anchor, owner, identity, top: container.scrollTop, range: Math.max(0, container.scrollHeight - container.clientHeight),
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
  document.addEventListener('keydown', event => {
    if (!event.isTrusted || inNavigator(event)) return;
    if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f')) { cancel(); return; }
    const editor = event.target.closest?.(editorSelector);
    if (editor && event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) arm(editor);
    else if (!editor && scrollKeys.includes(event.key)) cancel();
  }, true);
  for (const type of ['pointerdown', 'click']) document.addEventListener(type, event => {
    if (!event.isTrusted || inNavigator(event) || !(event.target instanceof Element)) return;
    const button = sendingButton(event.target);
    if (button) { arm(editorFor(button), true); return; }
    const clicked = event.target.closest('button');
    if (clicked && /(?:scroll|jump).*(?:bottom|latest)|(?:滚动|跳转|转到|跳至).*(?:底部|最新)/i.test(`${clicked.getAttribute('aria-label') || ''} ${clicked.title} ${clicked.textContent}`)) { cancel(); return; }
    if (type === 'pointerdown' && hold) {
      const port = hold.container, rect = port.getBoundingClientRect();
      const edge = port === document.scrollingElement ? document.documentElement.clientWidth : rect.left + port.clientLeft + port.clientWidth;
      if (event.clientX >= edge && (event.target === port || port === document.scrollingElement)) cancel();
    }
  }, true);
  document.addEventListener('submit', event => { if (event.isTrusted && !inNavigator(event)) arm(event.target.querySelector?.(editorSelector)); }, true);
  for (const type of ['wheel', 'touchstart']) document.addEventListener(type, event => {
    if (hold && event.isTrusted && !inNavigator(event) && !event.target.closest?.(editorSelector)
      && (hold.container === document.scrollingElement || hold.container.contains(event.target))) cancel();
  }, { capture: true, passive: true });
  document.addEventListener('scroll', event => {
    if (hold && (event.target === hold.container || (hold.container === document.scrollingElement && event.target === document))) restore();
  }, { capture: true, passive: true });
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', queue); window.addEventListener('popstate', () => { if (hold && location.href !== hold.route) cancel(); });
  onState('idle');
  return { cancel, observe, get active() { return hold !== null; } };
}
