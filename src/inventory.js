import { positionHint, hasLayout } from './navigation.js';
import { hash } from './platforms.js';

function owner(anchor) {
  const shell = anchor.closest('[data-turn-key], article, [data-testid^="conversation-turn"]');
  const shellIdentity = shell && ['data-turn-key', 'data-turn-id', 'data-testid'].map(attribute => ({ attribute, value: shell.getAttribute(attribute) })).find(item => item.value);
  return { shell, shellIdentity };
}
function matches(shell, identity) {
  return !identity || shell?.getAttribute(identity.attribute) === identity.value;
}
function ownedLayout(target) {
  return hasLayout(target?.anchor) && matches(target.shell, target.shellIdentity)
    && (!target.shell || target.shell.contains(target.anchor));
}

function headings(answers, old = []) {
  const counts = new Map();
  const previous = new Map(old.map(item => [item.key, item]));
  return answers.flatMap(answer => [...answer.querySelectorAll('h1')]).filter(node => !node.closest('[data-testid*="reasoning"], [data-testid*="thinking"], [hidden], [aria-hidden="true"]')).map(anchor => {
    const title = anchor.textContent.replace(/\s+/g, ' ').trim();
    const fingerprint = hash(title);
    const index = counts.get(fingerprint) || 0; counts.set(fingerprint, index + 1);
    const key = `heading:${fingerprint}:${index}`;
    return { key, title, anchor, ...owner(anchor), hint: positionHint(anchor) || previous.get(key)?.hint };
  });
}

// Link new keys in one pass, preserving insertion beside the nearest known turn.
function insertNewKeys(order, entries, turns) {
  if (turns.every(turn => entries.has(turn.key))) return false;
  const next = new Map();
  const before = new Map();
  let previous = null;
  for (const key of order) {
    before.set(key, previous);
    if (previous !== null) next.set(previous, key);
    next.set(key, null); previous = key;
  }
  let first = order[0] ?? null;
  const firstKnown = turns.find(turn => entries.has(turn.key));
  previous = firstKnown ? before.get(firstKnown.key) : previous;
  for (const { key } of turns) {
    if (!next.has(key)) {
      next.set(key, previous === null ? first : next.get(previous));
      if (previous === null) first = key;
      else next.set(previous, key);
    }
    previous = key;
  }
  const result = [];
  for (let key = first; key !== null; key = next.get(key)) result.push(key);
  order.splice(0, order.length, ...result);
  return true;
}

function sortOrder(order, entries, following) {
  const degree = new Map(order.map(key => [key, 0]));
  for (const links of following.values()) for (const key of links) if (degree.has(key)) degree.set(key, degree.get(key) + 1);
  // A stable heap avoids repeatedly sorting and shifting a large disconnected queue.
  const pending = [];
  let sequence = 0;
  const before = (a, b) => {
    const delta = a.top - b.top;
    return delta < 0 || (!delta && a.sequence < b.sequence);
  };
  function enqueue(key) {
    const item = { key, top: entries.get(key).hint?.top ?? Infinity, sequence: sequence++ };
    let index = pending.length;
    pending.push(item);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!before(item, pending[parent])) break;
      pending[index] = pending[parent]; index = parent;
    }
    pending[index] = item;
  }
  function dequeue() {
    const first = pending[0];
    const last = pending.pop();
    if (pending.length) {
      let index = 0;
      while (index * 2 + 1 < pending.length) {
        let child = index * 2 + 1;
        if (child + 1 < pending.length && before(pending[child + 1], pending[child])) child++;
        if (!before(pending[child], last)) break;
        pending[index] = pending[child]; index = child;
      }
      pending[index] = last;
    }
    return first.key;
  }
  for (const key of order) if (degree.get(key) === 0) enqueue(key);
  const sorted = [];
  while (pending.length) {
    const key = dequeue(); sorted.push(key);
    for (const next of following.get(key) || []) {
      degree.set(next, degree.get(next) - 1);
      if (degree.get(next) === 0) enqueue(next);
    }
  }
  if (sorted.length === order.length) order.splice(0, order.length, ...sorted);
}

