const formulaSelector = '.katex, .katex-display, mjx-container, .MathJax, math, [data-latex], [data-tex]';

function formulaAt(target) {
  const nearest = target.closest(formulaSelector);
  if (!nearest) return null;
  // Prefer the whole renderer rather than one visual glyph or assistive MathML.
  return nearest.closest('.katex') || nearest;
}

function sourceOf(formula) {
  const annotation = formula.querySelector('annotation[encoding="application/x-tex"], annotation[encoding="application/x-latex"]');
  let tex = annotation?.textContent || formula.getAttribute('data-latex') || formula.getAttribute('data-tex') || formula.getAttribute('alttext') || formula.querySelector('math[alttext]')?.getAttribute('alttext');
  // MathJax 2 keeps its source next to the rendered output.
  const script = formula.nextElementSibling;
  if (!tex && script?.matches('script[type^="math/tex"]')) tex = script.textContent;
  return tex?.trim() || '';
}

export function installFormulaCopy({ copy, notice, isReply, getFormat }) {
  document.addEventListener('dblclick', event => {
    if (!event.isTrusted || event.button !== 0 || event.defaultPrevented || !(event.target instanceof Element)) return;
    const formula = formulaAt(event.target);
    if (!formula || formula.closest('pre, code, button, input, textarea, nav, [contenteditable="true"], [hidden], [aria-hidden="true"]')) return;
    if (!isReply(formula) || ![...formula.getClientRects()].some(rect => rect.width > 0 && rect.height > 0)) return;
    const tex = sourceOf(formula);
    if (!tex) { notice('无法读取该公式的 LaTeX 源码，未更改剪贴板。'); return; }
    const display = !!formula.closest('.katex-display') || ['block', 'true'].includes(formula.getAttribute('display'))
      || formula.matches('.MathJax_Display') || formula.closest('.MathJax_Display')
      || formula.nextElementSibling?.getAttribute('type')?.includes('mode=display');
    const markdown = getFormat() === 'markdown';
    const text = markdown ? display ? `$$\n${tex}\n$$` : `$${tex}$` : tex;
    event.preventDefault(); event.stopPropagation();
    // Call within the actual double-click gesture so native clipboard activation
    // is retained. Never copy the duplicated visual/assistive rendered text.
    try {
      Promise.resolve(copy(text)).then(() => notice(markdown ? '已复制 Markdown 公式，可按 Ctrl+V 粘贴。' : '已复制 LaTeX 公式，可按 Ctrl+V 粘贴。'),
        () => notice('公式复制失败，请检查剪贴板权限后重试。'));
    } catch { notice('公式复制失败，请检查剪贴板权限后重试。'); }
  }, true);
}
