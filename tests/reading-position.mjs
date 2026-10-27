import assert from 'node:assert/strict';
import path from 'node:path';

export function readingConversation(mode='normal') {
  const reverse=mode==='reverse',documentPort=mode==='document';
  const count=mode==='short'?3:8;
  const editorId=mode==='mobile'?'mobile-composer-prompt':'prompt-textarea', sendId=mode==='mobile'?'mobile-send':'composer-submit-button';
  return `<!doctype html><meta charset="utf-8"><title>发送后保持历史阅读位置</title><style>
  body{margin:0;font:16px/1.6 system-ui;background:#f8fafb}header{height:60px}.thread-scroll-container{${documentPort?'':'height:720px;overflow:auto;'}border:3px solid #ddd;display:flex;flex-direction:${reverse?'column-reverse':'column'};overflow-anchor:auto;scroll-behavior:smooth}.transcript{width:720px;flex-shrink:0;margin:0 auto;padding:30px 0 180px}.turn{height:${mode==='short'?150:1900}px;background:white;margin-bottom:20px;padding:20px;box-sizing:border-box}h1{font-size:22px}.reading-line{margin-top:${mode==='short'?8:320}px;padding:15px;background:#edf6f0}form{position:fixed;bottom:10px;left:24px;width:650px;background:white;z-index:10;display:flex;gap:10px;padding:8px}#prompt-textarea,#mobile-composer-prompt{width:480px;min-height:50px;border:1px solid #bbb}#site-bottom{position:fixed;bottom:90px;left:12px;z-index:10}#other-form{display:none}
  ${mode==='manual-scrollbar'?'.thread-scroll-container{width:1000px;scrollbar-width:auto}#thread::-webkit-scrollbar{width:16px}#thread::-webkit-scrollbar-thumb{background:#888}':''}
  ${mode==='manual-outer'||mode==='manual-composer'?'body{min-height:1600px}':''}
  </style><header>受控页面：发送与流式更新会反复自动滚到底部</header><main><div class="thread-scroll-container" id="thread" tabindex="0"><div class="transcript">
  ${Array.from({length:count},(_,i)=>`<article class="turn" data-turn-key="reading-${i+1}"><div data-user-message-bubble>历史提问 ${i+1}</div><div data-chatgpt-selection-message-id="reading-answer-${i+1}"><div data-markdown-text-style><h1>历史回复 ${i+1}</h1><p class="reading-line" id="reading-line-${i+1}">正在阅读的历史段落 ${i+1}</p></div></div></article>`).join('')}
  </div></div></main><button id="site-bottom" aria-label="Scroll to bottom">滚动到底部</button>
  <form id="composer"><${mode==='editable'?`div id="${editorId}" contenteditable="true" role="textbox"`:`textarea id="${editorId}" name="${mode==='mobile'?'prompt':'prompt-textarea'}"`}>${mode==='editable'?'</div>':'</textarea>'}<button type="submit" id="${sendId}" ${mode==='mobile'?'':'data-testid="send-button"'} disabled aria-label="${mode==='mobile'?'发送消息':'Send prompt'}">发送</button></form>
  <script>
  const mode=${JSON.stringify(mode)},reverse=${reverse},docPort=${documentPort};
  const port=()=>docPort?document.scrollingElement:document.getElementById('thread');
  const editor=document.getElementById('${editorId}'),send=document.getElementById('${sendId}');
  const value=()=>editor.value??editor.textContent;
  window.readingStats={submissions:0,forces:0,streamed:0};
  function bottom(behavior='instant'){if(window.readingStats.manual)return;const p=port();p.scrollTo({top:reverse?0:p.scrollHeight,behavior});window.readingStats.forces++;}
  if(mode.startsWith('manual-')){
    window.addEventListener('pointerdown',e=>{const p=port(),r=p.getBoundingClientRect();if(e.isTrusted&&e.clientX>=r.left+p.clientLeft+p.clientWidth-2&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)window.readingStats.manual=true;},{capture:true,passive:true});
    window.addEventListener('wheel',e=>{if(e.isTrusted&&!e.composedPath().some(n=>n.id==='conversation-navigator-root')){window.readingStats.manual=true;window.readingStats.trustedWheels=(window.readingStats.trustedWheels||0)+1;}},{capture:true,passive:true});
    if(mode==='manual-stopped')document.addEventListener('wheel',e=>e.stopImmediatePropagation(),{capture:true,passive:true});
  }
  editor.addEventListener('input',()=>{send.disabled=!value().trim();});
  editor.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(value().trim())document.getElementById('composer').requestSubmit();}});
  document.getElementById('composer').addEventListener('submit',e=>{
    e.preventDefault();if(!value().trim())return;
    window.readingStats.lastPrompt=value();window.readingStats.submissions++;
    if('value'in editor)editor.value='';else editor.textContent='';send.disabled=true;
    bottom(mode==='smooth'?'smooth':'instant');
    setTimeout(()=>{
      const item=document.createElement('article');item.className='turn';item.dataset.turnKey='reading-new-'+window.readingStats.submissions;
      item.innerHTML='<div data-user-message-bubble>新提示词</div><div data-chatgpt-selection-message-id="new-answer"><div data-markdown-text-style><h1>新的模型回复</h1><p id="streaming">开始生成</p></div></div>';
      document.querySelector('.transcript').append(item);bottom();
    },20);
    for(const delay of[120,500,1200,2400])setTimeout(()=>{const n=document.getElementById('streaming');if(n)n.textContent+=' 流式正文';window.readingStats.streamed++;bottom(mode==='smooth'?'smooth':'instant');},delay);
    if(mode==='replacement'){
      setTimeout(()=>{const extra=document.createElement('div');extra.style.height='340px';extra.textContent='上方布局延迟增高';document.querySelector('.transcript').prepend(extra);bottom();},650);
      setTimeout(()=>{const old=document.getElementById('thread'),next=old.cloneNode(true);old.replaceWith(next);bottom();},1300);
      setTimeout(()=>bottom(),5200);
    }
  });
  document.getElementById('site-bottom').addEventListener('click',()=>bottom());
  window.prepareReading=()=>{
    if(mode==='body-only')document.querySelectorAll('[data-user-message-bubble]').forEach(n=>n.remove());
    if(mode==='body-leading')document.querySelectorAll('[data-user-message-bubble]').forEach((n,i)=>{if(i<3)n.remove();});
    const p=port(),line=document.getElementById('reading-line-3');
    const top=docPort?0:p.getBoundingClientRect().top+p.clientTop;
    p.scrollTo({top:p.scrollTop+line.getBoundingClientRect().top-top-100,behavior:'instant'});
  };
  </script>`;
}