export function createInventory() {
  const entries = new Map();
  const order = [];
  const following = new Map();
  const indices = new Map();
  let mountedStart = Infinity;
  let mountedEnd = -Infinity;
  let mountedSamples = [];
  let lastResolveKey = '', lastResolveRefresh = -Infinity;
  function merge(turns) {
    let structureChanged = insertNewKeys(order, entries, turns);
    const samples = [];
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const old = entries.get(turn.key);
      const { shell, shellIdentity: identity } = owner(turn.anchor);
      const liveHint = positionHint(turn.anchor);
      if (liveHint) samples.push({ key: turn.key, ...liveHint });
      entries.set(turn.key, { ...turn, shell: shell || old?.shell, shellIdentity: identity || old?.shellIdentity,
        answers: turn.answers.length ? turn.answers : old?.answers || [], hint: liveHint || old?.hint });
      const entry = entries.get(turn.key);
      // Cached answer nodes may have been recycled for another turn. Only read
      // headings from answers collected under the current question.
      entry.headings = turn.answers.length ? headings(turn.answers, old?.headings) : old?.headings || [];
    }
    for (let i = 0; i < turns.length - 1; i++) {
      const key = turns[i].key, next = turns[i + 1].key;
      if (!following.has(key)) following.set(key, new Set());
      if (!following.get(key).has(next)) {
        following.get(key).add(next);
        structureChanged = true;
      }
    }
    // Streamed text and replaced DOM nodes still refresh above; only ordering is cached.
    if (structureChanged) {
      sortOrder(order, entries, following);
      order.forEach((key, index) => indices.set(key, index));
    }
    mountedSamples = samples.map(sample => ({ ...sample, index: indices.get(sample.key) }));
    mountedStart = Infinity; mountedEnd = -Infinity;
    for (const { key } of turns) {
      const index = indices.get(key);
      mountedStart = Math.min(mountedStart, index);
      mountedEnd = Math.max(mountedEnd, index);
    }
    return all();
  }
  function all() { return order.map(key => entries.get(key)); }
  function resolve(key, collect, headingKey = null) {
    let entry = entries.get(key);
    if (!entry) return null;
    let target = headingKey ? entry.headings.find(heading => heading.key === headingKey) : entry;
    if (!ownedLayout(target) && (lastResolveKey !== key || performance.now() - lastResolveRefresh >= 150)) {
      lastResolveKey = key; lastResolveRefresh = performance.now();
      merge(collect()); entry = entries.get(key);
      target = headingKey ? entry.headings.find(heading => heading.key === headingKey) : entry;
    }
    const index = indices.get(key);
    const direction = mountedStart === Infinity ? 0 : index < mountedStart ? -1 : index > mountedEnd ? 1 : 0;
    const anchor = ownedLayout(target) ? target.anchor : null;
    let hint = target?.hint || entry.hint;
    let source = 'history';
    if (!anchor) {
      // The body may be unmounted while its current placeholder still exists.
      // Cached offsets can be hundreds of thousands of pixels stale after reflow.
      let shell = entry.shell;
      if ((!hasLayout(shell) || !matches(shell, entry.shellIdentity)) && entry.shellIdentity) {
        const { attribute, value } = entry.shellIdentity;
        shell = [...document.querySelectorAll(`[${attribute}="${CSS.escape(value)}"]`)].find(hasLayout);
      }
      const currentHint = positionHint(shell);
      if (currentHint && matches(shell, entry.shellIdentity)) { hint = currentHint; source = 'shell'; }
      else {
        const sample = mountedSamples.find(item => item.container.isConnected);
        if (sample) {
          const positions = mountedSamples.filter(item => item.container === sample.container).map(({ index, top }) => ({ index, top }));
          hint = { ...(hint || sample), container: sample.container, search: { index, count: order.length, positions } };
          source = 'index';
        }
      }
    }
    // A reply can mount before its headings. Keep the requested key pending while
    // the page finishes rendering instead of silently cancelling the navigation.
    return { anchor, hint: hint ? { ...hint, direction, source } : null };
  }
  return { merge, all, resolve };
}
