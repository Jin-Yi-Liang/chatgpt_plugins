import { positionHint } from './navigation.js';
import { hash } from './platforms.js';

function headings(answers, old = []) {
  const counts = new Map();
  return answers.flatMap(answer => [...answer.querySelectorAll('h1')]).filter(node => !node.closest('[data-testid*="reasoning"], [data-testid*="thinking"], [hidden], [aria-hidden="true"]')).map(anchor => {
    const title = anchor.textContent.replace(/\s+/g, ' ').trim();
    const fingerprint = hash(title);
    const index = counts.get(fingerprint) || 0; counts.set(fingerprint, index + 1);
    const key = `heading:${fingerprint}:${index}`;
    return { key, title, anchor, hint: positionHint(anchor) || old.find(item => item.key === key)?.hint };
  });
}

export function createInventory() {
  const entries = new Map();
  const order = [];
  const following = new Map();
  let mounted = [];
  function merge(turns) {
    mounted = turns.map(turn => turn.key);
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const old = entries.get(turn.key);
      if (!old) {
        const following = turns.slice(i + 1).find(next => entries.has(next.key));
        const previous = turns.slice(0, i).reverse().find(next => entries.has(next.key));
        const index = previous ? order.indexOf(previous.key) + 1 : following ? order.indexOf(following.key) : order.length;
        order.splice(index, 0, turn.key);
      }
      entries.set(turn.key, { ...turn, answers: turn.answers.length ? turn.answers : old?.answers || [], hint: positionHint(turn.anchor) || old?.hint });
      const entry = entries.get(turn.key);
      entry.headings = headings(entry.answers, old?.headings);
    }
    for (let i = 0; i < mounted.length - 1; i++) {
      if (!following.has(mounted[i])) following.set(mounted[i], new Set());
      following.get(mounted[i]).add(mounted[i + 1]);
    }
    const degree = new Map(order.map(key => [key, 0]));
    for (const links of following.values()) for (const key of links) if (degree.has(key)) degree.set(key, degree.get(key) + 1);
    const pending = order.filter(key => degree.get(key) === 0);
    const sorted = [];
    while (pending.length) {
      pending.sort((a,b) => (entries.get(a).hint?.top ?? Infinity) - (entries.get(b).hint?.top ?? Infinity));
      const key = pending.shift(); sorted.push(key);
      for (const next of following.get(key) || []) { degree.set(next, degree.get(next) - 1); if (degree.get(next) === 0) pending.push(next); }
    }
    if (sorted.length === order.length) order.splice(0, order.length, ...sorted);
    return all();
  }
  function all() { return order.map(key => entries.get(key)); }
  function resolve(key, collect, headingKey = null) {
    let entry = entries.get(key);
    if (!entry) return null;
    let target = headingKey ? entry.headings.find(heading => heading.key === headingKey) : entry;
    if (!target?.anchor?.isConnected || !target.anchor.getClientRects().length) {
      merge(collect()); entry = entries.get(key);
      target = headingKey ? entry.headings.find(heading => heading.key === headingKey) : entry;
    }
    if (!target) return null;
    const index = order.indexOf(key);
    const indices = mounted.map(id => order.indexOf(id)).filter(i => i >= 0);
    const direction = indices.length ? index < Math.min(...indices) ? -1 : index > Math.max(...indices) ? 1 : 0 : 0;
    return { anchor: target.anchor?.isConnected && target.anchor.getClientRects().length ? target.anchor : null, hint: target.hint ? { ...target.hint, direction } : entry.hint ? { ...entry.hint, direction } : null };
  }
  return { merge, all, resolve };
}
