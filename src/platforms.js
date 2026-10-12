// Adapter contract: matches(location), collect(document, mode), conversationKey(location, turns).
// A turn is { key, prompt, anchor: Element, answers: Element[] }.
// Future platforms only need to implement this contract; they receive no permissions yet.
export function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return (value >>> 0).toString(36);
}

function visible(node) {
  if (node.closest('[hidden], [aria-hidden="true"]')) return false;
  // display:contents wrappers have no box, but their messages can still be rendered.
  const ownStyle = getComputedStyle(node);
  if (['hidden', 'collapse'].includes(ownStyle.visibility)) return false;
  for (let parent = node; parent; parent = parent.parentElement) {
    const style = parent === node ? ownStyle : getComputedStyle(parent);
    if (style.display === 'none' || style.contentVisibility === 'hidden') return false;
  }
  return true;
}

function mergeMessages(messages) {
  const result = [];
  for (const message of messages) {
    if (!['user', 'assistant'].includes(message.role) || !visible(message.node)) continue;
    if (result.some(existing => existing.role === message.role &&
      (existing.node.contains(message.node) || message.node.contains(existing.node)))) continue;
    result.push(message);
  }
  return result.sort((a, b) => a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
}

function boxAnchor(node) {
  if (node.getClientRects().length) return node;
  return [...node.querySelectorAll('.whitespace-pre-wrap, [data-user-message-bubble], div, p')]
    .find(child => child.getClientRects().length && visible(child)) || node;
}

function collectMessages(doc, compatibility) {
  let nodes = [...doc.querySelectorAll('main [data-message-author-role], [data-testid="conversation"] [data-message-author-role]')];
  if (!nodes.length) nodes = [...doc.querySelectorAll('[data-message-author-role]')];
  let messages = nodes.filter(node => visible(node) && !node.parentElement?.closest('[data-message-author-role]'))
    .map(node => ({ node, role: node.getAttribute('data-message-author-role') }));
  // Current ChatGPT shell uses semantic bubble/Markdown markers instead of article/author-role.
  const modern = [...doc.querySelectorAll('[data-user-message-bubble], [data-markdown-text-style]')].flatMap(node => {
    if (node.hasAttribute('data-user-message-bubble')) return [{ node, role: 'user' }];
    if (node.closest('[data-user-message-bubble], [data-message-author-role="user"], [data-testid*="reasoning"], [data-testid*="thinking"]')) return [];
    if (node.parentElement?.closest('[data-markdown-text-style]')) return [];
    if (!node.closest('[data-chatgpt-conversation-selection-target], [data-turn-key], [data-thread-user-message-navigation-content]')) return [];
    const wrapper = node.closest('[data-chatgpt-selection-message-id]');
    return [{ node: wrapper && !wrapper.querySelector('[data-user-message-bubble]') ? wrapper : node, role: 'assistant' }];
  });
  messages = mergeMessages([...messages, ...modern]);
  if (compatibility || !messages.some(message => message.role === 'user')) {
    const turns = [...doc.querySelectorAll('article, [data-testid^="conversation-turn"], [data-turn="user"], [data-turn="assistant"]')];
    const fallback = turns.filter(visible).map(node => {
      const roleNode = node.matches('[data-message-author-role]') ? node : node.querySelector('[data-message-author-role]');
      const label = node.querySelector('h4.sr-only, h5, h6, [data-speaker]')?.textContent.trim().toLowerCase() || '';
      const role = roleNode?.getAttribute('data-message-author-role') || node.getAttribute('data-turn') ||
        (/^(you said|you|你说|你)：?:?$/.test(label) ? 'user' : /^(chatgpt said|chatgpt|assistant|chatgpt 说)：?:?$/.test(label) ? 'assistant' : '');
      return { node: roleNode || node, role };
    }).filter(({ role }) => ['user', 'assistant'].includes(role));
    messages = mergeMessages([...messages, ...fallback]);
  }
  return messages;
}

const chatgpt = {
  id: 'chatgpt', name: 'ChatGPT', enabled: true,
  matches: location => ['chatgpt.com', 'chat.openai.com'].includes(location.hostname),
  collect(doc, mode = 'auto') {
    const messages = collectMessages(doc, mode === 'compatibility');
    const result = [];
    const occurrences = new Map();
    for (const { node, role } of messages) {
      if (role === 'user') {
        const body = node.querySelector('.whitespace-pre-wrap') || node;
        const clone = body.cloneNode(true);
        clone.querySelectorAll('button, h5, h6, [data-speaker], .sr-only').forEach(n => n.remove());
        const prompt = (clone.textContent || '').trim() || '附件提问';
        const fingerprint = hash(prompt);
        const occurrence = occurrences.get(fingerprint) || 0;
        occurrences.set(fingerprint, occurrence + 1);
        const id = node.getAttribute('data-message-id') || node.closest('[data-turn-id]')?.getAttribute('data-turn-id') || node.closest('[data-turn-key]')?.getAttribute('data-turn-key');
        result.push({ key: id ? `id:${id}` : `text:${fingerprint}:${occurrence}`, prompt, anchor: boxAnchor(node.closest('article') || node), answers: [] });
      } else if (role === 'assistant' && result.length) {
        result.at(-1).answers.push(node);
      }
    }
    return result;
  },
  conversationKey(location, turns) {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    return `chatgpt:${path === '/' || /^\/g\/[^/]+$/.test(path) ? `draft:${turns[0]?.key || 'empty'}` : path}`;
  }
};

export const adapters = [chatgpt,
  { id: 'deepseek', name: 'DeepSeek', enabled: false, matches: location => location.hostname === 'chat.deepseek.com', collect: () => [], conversationKey: location => `deepseek:${location.pathname}` },
  { id: 'claude', name: 'Claude', enabled: false, matches: location => location.hostname === 'claude.ai', collect: () => [], conversationKey: location => `claude:${location.pathname}` }
];
export function findAdapter(location) { return adapters.find(adapter => adapter.enabled && adapter.matches(location)); }
