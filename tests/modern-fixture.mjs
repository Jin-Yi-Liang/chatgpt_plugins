import { readFile } from 'node:fs/promises';

// The shell structure came from the user's failing Firefox page. All original text/IDs
// were already removed. Restore synthetic questions and replies only for acceptance tests.
const shell = await readFile(new URL('./fixtures/chatgpt-shell-redacted.html', import.meta.url), 'utf8');
export const modernConversation = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>新版页面结构测试 - ChatGPT</title><style>
body{margin:0;font:16px/1.7 system-ui;background:#f8fafb;color:#25303a}.contents{display:contents}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.thread-scroll-container{height:780px;overflow-y:auto;display:flex;flex-direction:column-reverse}[data-thread-user-message-navigation-content]{width:700px;max-width:70vw;margin:auto}[data-chatgpt-conversation-selection-target]{display:flex;flex-direction:column;gap:24px}[data-user-message-bubble]{background:#eaf5f0;padding:20px;margin:20px 0;scroll-margin-top:30px;border-radius:12px}[data-markdown-text-style]{background:white;padding:20px;border-radius:12px}.thread-scroll-container pre{background:#20252b;color:white;padding:16px}
</style></head><body>${shell}</main>
<script>
const first = document.querySelector('[data-turn-key]');
first.setAttribute('data-turn-key', 'modern-1');
first.style.display = 'contents';
const bubble = first.querySelector('[data-user-message-bubble]');
bubble.querySelector('.whitespace-pre-wrap').textContent = '相同提问：新版页面适配';
const reply = first.querySelector('[data-chatgpt-selection-message-id]');
reply.setAttribute('data-chatgpt-selection-message-id', 'modern-answer-1');
reply.querySelector('[data-markdown-text-style]').innerHTML = '<h4>需要保留的四级标题</h4><p>新版回复一：从语义标记识别。</p><pre><code class="language-python">print("modern")</code></pre><div aria-hidden="true" style="height:900px"></div>';
const tools = document.createElement('p'); tools.textContent = '正文外的操作文字：不要导出'; reply.append(tools);
const second = first.cloneNode(true); second.setAttribute('data-turn-key', 'modern-2');
second.querySelector('[data-chatgpt-selection-message-id]').setAttribute('data-chatgpt-selection-message-id', 'modern-answer-2');
second.querySelector('[data-markdown-text-style]').innerHTML = '<h4>第二份回复标题</h4><p>新版回复二：重复问题仍应独立。</p>';
first.after(second);
const hidden = second.cloneNode(true); hidden.setAttribute('data-turn-key', 'modern-hidden'); hidden.style.display = 'none'; second.after(hidden);
const ariaHidden = second.cloneNode(true); ariaHidden.setAttribute('data-turn-key', 'modern-aria-hidden'); ariaHidden.setAttribute('aria-hidden', 'true'); hidden.after(ariaHidden);
</script></body></html>`;
