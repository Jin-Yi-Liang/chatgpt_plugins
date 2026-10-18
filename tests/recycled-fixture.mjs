export function recycledConversation(reverse = false, count = 64, nested = false) {
  return `<!doctype html><meta charset="utf-8"><title>整轮 DOM 回收与远距离跳转</title><style>
  body{margin:0;font:16px/1.5 system-ui}header{height:70px}.thread-scroll-container{height:760px;border:3px solid #ccc;overflow:auto;overflow-anchor:none;scroll-padding-top:24px;display:flex;flex-direction:${reverse ? 'column-reverse' : 'column'}}.transcript{width:740px;flex-shrink:0;padding-top:32px;margin:0 auto}.recycled-turn{display:flow-root;box-sizing:border-box;overflow:hidden}[data-user-message-bubble]{margin:12px 0;padding:16px;background:#eaf5f0}[data-markdown-text-style]{padding:16px}h1{font-size:24px}
  </style><header>相邻跳转与跨区跳转应同样可靠；不保留目标占位 DOM</header><main><div class="thread-scroll-container"><div class="transcript" data-chatgpt-conversation-selection-target></div></div></main><textarea id="paste-target"></textarea><script>
  let port=document.querySelector('.thread-scroll-container');
  let transcript=document.querySelector('.transcript');
  let heights=Array.from({length:${count}},(_,i)=>900+(i%3)*90), recycling=false, reuse=false, start=-1;
  window.recyclingStats={updates:0,scrolls:0,inputs:0};
  const sum=(a,b)=>heights.slice(a,b).reduce((n,h)=>n+h,0);
  function fill(node,index) {
    node.className='recycled-turn';node.dataset.turnKey='recycled-'+(index+1);node.style.height=heights[index]+'px';
    if(!node.children.length)node.innerHTML='<div data-user-message-bubble></div><div data-chatgpt-selection-message-id><div data-markdown-text-style><h1></h1><p>回复正文</p><h1></h1></div></div>';
    node.querySelector('[data-user-message-bubble]').textContent='第 '+(index+1)+' 个整轮回收提问';
    node.querySelector('[data-chatgpt-selection-message-id]').setAttribute('data-chatgpt-selection-message-id','answer-'+(index+1));
    node.querySelectorAll('h1')[0].textContent='回收一级标题 '+(index+1);
    if(${nested}) {
      const body=node.querySelector('[data-markdown-text-style]');
      if(!body.querySelector('h2')){const h2=document.createElement('h2'),h3=document.createElement('h3');body.insertBefore(h2,body.lastElementChild);body.insertBefore(h3,body.lastElementChild);}
      body.querySelector('h2').textContent='回收二级标题 '+(index+1);
      body.querySelector('h3').textContent='回收三级标题 '+(index+1);
    }
    node.querySelectorAll('h1')[1].textContent='回收第二个标题 '+(index+1);
  }
  function render() {
    if(!recycling)return;
    const max=Math.max(0,sum(0,${count})-port.clientHeight);
    const y=Math.max(0,Math.min(max,port.scrollTop+(${reverse} ? max : 0)));
    let index=0,top=0;while(index<${count}-1&&top+heights[index]<=y){top+=heights[index++];}
    const next=Math.max(0,Math.min(${count}-4,index-1));
    if(next===start)return;start=next;window.recyclingStats.updates++;
    if(!reuse||transcript.children.length!==6){
      transcript.replaceChildren();
      const before=document.createElement('div');before.className='before-spacer';transcript.append(before);
      for(let i=0;i<4;i++)transcript.append(document.createElement('div'));
      const after=document.createElement('div');after.className='after-spacer';transcript.append(after);
    }
    transcript.firstElementChild.style.height=sum(0,start)+'px';
    for(let i=0;i<4;i++)fill(transcript.children[i+1],start+i);
    transcript.lastElementChild.style.height=sum(start+4,${count})+'px';
  }
  function attach(){port.addEventListener('scroll',()=>{window.recyclingStats.scrolls++;render();});}
  for(let i=0;i<${count};i++){const n=document.createElement('div');fill(n,i);transcript.append(n);}attach();
  window.enableRecycling=mode=>{
    reuse=mode==='reuse';recycling=true;
    heights=heights.map((_,i)=>i%7===0?42000:i%5===0?13000:5000+(i%4)*1100);
    start=-1;render();port.scrollTop=${reverse} ? 0 : 0;render();
  };
  window.replaceScrollPort=()=>{
    const replacement=port.cloneNode(false);port.replaceWith(replacement);port=replacement;
    transcript=document.createElement('div');transcript.className='transcript';transcript.setAttribute('data-chatgpt-conversation-selection-target','');port.append(transcript);
    start=-1;attach();render();
  };
  document.addEventListener('click',e=>{if(e.composedPath().some(n=>n.classList?.contains('jump')||n.classList?.contains('heading-jump')))window.recyclingStats.inputs++;},true);
  </script>`;
}
