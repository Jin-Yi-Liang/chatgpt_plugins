import { viewport, scrollContainer } from './navigation.js';

const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
function roots() {
  return [...document.querySelectorAll('[data-turn-key]')].filter(node => !node.closest('[hidden], [aria-hidden="true"]') && node.getClientRects().length);
}

export function needsDiscovery(turns) {
  const candidates = roots();
  return candidates.length > turns.length || !!document.querySelector('[data-virtualized-turn-content], [data-turn-key][class*="data-virtualized-turn-content"]');
}

export function createDiscovery({ collect, merge, onState, context }) {
  let running = null;
  function cancel() {
    if (running) { running.cancelled = true; running.restore = false; }
  }
  for (const type of ['wheel', 'pointerdown', 'touchstart', 'keydown']) document.addEventListener(type, event => { if (event.isTrusted) cancel(); }, { passive: true, capture: true });
  async function run() {
    if (running) return;
    const first = collect()[0];
    if (!first) return;
    const container = scrollContainer(first.anchor);
    const originalTop = container.scrollTop;
    const originalOpacity = container.style.getPropertyValue('opacity');
    const originalPriority = container.style.getPropertyPriority('opacity');
    const token = { cancelled: false, restore: true };
    const scope = context();
    running = token;
    onState('running', scope);
    // Prevent rapid transcript flashes while mounting off-screen turns. Geometry stays intact.
    container.style.setProperty('opacity', '0', 'important');
    const started = performance.now();
    const visited = new Set();
    try {
      const initialRoots = roots();
      const hasPlaceholders = initialRoots.some(node => !node.querySelector('[data-user-message-bubble]'));
      let walking = false;
      while (!token.cancelled && container.isConnected && performance.now() - started < 25000) {
        const observed = collect(); merge(observed);
        observed.forEach(turn => visited.add(turn.key));
        const pending = roots().find(node => {
          const key = node.getAttribute('data-turn-key');
          return key && !visited.has(`id:${key}`) && !visited.has(`root:${key}`);
        });
        if (pending) {
          visited.add(`root:${pending.getAttribute('data-turn-key')}`);
          pending.scrollIntoView({ behavior: 'instant', block: 'start' });
          await nextPaint();
          continue;
        }
        if (hasPlaceholders && initialRoots.every(node => visited.has(`id:${node.getAttribute('data-turn-key')}`))) break;
        const reverse = getComputedStyle(container).flexDirection === 'column-reverse';
        if (!walking) {
          walking = true;
          container.scrollTo({ top: reverse ? -container.scrollHeight : 0, behavior: 'instant' });
          await nextPaint(); continue;
        }
        const max = container.scrollHeight - container.clientHeight;
        const end = reverse ? 0 : max;
        if (Math.abs(container.scrollTop - end) <= 2) break;
        const before = container.scrollTop;
        container.scrollTo({ top: Math.min(end, before + viewport(container).height * 0.75), behavior: 'instant' });
        await nextPaint();
        if (Math.abs(container.scrollTop - before) <= 1) break;
      }
    } finally {
      if (token.restore && container.isConnected) {
        container.scrollTo({ top: originalTop, behavior: 'instant' });
        await nextPaint(); merge(collect());
      }
      if (originalOpacity) container.style.setProperty('opacity', originalOpacity, originalPriority);
      else container.style.removeProperty('opacity');
      if (running === token) running = null;
      onState(token.cancelled ? 'interrupted' : 'complete', scope);
    }
  }
  return { run, cancel, get active() { return running !== null; } };
}
