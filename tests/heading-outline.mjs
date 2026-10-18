import assert from 'node:assert/strict';
import path from 'node:path';

export async function headingOutlineTests(ui, { check, shadow, wait, pause, artifactDir, entry }) {
  const row = key => `.row[data-key="id:${key}"]`;
  const prompt = row('user-1');
  const heading = async (title, control='heading-jump', prefix=prompt) => {
    const key = await shadow((root,{title,prefix})=>[...root.querySelectorAll(prefix+' .heading-item')].find(n=>n.querySelector(':scope > .heading-line > .heading-jump')?.textContent===title)?.dataset.headingKey,{title,prefix});
    assert.ok(key,`visible outline item ${title}`);
    return `${prefix} .heading-item[data-heading-key=${JSON.stringify(key)}] > .heading-line > .${control}`;
  };
  const visibleTitles = prefix => shadow((root,prefix)=>[...root.querySelectorAll(prefix+' .heading-jump')].map(n=>n.textContent),prefix);
  async function prepare(route) {
    await ui.goto('/c/fixture-primary-heading-'+route);
    await wait(async()=>await shadow(r=>r?.querySelectorAll('.row').length)===3,'three questions');
    if(await shadow(r=>r.querySelector('.panel').hidden))await ui.click('#expand');
    await ui.eval(()=>{
      document.querySelector('[data-message-id="answer-1"] > .markdown').innerHTML=`
        <h1 id="outline-a">章节 A</h1><p style="height:1300px">第一章正文</p>
        <h2 id="outline-a1">小节 A1</h2><p style="height:1400px">第二级正文</p>
        <h3 id="outline-a11">细节 A1.1</h3><p style="height:900px">第三级正文</p>
        <h3 id="outline-a12">细节 A1.2</h3><p>正文</p>
        <h2 id="outline-a2">小节 A2</h2><h3 id="outline-a21">细节 A2.1</h3>
        <h1 id="outline-b">章节 B</h1><h2 id="outline-b1">小节 B1</h2><h3>细节 B1.1</h3>
        <h4>四级标题不进入导航</h4><div hidden><h2>隐藏标题</h2></div>
        <div data-testid="reasoning"><h3>思考标题</h3></div>`;
    });
    await wait(async()=>!await shadow((r,p)=>r.querySelector(p+' .heading-toggle').disabled,prompt),'outline available');
    await pause(250);
  }
  entry.headingOutline = [];
  await check('分层标题：逐级默认收起、独立展开、只读和键盘操作',async()=>{
    await prepare('default');
    assert.deepEqual(await visibleTitles(prompt),[]);
    await ui.click(prompt+' .heading-toggle');
    assert.deepEqual(await visibleTitles(prompt),['章节 A','章节 B']);
    const scroll = await ui.eval(()=>scrollY);
    const a=await heading('章节 A','heading-children-toggle');
    assert.equal(await shadow((r,s)=>r.querySelector(s).getAttribute('aria-expanded'),a),'false');
    await ui.press(a,'Enter');
    assert.deepEqual(await visibleTitles(prompt),['章节 A','小节 A1','小节 A2','章节 B']);
    const a1=await heading('小节 A1','heading-children-toggle');
    assert.equal(await shadow((r,s)=>r.querySelector(s).getAttribute('aria-expanded'),a1),'false');
    await ui.press(a1,'Space');
    assert.deepEqual(await visibleTitles(prompt),['章节 A','小节 A1','细节 A1.1','细节 A1.2','小节 A2','章节 B']);
    assert.equal(await shadow((r,s)=>r.activeElement===r.querySelector(s),a1),true,'expansion preserves focused control');
    assert.equal(await shadow(r=>r.querySelectorAll('.heading-list .edit,.heading-list .delete,.heading-list input').length),0);
    assert.equal(await shadow(r=>r.querySelectorAll('.heading-item[data-level="3"] .heading-children-toggle').length),0,'leaf has no disclosure');
    assert.ok(Math.abs(await ui.eval(()=>scrollY)-scroll)<2,'disclosure does not navigate transcript');
    await ui.press(a,'Enter');
    assert.deepEqual(await visibleTitles(prompt),['章节 A','章节 B']);
    await ui.press(a,'Enter');
    assert.ok((await visibleTitles(prompt)).includes('细节 A1.1'),'collapse/reopen retains chosen subtree state');
    await ui.resize(480,800);
    assert.equal(await shadow(r=>{const p=r.querySelector('.panel'),l=r.querySelector('.list');return p.getBoundingClientRect().width<=480&&l.scrollWidth<=l.clientWidth+1;}),true);
    await ui.resize(1440,1000);
    await ui.screenshot(path.join(artifactDir,entry.browser+'-heading-outline.png'));
    await ui.reload();await wait(async()=>await shadow(r=>r?.querySelectorAll('.row').length)===3,'reload');
    assert.deepEqual(await visibleTitles(prompt),[],'reload starts closed');
  });
  await check('分层标题：H1/H2/H3 单击定位且展开不会触发跳转',async()=>{
    await prepare('navigation');await ui.click(prompt+' .heading-toggle');
    await ui.click(await heading('章节 A','heading-children-toggle'));
    await ui.click(await heading('小节 A1','heading-children-toggle'));
    for(const [title,id]of[['细节 A1.2','outline-a12'],['章节 A','outline-a'],['小节 A1','outline-a1'],['细节 A1.1','outline-a11']]){
      const began=Date.now();await ui.click(await heading(title));
      await wait(async()=>await ui.eval(id=>Math.abs(document.getElementById(id).getBoundingClientRect().top-16)<=3,id),'actual '+title+' offset');
      await pause(1100);
      const offset=await ui.eval(id=>document.getElementById(id).getBoundingClientRect().top,id);
      assert.ok(Math.abs(offset-16)<=3);
      entry.headingOutline.push({title,offset,elapsedMs:Date.now()-began});
    }
  });
  await check('分层标题：缺级、多回复、重复标题和动态结构更新',async()=>{
    await prepare('structure');await ui.click(prompt+' .heading-toggle');
    await ui.eval(()=>{
      const answer=document.querySelector('[data-message-id="answer-1"] > .markdown');
      const skipped=document.createElement('h3');skipped.textContent='跳级三级标题';answer.insertBefore(skipped,answer.querySelector('h2'));
      const next=document.createElement('article');next.innerHTML='<div data-message-author-role="assistant" data-message-id="outline-extra"><div class="markdown"><h2>独立二级标题</h2><h3>独立三级标题</h3><h2>独立二级标题</h2></div></div>';
      document.querySelector('[data-message-id="answer-1"]').closest('article').after(next);
    });
    await wait(async()=>(await visibleTitles(prompt)).length===4,'reply boundary creates roots');
    assert.deepEqual(await visibleTitles(prompt),['章节 A','章节 B','独立二级标题','独立二级标题']);
    await ui.click(await heading('章节 A','heading-children-toggle'));
    assert.ok((await visibleTitles(prompt)).includes('跳级三级标题'),'H3 attaches to nearest higher-level ancestor');
    await ui.click(await heading('小节 A1','heading-children-toggle'));
    const current=await heading('细节 A1.1');
    await shadow((r,s)=>{window.outlineRetainedButton=r.querySelector(s);},current);
    await ui.click(prompt+' .edit');await ui.fill('.editor textarea','保留中的标题草稿');
    await ui.eval(()=>{const n=document.getElementById('outline-a11');document.getElementById('outline-a1').before(n);});
    await wait(async()=>await shadow(r=>{const n=[...r.querySelectorAll('.heading-item')].find(n=>n.querySelector(':scope > .heading-line > .heading-jump')?.textContent==='细节 A1.1');return n?.parentElement?.parentElement?.querySelector(':scope > .heading-line > .heading-jump')?.textContent==='章节 A';}),'reparented heading');
    assert.equal(await shadow((r,s)=>r.querySelector(s)===window.outlineRetainedButton,current),true,'stable key retains button across reparent');
    assert.equal(await shadow(r=>r.querySelector('.editor textarea').value),'保留中的标题草稿');
    const labels=await visibleTitles(prompt);assert.ok(!labels.some(t=>/四级|隐藏|思考/.test(t)));
    const keys=await shadow((r,p)=>[...r.querySelectorAll(p+' .heading-item')].map(n=>n.dataset.headingKey),prompt);assert.equal(new Set(keys).size,keys.length);
  });
  await check('分层标题：整轮回收后 H2/H3 跨区单击仍能定位',async()=>{
    await ui.goto('/c/fixture-heading-virtual');await wait(async()=>await shadow(r=>r?.querySelectorAll('.row').length)===64,'64 questions');
    await ui.eval(()=>window.enableRecycling('reuse'));await pause(300);
    for(const [index,level]of[[59,3],[7,2],[48,3]]){
      const p=row('recycled-'+index);await ui.click(p+' .heading-toggle');
      await ui.click(await heading('回收一级标题 '+index,'heading-children-toggle',p));
      if(level===3)await ui.click(await heading('回收二级标题 '+index,'heading-children-toggle',p));
      const before=await ui.eval(()=>window.recyclingStats.inputs);
      await ui.click(await heading(`回收${level===2?'二':'三'}级标题 ${index}`,'heading-jump',p));
      await wait(async()=>await ui.eval(({index,level})=>{
        const h=document.querySelector('[data-turn-key="recycled-'+index+'"] h'+level),s=document.querySelector('.thread-scroll-container');return h&&Math.abs(h.getBoundingClientRect().top-s.getBoundingClientRect().top-s.clientTop-24)<=3;
      },{index,level}),'recycled H'+level+' '+index);
      await pause(1100);assert.equal(await ui.eval(()=>window.recyclingStats.inputs),before+1);
      assert.equal(await shadow(r=>r.querySelectorAll('.row').length),64);
      assert.ok(await ui.eval(()=>document.querySelectorAll('[data-turn-key]').length<=4));
    }
  });
}
