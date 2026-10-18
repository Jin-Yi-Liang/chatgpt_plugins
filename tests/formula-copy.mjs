import assert from 'node:assert/strict';
import path from 'node:path';

const esc = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export const inlineTex = String.raw`E=mc^2`;
export const displayTex = String.raw`\frac{a_b}{c} + \sqrt{x^2+1}`;
export const matrixTex = String.raw`\begin{aligned}
a &< b \\
c &= \begin{pmatrix}1 & 2 \\ 3 & 4\end{pmatrix}
\end{aligned}`;
function katex(id,tex,display=false){return `<${display?'div':'span'} class="${display?'katex-display':'math-inline'}"><span class="katex" id="${id}"><span class="katex-mathml"><math><semantics><mi>x</mi><annotation encoding="application/x-tex">${esc(tex)}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span id="${id}-target">${display?'分式 √x＋1':'x＋y = 公式'}</span></span></span></${display?'div':'span'}>`;}
export const formulaConversation = `<!doctype html><meta charset="utf-8"><title>公式双击与实际剪贴板粘贴</title><style>
body{margin:0;background:#f8fafb;font:18px/1.8 system-ui;color:#25303a}header{padding:18px;background:white}main{max-width:760px;margin:20px 30px}article{background:white;padding:20px;margin:20px 0}.katex-mathml{position:absolute;clip:rect(1px,1px,1px,1px);width:1px;height:1px;overflow:hidden}.katex-html{padding:8px;display:inline-block;font:22px/1.8 serif}.katex-display{margin:18px 0;padding:12px;background:#eef5f1}#paste-target{width:620px;height:120px}mjx-container,.MathJax{display:inline-block;font:22px serif;padding:10px}
</style><header>公式复制：双击实际渲染节点，再用 Ctrl+V 粘贴校验</header><main>
<article data-turn-id="formula-question"><div data-message-author-role="user" data-message-id="formula-user"><div class="whitespace-pre-wrap">公式测试提问 ${katex('user-math',String.raw`USER\_SOURCE`)}</div></div></article>
<article><div data-message-author-role="assistant" data-message-id="formula-answer"><div class="markdown">
<h1>模型回复中的公式</h1><p>行内公式 ${katex('inline',inlineTex)} 与相邻公式 ${katex('adjacent',String.raw`x_2+y_2`)}</p>
${katex('display',displayTex,true)}${katex('matrix',matrixTex,true)}
<p id="dynamic-formulas"></p><span class="katex" id="missing"><span class="katex-html" aria-hidden="true"><span id="missing-target">没有源码的公式</span></span></span>
<pre>${katex('code-math','CODE')}</pre><div data-testid="reasoning">${katex('thought-math','THOUGHT')}</div>
<math id="mathml" alttext="x+1"><mi>x</mi><mo>+</mo><mn>1</mn></math>
<mjx-container id="mathjax" display="true" data-latex="\\int_0^1 x^2 \\, dx"><span id="mathjax-target">∫ x² dx</span></mjx-container>
<span id="mathjax2" class="MathJax">MathJax 2 公式</span><script type="math/tex; mode=display">\\sum_{i=1}^{n} i</script>
</div></div></article>
<div data-chatgpt-conversation-selection-target><div data-turn-key="formula-modern"><div data-user-message-bubble>现代结构提问</div><div data-chatgpt-selection-message-id="formula-modern-answer"><div data-markdown-text-style><span id="modern-target" data-tex="\\alpha+\\beta">α＋β</span></div></div></div></div>
<textarea id="paste-target" aria-label="实际 Ctrl V 粘贴"></textarea></main>`;

export async function formulaCopyTests(ui,{check,shadow,wait,pause,artifactDir,entry}){
  const toast=()=>shadow(r=>r.querySelector('.formula-toast').textContent);
  const open=async suffix=>{await ui.goto('/c/fixture-formula-'+suffix);await wait(async()=>await shadow(r=>r?.querySelectorAll('.row').length)===2,'formula conversation');};
  async function copied(selector,expected){
    await shadow(r=>{r.querySelector('.formula-toast').textContent='';});
    await ui.doubleClick(selector);
    await wait(async()=>(await toast()).startsWith('已复制'),'double click clipboard callback');
    const pasted=await ui.paste();assert.equal(pasted,expected,'actual Ctrl+V exactly preserves source');
    entry.formulaCopy.push({selector,pasted,clipboard:'actual native Ctrl+V'});
  }
  entry.formulaCopy=[];
  await check('公式复制：原生双击行内、独立、矩阵和相邻公式，Ctrl+V 逐字一致',async()=>{
    await open('latex');
    for(const [selector,tex]of[['#inline-target',inlineTex],['#display-target',displayTex],['#matrix-target',matrixTex],['#adjacent-target',String.raw`x_2+y_2`]])await copied(selector,tex);
    await ui.screenshot(path.join(artifactDir,entry.browser+'-formula-copy.png'));
  });
  await check('公式复制：Markdown 格式、偏好持久化、收起面板和动态公式',async()=>{
    await open('markdown');
    if(await shadow(r=>r.querySelector('.panel').hidden))await ui.click('#expand');
    await ui.click('#settings-toggle');await ui.select('#formula-format','markdown');await pause(300);
    await copied('#inline-target',`$${inlineTex}$`);await copied('#display-target',`$$\n${displayTex}\n$$`);
    await ui.reload();await wait(async()=>await shadow(r=>r?.querySelector('#formula-format').value)==='markdown','format preference persisted');
    await ui.click('#collapse');
    await ui.eval(html=>document.querySelector('#dynamic-formulas').innerHTML=html,katex('late',String.raw`\gamma_{new}`));
    await copied('#late-target',String.raw`$\gamma_{new}$`);
    assert.equal(await shadow(r=>r.querySelector('.panel').hidden),true,'copy does not reopen panel');
    assert.equal(await shadow(r=>r.querySelector('.formula-toast').hidden),false,'feedback visible with closed panel');
    await open('spa');await copied('#matrix-target',`$$\n${matrixTex}\n$$`);
    await ui.click('#expand');await ui.click('#settings-toggle');await ui.select('#formula-format','latex');await pause(300);
  });
  await check('公式复制：MathML、MathJax、现代消息结构和非公式事件边界',async()=>{
    await open('guards');
    await copied('#mathml','x+1');await copied('#mathjax-target',String.raw`\int_0^1 x^2 \, dx`);
    await copied('#mathjax2',String.raw`\sum_{i=1}^{n} i`);await copied('#modern-target',String.raw`\alpha+\beta`);
    await copied('#thought-math-target','THOUGHT');
    await copied('#inline-target',inlineTex);
    await ui.pageClick('#adjacent-target');assert.equal(await ui.paste(),inlineTex,'single click does not copy');
    await ui.eval(()=>document.querySelector('#adjacent-target').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,button:0})));
    assert.equal(await ui.paste(),inlineTex,'synthetic page event cannot write privileged clipboard');
    for(const id of['user-math','code-math']){await ui.doubleClick('#'+id+'-target');assert.equal(await ui.paste(),inlineTex,'outside generated answer math does not replace clipboard');}
    await ui.doubleClick('#missing-target');await wait(async()=>(await toast()).startsWith('无法读取'),'missing source feedback');
    assert.equal(await ui.paste(),inlineTex,'missing LaTeX preserves existing clipboard');
  });
}
