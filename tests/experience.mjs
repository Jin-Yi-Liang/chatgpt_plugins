import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

// Shared by the installed Chrome/Firefox extensions and real Tampermonkey runs.
// DOM mutations below model ChatGPT streaming and SPA content updates; activation,
// typing, clipboard/download interactions and ordinary shortcuts use browser input.
export async function experienceTests(ui, { check, shadow, wait, pause, artifactDir, entry }) {
  const row = key => `.row[data-key="id:${key}"]`;
  const rows = () => shadow(root => root?.querySelectorAll('.row').length || 0);
  const focused = selector => shadow((root, selector) => root.activeElement === root.querySelector(selector), selector);
  async function open(route, count) {
    await ui.goto(route);
    await wait(async () => await rows() === count, `${route}: ${count} questions`);
    if (await shadow(root => root.querySelector('.panel').hidden)) await ui.click('#expand');
  }
  async function addHeading() {
    await ui.eval(() => {
      const heading = document.createElement('h1');
      heading.id = 'experience-heading'; heading.textContent = '持续生成的一级标题';
      document.querySelector('[data-message-id="answer-1"] > .markdown').prepend(heading);
    });
    await wait(async () => !await shadow(root => root.querySelector('.row .heading-toggle').disabled), 'H1 navigation available');
  }

  await check('交互优化：动态回复保留标题草稿、DOM、光标与组合输入边界', async () => {
    await open('/c/fixture-primary-experience-draft', 3);
    await addHeading();
    await ui.press(`${row('user-1')} .heading-toggle`, 'Enter');
    await ui.click(`${row('user-1')} .edit`);
    const draft = '草稿中的自定义标题与中文输入';
    await ui.fill('.editor textarea', draft);
    await shadow(root => {
      const input = root.querySelector('.editor textarea');
      input.setSelectionRange(3, 11, 'backward');
      window.__experienceEditor = input;
    });
    const editorState = () => shadow(root => {
      const input = root.querySelector('.editor textarea');
      return { sameNode: input === window.__experienceEditor, value: input?.value,
        start: input?.selectionStart, end: input?.selectionEnd, direction: input?.selectionDirection,
        focused: root.activeElement === input };
    });
    const expected = { sameNode: true, value: draft, start: 3, end: 11, direction: 'backward', focused: true };
    assert.deepEqual(await editorState(), expected);
    await ui.eval(() => { document.querySelector('#experience-heading').textContent = '持续生成的一级标题已经补全'; });
    await wait(async () => await shadow(root => root.querySelector('.heading-jump')?.textContent) === '持续生成的一级标题已经补全', 'streamed H1 text refreshed');
    assert.deepEqual(await editorState(), expected, 'H1 updates retain live editor and selection');
    await ui.eval(() => {
      const turn = document.createElement('article'); turn.dataset.testid = 'conversation-turn-experience-4';
      turn.innerHTML = '<div data-message-author-role="user" data-message-id="experience-user-4"><div class="whitespace-pre-wrap">动态追加的新问题</div></div>';
      document.querySelector('main').append(turn);
    });
    await wait(async () => await rows() === 4, 'appended question listed during editing');
    assert.deepEqual(await editorState(), expected, 'new questions do not discard the draft');

    // Synthetic KeyboardEvents test the event-handler boundary, not a native IME.
    for (const key of ['Escape', 'Enter']) {
      await shadow((root, key) => root.querySelector('.editor textarea').dispatchEvent(new KeyboardEvent('keydown', {
        key, ctrlKey: key === 'Enter', isComposing: true, bubbles: true, cancelable: true
      })), key);
      assert.deepEqual(await editorState(), expected, `composing ${key} leaves the editor open`);
    }
    await ui.press('[data-edit="save"]', 'Enter');
    await wait(async () => await shadow(root => root.querySelector('.row .title').textContent) === draft, 'draft saved');
    await ui.reload();
    await wait(async () => await shadow(root => root?.querySelector('.row .title')?.textContent) === draft, 'saved draft persists');
    entry.experienceSamples = [{ scenario: 'streaming-draft', sameTextarea: true, selection: [3, 11, 'backward'], compositionCoverage: 'Synthetic isComposing KeyboardEvent boundary; no native input-method claim' }];
  });

  await check('交互优化：键盘展开、编辑、删除与面板收放保持合理焦点', async () => {
    await open('/c/fixture-primary-experience-focus', 3);
    await addHeading();
    const toggle = `${row('user-1')} .heading-toggle`;
    await ui.press(toggle, 'Enter');
    assert.equal(await focused(toggle), true, 'expansion retains the activating button');
    assert.equal(await shadow((root, selector) => root.querySelector(selector).getAttribute('aria-expanded'), toggle), 'true');
    assert.ok((await shadow((root, selector) => root.querySelector(selector).getAttribute('aria-label'), toggle)).includes('收起'));
    await ui.press(toggle, 'Space');
    assert.equal(await focused(toggle), true, 'collapse retains the same keyboard control');
    assert.equal(await shadow((root, selector) => root.querySelector(selector).getAttribute('aria-expanded'), toggle), 'false');
    await ui.press(`${row('user-1')} .edit`, 'Enter');
    await ui.fill('.editor textarea', '键盘保存后的标题');
    await ui.press('[data-edit="save"]', 'Enter');
    assert.equal(await focused(`${row('user-1')} .edit`), true, 'save returns to edit');
    await ui.press(`${row('user-1')} .edit`, 'Enter');
    await ui.press('.editor textarea', 'Escape');
    assert.equal(await focused(`${row('user-1')} .edit`), true, 'cancel returns to edit');
    await ui.press('#collapse', 'Enter');
    assert.equal(await focused('#expand'), true, 'launcher receives focus when the panel is hidden');
    await ui.press('#expand', 'Enter');
    assert.equal(await focused('#collapse'), true, 'opening restores the control focused before collapse');
    await ui.press(`${row('user-2')} .delete`, 'Enter');
    assert.equal(await focused(`${row('user-3')} .delete`), true, 'delete moves to the next item');
    await ui.press(`${row('user-3')} .delete`, 'Enter');
    assert.equal(await focused(`${row('user-1')} .delete`), true, 'deleting the last item moves to the preceding item');
    await ui.press(`${row('user-1')} .delete`, 'Enter');
    assert.equal(await focused('#search'), true, 'empty navigation returns focus to search');
  });

  await check('交互优化：搜索范围、跨筛选选区、清空搜索与全部删除反馈', async () => {
    await open('/c/fixture-primary-experience-selection', 3);
    await ui.click(`${row('user-1')} input[type="checkbox"]`);
    await ui.click(`${row('user-2')} input[type="checkbox"]`);
    await ui.fill('#search', '解释 RAG');
    await wait(async () => await rows() === 1, 'one search match');
    assert.equal(await shadow(root => root.querySelector('#results-count').textContent), '匹配 1 / 共 3 条');
    assert.equal(await shadow(root => root.querySelector('#selection-hint').textContent), '筛选外还有 1 条已选回复，将一并导出。');
    await ui.click('#select-visible');
    assert.equal(await shadow(root => root.querySelector('#selected-count').textContent), '已选 2', 'selecting a result does not duplicate selection');
    await ui.fill('#search', '完全不存在的筛选结果');
    await wait(async () => await rows() === 0, 'no search matches');
    assert.equal(await shadow(root => root.querySelector('#select-visible').disabled), true);
    assert.equal(await shadow(root => root.querySelector('#selection-hint').textContent), '筛选外还有 2 条已选回复，将一并导出。');
    await ui.click('#clear-search');
    await wait(async () => await rows() === 3, 'clear search restores all questions');
    assert.equal(await shadow(root => root.querySelector('#search').value), '');
    assert.equal(await shadow(root => root.querySelectorAll('.row input:checked').length), 2);
    const text = await ui.download();
    assert.ok(text.includes('第一份回复') && text.includes('第二份回复：UNSELECTED'));
    assert.ok(text.indexOf('第一份回复') < text.indexOf('第二份回复：UNSELECTED'));
    assert.ok(!text.includes('第三份回复'), 'cross-filter export includes exactly the selected answers');
    await writeFile(path.join(artifactDir, `${entry.browser}-experience-selection.md`), text);
    for (const key of ['user-1', 'user-2', 'user-3']) await ui.click(`${row(key)} .delete`);
    assert.equal(await shadow(root => root.querySelector('.empty').textContent), '本会话的导航项已全部删除。原始对话仍保留。');
    assert.equal(await shadow(root => root.querySelector('#select-all').disabled), true);
    assert.equal(await shadow(root => root.querySelector('#select-visible').disabled), true);
    await ui.reload();
    await wait(async () => await shadow(root => root?.querySelector('.empty')?.textContent) === '本会话的导航项已全部删除。原始对话仍保留。', 'deletions remain after reload');
  });

  await check('交互优化：100/200 条目录更新保留节点、滚动和勾选，定位当前只滚动目录', async () => {
    await open('/c/fixture-experience-100', 100);
    await ui.click(`${row('scroll-20')} input[type="checkbox"]`);
    await ui.click(`${row('scroll-80')} input[type="checkbox"]`);
    await shadow(root => {
      root.querySelector('.list').scrollTop = 550;
      window.__experienceRows = [...root.querySelectorAll('.row')];
      window.__experienceScroll = root.querySelector('.list').scrollTop;
      window.__experienceStart = performance.now();
    });
    await ui.eval(() => {
      const heading = document.createElement('h1'); heading.textContent = '长会话中的新增标题';
      document.querySelector('[data-turn-key="scroll-50"] [data-markdown-text-style]').prepend(heading);
    });
    await wait(async () => !await shadow(root => root.querySelector('.row[data-key="id:scroll-50"] .heading-toggle').disabled), '100-question update observed');
    const sample = () => shadow(root => ({
      rows: root.querySelectorAll('.row').length,
      retainedRows: window.__experienceRows.filter(node => node === root.querySelector(`.row[data-key="${node.dataset.key}"]`)).length,
      beforeScroll: window.__experienceScroll, afterScroll: root.querySelector('.list').scrollTop,
      selected: [...root.querySelectorAll('.row input:checked')].map(input => input.closest('.row').dataset.key),
      elapsedMs: Math.round(performance.now() - window.__experienceStart)
    }));
    const hundred = await sample();
    assert.equal(hundred.retainedRows, 100);
    assert.ok(Math.abs(hundred.afterScroll - hundred.beforeScroll) <= 1, '100-question update preserves list scroll');
    assert.deepEqual(hundred.selected, ['id:scroll-20', 'id:scroll-80']);
    await ui.eval(() => {
      window.__experienceStart = performance.now();
      const fragment = document.createDocumentFragment();
      for (let index = 101; index <= 200; index++) {
        const turn = document.createElement('div'); turn.dataset.turnKey = `scroll-${index}`;
        turn.innerHTML = `<div data-user-message-bubble><div class="whitespace-pre-wrap">第 ${index} 个跳转测试提问：长会话中只点击一次</div></div><div data-chatgpt-selection-message-id="scroll-answer-${index}"><div data-markdown-text-style><p>第 ${index} 份回复</p><div class="reply-space" style="height:1100px"></div></div></div>`;
        fragment.append(turn);
      }
      document.querySelector('.transcript').append(fragment);
    });
    await wait(async () => await rows() === 200, '200-question inventory visible');
    const twoHundred = await sample();
    assert.equal(twoHundred.retainedRows, 100, 'existing nodes survive growth to 200 questions');
    assert.ok(Math.abs(twoHundred.afterScroll - twoHundred.beforeScroll) <= 1, 'growth preserves list scroll');
    assert.deepEqual(twoHundred.selected, ['id:scroll-20', 'id:scroll-80']);
    entry.experienceSamples.push({ scenario: 'long-inventory-update', samples: [hundred, twoHundred], timing: 'Observed browser timings only; no fixed performance threshold' });
    await ui.eval(() => {
      const scroller = document.querySelector('.thread-scroll-container');
      const target = document.querySelector('[data-turn-key="scroll-75"] [data-user-message-bubble]');
      scroller.style.scrollBehavior = 'auto';
      scroller.scrollTop += target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 80;
    });
    await wait(async () => await shadow(root => root.querySelector('.row.active')?.dataset.key) === 'id:scroll-75', 'page scroll identifies the current question');
    await ui.fill('#search', '第 2 个跳转测试提问');
    await wait(async () => await rows() === 1, 'current question hidden by search');
    const pagePosition = () => ui.eval(() => ({ thread: document.querySelector('.thread-scroll-container').scrollTop, document: scrollY }));
    const before = await pagePosition();
    await ui.click('#locate-current');
    await wait(async () => await rows() === 200, 'locating current clears search');
    assert.equal(await shadow(root => root.querySelector('#search').value), '');
    await wait(async () => await shadow(root => {
      const list = root.querySelector('.list').getBoundingClientRect();
      const active = root.querySelector('.row.active')?.getBoundingClientRect();
      return active && active.top >= list.top - 1 && active.bottom <= list.bottom + 1;
    }), 'current row is visible inside navigation');
    await pause(150);
    assert.deepEqual(await pagePosition(), before, 'locating a directory row never scrolls the conversation');
    assert.equal(await shadow(root => root.querySelector('.row.active')?.dataset.key), 'id:scroll-75');
    await ui.screenshot(path.join(artifactDir, `${entry.browser}-experience-current.png`));
    await writeFile(path.join(artifactDir, `${entry.browser}-experience-samples.json`), JSON.stringify(entry.experienceSamples, null, 2));
  });
}
