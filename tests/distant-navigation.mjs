import assert from 'node:assert/strict';

export async function distantNavigationTests(ui, { check, shadow, wait, pause, entry }) {
  entry.distantNavigation = [];
  for (const layout of ['normal', 'reverse', 'reuse']) {
    if (process.env.TEST_DISTANT_LAYOUT && process.env.TEST_DISTANT_LAYOUT !== layout) continue;
    await check(`整轮回收远跳：${layout} 相邻、跨区、H1 与当前节点身份`, async () => {
      await ui.goto(`/c/fixture-recycled-${layout}`);
      await wait(async () => await shadow(r=>r?.querySelectorAll('.row').length) === 64, 'initial full catalogue');
      await ui.eval(mode=>window.enableRecycling(mode),layout);
      await pause(300);
      const geometry = (index, heading=false) => ui.eval(({index,heading})=>{
        const n=document.querySelector('[data-turn-key="recycled-'+index+'"] '+(heading?'h1:last-child':'[data-user-message-bubble]'));
        const p=document.querySelector('.thread-scroll-container');
        return {visibility:document.visibilityState,offset:n?n.getBoundingClientRect().top-p.getBoundingClientRect().top-p.clientTop:null,scrollTop:p.scrollTop,mounted:[...document.querySelectorAll('[data-turn-key]')].map(n=>n.getAttribute('data-turn-key')),status:document.querySelector('#conversation-navigator-root').shadowRoot.querySelector('.status').textContent};
      },{index,heading});
      const adjacent = layout === 'reverse' ? [64,63,62,61] : [1,2,3,4];
      for(const index of adjacent){
        await ui.click(`.row[data-key="id:recycled-${index}"] .jump`);
        const until=Date.now()+1000;
        let sample;
        do { sample=await geometry(index); if(sample.offset!==null&&Math.abs(sample.offset-24)<=3)break; await pause(30); } while(Date.now()<until);
        assert.ok(sample.offset!==null&&Math.abs(sample.offset-24)<=3,`adjacent ${index} ${JSON.stringify(sample)}`);
      }
      if(layout==='reuse'){await ui.eval(()=>window.replaceScrollPort());await pause(250);}
      const distant=layout==='reverse'?[6,58,14,64]:layout==='reuse'?[56,9,43]:[59,7,49,1];
      for(const [index,heading] of [...distant.map(i=>[i,false]),[layout==='reverse'?17:47,true]]){
        const before=await ui.eval(()=>window.recyclingStats.inputs);
        if(heading)await ui.click(`.row[data-key="id:recycled-${index}"] .heading-toggle`);
        const began=Date.now();
        await ui.click(`.row[data-key="id:recycled-${index}"] ${heading?'.heading-list > .heading-item:nth-child(2) > .heading-line > .heading-jump':'.jump'}`);
        const deadline=Date.now()+Number(process.env.TEST_DISTANT_TIMEOUT||5000);
        let sample; const trace=[];
        do{sample=await geometry(index,heading);trace.push({...sample,at:Date.now()-began});if(sample.offset!==null&&Math.abs(sample.offset-24)<=3&&sample.status.startsWith('已定位'))break;await pause(80);}while(Date.now()<deadline);
        const reached=sample.offset!==null&&Math.abs(sample.offset-24)<=3&&sample.status.startsWith('已定位');
        entry.distantNavigation.push({layout,target:index,heading,reached,...(!reached?{trace}:{}),elapsedMs:Date.now()-began,...sample});
        assert.ok(reached,`distant ${index} ${JSON.stringify(sample)}`);
        assert.equal(await ui.eval(()=>window.recyclingStats.inputs),before+1,'one click per requested target');
        assert.equal(await shadow(r=>r.querySelectorAll('.row').length),64,'catalogue retained');
        assert.ok(sample.mounted.length<=4,'target roots really are recycled');
      }
    });
  }
}
