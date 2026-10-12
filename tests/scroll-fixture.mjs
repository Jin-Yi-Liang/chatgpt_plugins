export function scrollConversation(reverse = true, count = 12) {
  const turns = Array.from({ length: count }, (_, index) => `<div data-turn-key="scroll-${index + 1}"><div data-user-message-bubble><div class="whitespace-pre-wrap">第 ${index + 1} 个跳转测试提问：长会话中只点击一次</div></div><div data-chatgpt-selection-message-id="scroll-answer-${index + 1}"><div data-markdown-text-style><p>第 ${index + 1} 份回复</p><div class="reply-space" style="height:${1000 + index * 71}px"></div></div></div></div>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>单击跳转回归</title><style>
  body{margin:0;font:16px/1.7 system-ui}header{height:70px;background:#f6f8fa}.thread-scroll-container{height:760px;overflow-y:auto;display:flex;flex-direction:${reverse ? 'column-reverse' : 'column'};scroll-behavior:smooth;overflow-anchor:none;border:3px solid #ccc;scroll-padding-top:24px}.transcript{width:760px;margin:auto;flex-shrink:0;padding-top:40px;padding-bottom:80px}[data-user-message-bubble]{margin:16px 0;padding:16px;background:#eaf5f0}[data-markdown-text-style]{padding:16px;background:#f8fafb}
  </style><header>真实浏览器：长对话、嵌套滚动和延迟布局测试</header><main><div class="thread-scroll-container" tabindex="0"><div class="transcript" data-chatgpt-conversation-selection-target>${turns}</div></div></main><textarea id="paste-target"></textarea>
  <script>
  window.navigationClicks = 0;
  document.addEventListener('click', event => { if (event.composedPath().some(node => node.classList?.contains('jump'))) window.navigationClicks++; }, true);
  window.armLayoutChange = function(index) {
    const scroller = document.querySelector('.thread-scroll-container');
    scroller.addEventListener('scroll', function onScroll() {
      scroller.removeEventListener('scroll', onScroll);
      setTimeout(() => { document.querySelector('[data-turn-key="scroll-' + Math.max(1,index - 1) + '"] .reply-space').style.height = '2700px'; }, 70);
      setTimeout(() => { document.querySelector('[data-turn-key="scroll-' + index + '"] [data-user-message-bubble]').replaceWith(document.querySelector('[data-turn-key="scroll-' + index + '"] [data-user-message-bubble]').cloneNode(true)); }, 170);
      setTimeout(() => { document.querySelector('[data-turn-key="scroll-' + Math.min(${count},index + 1) + '"] .reply-space').style.height = '3500px'; }, 260);
    });
  };
  </script>`;
}

export function virtualConversation(count = 16) {
  // All turn positions exist, but the app renders only the nearby four message bodies.
  const shells = Array.from({ length: count }, (_, i) => `<div data-turn-key="virtual-${i + 1}" class="virtual-turn" style="height:720px"></div>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>窗口化会话回归</title><style>
  body{margin:0;font:16px/1.7 system-ui}header{height:70px}.thread-scroll-container{height:760px;overflow:auto;display:flex;flex-direction:column-reverse;overflow-anchor:none;border:3px solid #ccc}.transcript{width:720px;margin:auto;flex-shrink:0;padding-top:40px;padding-bottom:80px}[data-user-message-bubble]{padding:16px;margin:12px 0;background:#eaf5f0}[data-markdown-text-style]{padding:16px}.virtual-turn{box-sizing:border-box;display:flow-root}
  </style><header>窗口化会话：DOM 只保留附近消息，导航应列出全部提问</header><main><div class="thread-scroll-container" tabindex="0"><div class="transcript" data-chatgpt-conversation-selection-target>${shells}</div></div></main><textarea id="paste-target"></textarea><script>
  const scroller = document.querySelector('.thread-scroll-container');
  let mounted = '';
  function updateVirtualWindow() {
    const nodes = [...document.querySelectorAll('.virtual-turn')];
    const rect = scroller.getBoundingClientRect();
    let nearest = 0, distance = Infinity;
    nodes.forEach((node,index) => { const delta = Math.abs(node.getBoundingClientRect().top - rect.top); if (delta < distance) { distance = delta; nearest = index; } });
    const start = Math.max(0, Math.min(${count} - 4, nearest - 1));
    if (String(start) === mounted) return;
    mounted = String(start);
    nodes.forEach((node,index) => {
      if (index < start || index > start + 3) node.replaceChildren();
      else if (!node.children.length) node.innerHTML = '<div data-virtualized-turn-content><div data-user-message-bubble><div class="whitespace-pre-wrap">第 ' + (index+1) + ' 个窗口化提问：项目应保留并能选择删除</div></div><div data-chatgpt-selection-message-id="virtual-answer-' + (index+1) + '"><div data-markdown-text-style><h1>窗口化一级标题 ' + (index+1) + '</h1><p>窗口化回复 ' + (index+1) + '</p><h2>二级标题不进入子导航</h2><h1>窗口化第二个一级标题 ' + (index+1) + '</h1></div></div></div>';
    });
  }
  scroller.addEventListener('scroll', updateVirtualWindow);
  updateVirtualWindow();
  window.navigationClicks = 0;
  document.addEventListener('click', event => { if(event.composedPath().some(node=>node.classList?.contains('jump'))) window.navigationClicks++; }, true);
  </script>`;
}