export async function readingPositionTests(ui,{check,shadow,wait,pause,artifactDir,entry}) {
  const sample=()=>ui.eval(()=>{
    const p=window.location.pathname.includes('-document')?document.scrollingElement:document.getElementById('thread');
    const top=p===document.scrollingElement?0:p.getBoundingClientRect().top+p.clientTop;
    return {top:p.scrollTop,offset:document.getElementById('reading-line-3').getBoundingClientRect().top-top,range:p.scrollHeight-p.clientHeight,state:document.querySelector('#conversation-navigator-root').dataset.readingPosition,...window.readingStats};
  });
  async function open(mode){await ui.goto('/c/fixture-reading-'+mode);await wait(async()=>await shadow(r=>r?.querySelectorAll('.row').length)===(mode==='short'?3:8),'reading catalogue');await ui.eval(()=>window.prepareReading());await pause(100);return sample();}
  async function send(method='enter'){const mobile=await ui.eval(()=>!!document.getElementById('mobile-composer-prompt'));const editor=mobile?'#mobile-composer-prompt':'#prompt-textarea';await ui.pageFill(editor,'测试发送，不应离开历史段落');if(method==='click')await ui.pageClick(mobile?'#mobile-send':'#composer-submit-button');else await ui.pageKey(editor,'Enter');}
  entry.readingPosition=[];
  const isCase=name=>!process.env.TEST_READING_CASE||process.env.TEST_READING_CASE===name;
  if(isCase('basic'))await check('保持阅读：Enter、发送按钮、页面和正反向滚动容器',async()=>{
    for(const [mode,method]of[['body-leading','enter'],['body-only','enter'],['short','enter'],['normal','enter'],['document','click'],['reverse','enter'],['editable','click'],['mobile','click'],['smooth','enter']]){
      if(process.env.TEST_READING_MODE&&process.env.TEST_READING_MODE!==mode)continue;
      const before=await open(mode);await send(method);await pause(2850);const after=await sample();
      entry.readingPosition.push({mode,method,before,after});
      assert.ok(Math.abs(after.offset-before.offset)<=3,`${mode}: reading paragraph must stay at original offset ${JSON.stringify({before,after})}`);
      assert.equal(after.submissions,1,'prompt still sent exactly once');assert.equal(after.lastPrompt,'测试发送，不应离开历史段落','prompt payload unchanged');assert.equal(after.streamed,4);assert.ok(after.forces>=6,'site really attempted auto scrolling');
      assert.equal(after.state,'held');
    }
    await ui.screenshot(path.join(artifactDir,entry.browser+'-keep-reading.png'));
  });
  if(isCase('replacement'))await check('保持阅读：上方重排、滚动容器替换与延迟自动滚动',async()=>{
    const before=await open('replacement');await send();await pause(5750);const after=await sample();entry.readingPosition.push({mode:'replacement',before,after});
    assert.ok(Math.abs(after.offset-before.offset)<=3,JSON.stringify({before,after}));assert.equal(after.state,'held');assert.ok(after.top>before.top+300);
  });
  if(isCase('control'))await check('保持阅读：手动滚动、目录跳转、站点到底部和路由切换可接管',async()=>{
    await open('normal');await send();await pause(2800);const held=await sample();
    await ui.manualScroll();await wait(async()=>{const s=await sample();return s.state==='idle'&&s.top>held.top+100;},'manual scroll releases and moves');
    assert.equal(await ui.eval(()=>{const p=document.getElementById('thread');return p.style.scrollBehavior===''&&p.style.overflowAnchor===''&&!p.hasAttribute('data-conversation-navigator-reading');}),true,'temporary styles restored');
    await open('normal');await send('click');await pause(2800);await ui.click('.row[data-key="id:reading-8"] .jump');
    await wait(async()=>await ui.eval(()=>{const p=document.getElementById('thread'),n=document.querySelector('[data-turn-key="reading-8"]');return Math.abs(n.getBoundingClientRect().top-p.getBoundingClientRect().top-p.clientTop-16)<=3;}),'navigation still works');assert.equal((await sample()).state,'idle');
    await open('normal');await send();await pause(2800);await ui.pageClick('#site-bottom');await wait(async()=>{const s=await sample();return s.state==='idle'&&Math.abs(s.top-s.range)<=3;},'site latest button');
    await open('normal');await send();await pause(2800);await ui.eval(()=>{history.pushState({},'',location.pathname+'-other-route');document.getElementById('thread').scrollTo({top:0,behavior:'instant'});});
    await wait(async()=>(await sample()).state==='idle','route change releases');assert.equal((await sample()).top,0);
  });
  if(isCase('streaming'))await check('流式期间接管：正文、外层页面、输入区边界和被页面截断的滚轮',async()=>{
    for(const [mode,selector]of[['manual-normal','#thread'],['manual-outer','header'],['manual-composer','#prompt-textarea'],['manual-stopped','#thread']]){
      if(process.env.TEST_READING_MODE&&process.env.TEST_READING_MODE!==mode)continue;
      await open(mode);await send();await wait(async()=>(await sample()).streamed>=1,'stream started before scrolling');
      const before=await ui.eval(()=>({inner:document.getElementById('thread').scrollTop,outer:document.scrollingElement.scrollTop}));
      await ui.pageWheel(selector,220);await pause(200);const after=await sample();
      entry.readingPosition.push({mode,before,after});
      assert.equal(after.state,'idle',`${mode}: trusted wheel must release original anchor during streaming`);
      await wait(async()=>await ui.eval(({before,mode})=>mode==='manual-outer'||mode==='manual-composer'?document.scrollingElement.scrollTop>before.outer+40:document.getElementById('thread').scrollTop>before.inner+40,{before,mode}),'real wheel moved page');
      const moved=await ui.eval(()=>({inner:document.getElementById('thread').scrollTop,outer:document.scrollingElement.scrollTop}));
      await pause(2600);const end=await sample();
      assert.equal(end.state,'idle');assert.equal(end.streamed,4,'stream continues after user takeover');
      const stable=await ui.eval(()=>({inner:document.getElementById('thread').scrollTop,outer:document.scrollingElement.scrollTop}));
      assert.ok(Math.abs(stable.inner-moved.inner)<=3&&Math.abs(stable.outer-moved.outer)<=3,`${mode}: must not return to original position`);
      await ui.pageWheel(mode==='manual-outer'||mode==='manual-composer'?'#prompt-textarea':'#thread',-160);await pause(300);
      const up=await ui.eval(()=>({inner:document.getElementById('thread').scrollTop,outer:document.scrollingElement.scrollTop}));
      assert.ok(mode==='manual-outer'||mode==='manual-composer'?up.outer<stable.outer-30:up.inner<stable.inner-30,'can also scroll upwards');
    }
  });
  if(isCase('isolation'))await check('流式期间接管：原生滚动条、输入区内部滚动与导航面板隔离',async()=>{
    await open('manual-scrollbar');await send();await wait(async()=>(await sample()).streamed>=1,'scrollbar stream started');
    const before=await sample();await ui.screenshot(path.join(artifactDir,entry.browser+'-scrollbar.png'));await ui.pageScrollbar('#thread');
    entry.readingPosition.push({mode:'manual-scrollbar',before,after:await sample()});
    await wait(async()=>{const s=await sample();return s.state==='idle'&&Math.abs(s.top-before.top)>80;},'native scrollbar drag releases hold');
    await pause(2700);assert.equal((await sample()).state,'idle','stream cannot rearm hold');
    await open('manual-normal');await send();await wait(async()=>(await sample()).streamed>=1,'isolation stream started');
    await ui.wheel('.list',240);await pause(100);assert.equal((await sample()).state,'held','sidebar wheel keeps body hold');
    await ui.pageFill('#prompt-textarea',Array.from({length:25},(_,i)=>'draft line '+i).join('\n'));
    await ui.eval(()=>{const e=document.getElementById('prompt-textarea');e.style.height='70px';e.scrollTop=0;});
    await ui.pageWheel('#prompt-textarea',120);await pause(200);
    assert.ok(await ui.eval(()=>document.getElementById('prompt-textarea').scrollTop>30),'native editor scroll moved');
    assert.equal((await sample()).state,'held','editor-local scroll keeps body hold');
    await ui.eval(()=>{const e=document.getElementById('prompt-textarea');e.scrollTop=e.scrollHeight;});
    await ui.pageWheel('#prompt-textarea',120);await pause(200);assert.equal((await sample()).state,'idle','editor boundary releases body hold');
  });
  if(isCase('settings'))await check('保持阅读：Shift+Enter、空输入和关闭选项不拦截正常行为',async()=>{
    const before=await open('normal');await ui.pageFill('#prompt-textarea','第一行');await ui.pageKey('#prompt-textarea','Shift+Enter');await pause(150);
    assert.equal((await sample()).submissions,0);assert.equal((await sample()).state,'idle');assert.ok(Math.abs((await sample()).offset-before.offset)<=3);
    await ui.eval(()=>{const b=document.getElementById('composer-submit-button');b.type='button';b.dataset.testid='stop-button';b.setAttribute('aria-label','Stop generating');b.disabled=false;});
    await ui.pageClick('#composer-submit-button');assert.equal((await sample()).state,'idle','stop button reusing composer id is not a send');
    await ui.eval(()=>{const b=document.getElementById('composer-submit-button');b.type='submit';b.dataset.testid='send-button';b.setAttribute('aria-label','Send prompt');});
    await ui.pageFill('#prompt-textarea','');await ui.pageKey('#prompt-textarea','Enter');assert.equal((await sample()).state,'idle');
    await ui.eval(()=>{const f=document.createElement('form');f.id='other-form-visible';f.style.cssText='position:fixed;top:140px;left:24px';f.innerHTML='<textarea id="other-editor"></textarea><button type="submit" id="other-submit">Other form</button>';f.addEventListener('submit',e=>e.preventDefault());document.body.append(f);});
    await ui.pageFill('#other-editor','无关表单');await ui.pageClick('#other-submit');assert.equal((await sample()).state,'idle','unrelated form does not arm');await ui.eval(()=>document.getElementById('other-form-visible').remove());
    await ui.click('#settings-toggle');await ui.click('#keep-reading');await pause(300);await ui.reload();await wait(async()=>await shadow(r=>r?.querySelector('#keep-reading')?.checked)===false,'disabled setting persists');
    await ui.eval(()=>window.prepareReading());await send();await pause(2800);const unguarded=await sample();assert.equal(unguarded.state,'idle');assert.ok(Math.abs(unguarded.top-unguarded.range)<=3,'disabled option restores site auto-scroll');
    await ui.click('#settings-toggle');await ui.click('#keep-reading');await pause(300);
  });
}
