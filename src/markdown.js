import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**' });
const escapeText = converter.escape.bind(converter);
converter.escape = text => escapeText(text).replace(/[<>]/g, '\\$&');
converter.use(gfm);
converter.addRule('strikethrough', { filter: ['del', 's', 'strike'], replacement: content => `~~${content}~~` });
converter.addRule('safeTable', {
  filter: 'table',
  replacement: (_content, node) => {
    const rows = [...node.rows];
    if (!rows.length) return '';
    const columns = Math.max(...rows.map(row => [...row.cells].reduce((sum, cell) => sum + cell.colSpan, 0)));
    const renderRow = row => {
      const cells = [...row.cells].flatMap(cell => {
        const content = converter.turndown(cell.innerHTML).replace(/\|/g, '\\|').split(/\n+/g).map(line => line.trim()).join('<br>');
        return [content, ...Array(Math.max(0, cell.colSpan - 1)).fill('')];
      });
      while (cells.length < columns) cells.push('');
      return `| ${cells.join(' | ')} |`;
    };
    const heading = [...rows[0].cells].every(cell => cell.tagName === 'TH');
    const header = heading ? renderRow(rows.shift()) : `| ${Array(columns).fill('').join(' | ')} |`;
    return `\n\n${header}\n| ${Array(columns).fill('---').join(' | ')} |\n${rows.map(renderRow).join('\n')}\n\n`;
  }
});
converter.addRule('latex', {
  filter: node => node.hasAttribute?.('data-navigator-latex'),
  replacement: (_content, node) => node.getAttribute('data-display') === 'true'
    ? `\n\n$$\n${node.getAttribute('data-navigator-latex')}\n$$\n\n`
    : `$${node.getAttribute('data-navigator-latex')}$`
});
converter.addRule('fencedCode', {
  filter: node => node.nodeName === 'PRE' && !!node.querySelector('code'),
  replacement: (_content, node) => {
    const code = node.querySelector('code');
    const text = code.textContent.replace(/\n$/, '');
    const longest = Math.max(2, ...(text.match(/`+/g) || []).map(run => run.length));
    const fence = '`'.repeat(longest + 1);
    const language = code.className.match(/(?:language|lang)-([\w+-]+)/)?.[1] || node.getAttribute('data-language') || '';
    return `\n\n${fence}${language}\n${text}\n${fence}\n\n`;
  }
});

export function answerMarkdown(message) {
  const clone = message.cloneNode(true);
  clone.querySelectorAll('button, nav, script, style, iframe, .sr-only, [aria-hidden="true"], [data-testid*="reasoning"], [data-testid*="thinking"], [data-message-author-role="user"], [data-user-message-bubble]').forEach(node => node.remove());
  // Prefer the rendered answer body, excluding speaker labels and message actions.
  const bodySelector = '.markdown, [data-testid="answer-content"], [data-markdown-text-style]';
  const bodies = clone.matches(bodySelector) ? [clone] : [...clone.querySelectorAll(bodySelector)].filter(node => {
    const parentBody = node.parentElement?.closest(bodySelector);
    return !parentBody || !clone.contains(parentBody);
  });
  const container = document.createElement('div');
  if (bodies.length) bodies.forEach(body => container.append(body));
  else {
    clone.querySelectorAll('h5, h6, [data-speaker], [data-testid="message-actions"]').forEach(node => node.remove());
    container.append(clone);
  }
  container.querySelectorAll('.katex').forEach(node => {
    const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    if (tex) {
      const display = !!node.closest('.katex-display');
      const math = document.createElement('span');
      math.setAttribute('data-navigator-latex', tex); math.setAttribute('data-display', String(display));
      // Keep a nonempty body so Turndown applies the custom rule, preserving LaTeX verbatim.
      math.textContent = tex; node.replaceWith(math);
    }
  });
  // Preserve safe links as Markdown without carrying active HTML into exports.
  container.querySelectorAll('a').forEach(node => {
    const url = node.getAttribute('href');
    if (url && !/^(https?:|mailto:|#|\/)/i.test(url)) node.removeAttribute('href');
    else if (url?.startsWith('/')) node.setAttribute('href', new URL(url, location.origin).href);
  });
  return converter.turndown(container).trim();
}

export function selectedMarkdown(turns, selected, titles, includeHeadings) {
  const blocks = [];
  const missing = [];
  for (const turn of turns) {
    if (!selected.has(turn.key)) continue;
    const reply = turn.answers.map(answerMarkdown).filter(Boolean).join('\n\n');
    if (!reply) { missing.push(turn.key); continue; }
    const title = (titles[turn.key] || turn.prompt).replace(/\s+/g, ' ').trim();
    const safeTitle = title.replace(/[\\`*_{}\[\]<>#|]/g, '\\$&');
    blocks.push(includeHeadings ? `## ${safeTitle}\n\n${reply}` : reply);
  }
  return { text: blocks.join('\n\n---\n\n') + (blocks.length ? '\n' : ''), missing, count: blocks.length };
}
