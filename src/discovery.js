import { scrollContainer } from './navigation.js';

const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
function roots() {
  return [...document.querySelectorAll('[data-turn-key]')].filter(node => !node.closest('[hidden], [aria-hidden="true"]') && node.getClientRects().length);
}

export function needsDiscovery(turns) {
  const candidates = roots();
  const represented = new Set(turns.map(turn => turn.anchor.closest('[data-turn-key]')));
  // ChatGPT keeps virtualisation CSS class names even when every body is loaded.
  // Probe only actual shells whose user message has not been collected.
  return candidates.some(node => !represented.has(node));
}

export function createDiscovery({ collect, merge, onState, context }) {
  let running = null;
  function cancel() {
    if (running) { running.cancelled = true; running.restore = false; running.reveal(); }
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
    let revealed = false;
    const token = { cancelled: false, restore: true, reveal() {
      if (revealed) return;
      revealed = true;
      if (originalOpacity) container.style.setProperty('opacity', originalOpacity, originalPriority);
      else container.style.removeProperty('opacity');
    } };
    const scope = context();
    running = token;
    onState('running', scope);
    // Prevent rapid transcript flashes while mounting off-screen turns. Geometry stays intact.
    container.style.setProperty('opacity', '0', 'important');
    const started = performance.now();
    const visited = new Set();
    try {
      while (!token.cancelled && container.isConnected && performance.now() - started < 25000) {
        const observed = collect(); merge(observed);
        observed.forEach(turn => visited.add(turn.key));
        const pending = roots().find(node => {
          const key = node.getAttribute('data-turn-key');
          return key && !visited.has(`id:${key}`) && !visited.has(`root:${key}`);
        });
        // Every available shell has been visited; walking huge replies cannot
        // discover another question and needlessly forces their rendering.
        if (!pending) break;
        visited.add(`root:${pending.getAttribute('data-turn-key')}`);
        pending.scrollIntoView({ behavior: 'instant', block: 'start' });
        await nextPaint();
      }
    } finally {
      if (token.restore && container.isConnected) {
        container.scrollTo({ top: originalTop, behavior: 'instant' });
        await nextPaint(); merge(collect());
      }
      token.reveal();
      if (running === token) running = null;
      onState(token.cancelled ? 'interrupted' : 'complete', scope);
    }
  }
  return { run, cancel, get active() { return running !== null; } };
}
