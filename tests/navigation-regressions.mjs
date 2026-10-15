import assert from 'node:assert/strict';

export async function navigationRegressions(ui, { check, shadow, wait, pause, entry }) {
  const rows = () => shadow(root => root?.querySelectorAll('.row').length || 0);
  const position = selector => ui.eval(selector => {
    const node = document.querySelector(selector), container = document.querySelector('.thread-scroll-container');
    return node ? node.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientTop : null;
  }, selector);
  entry.startupNavigation = [];
  if (!process.env.TEST_ONLY_REFLOW) await check('长会话启动：完整内容的虚拟样式标记不触发全页扫描，首次单击立即定位', async () => {
    await ui.goto('/c/fixture-preloaded-tall');
    await wait(async () => await rows() === 10, 'preloaded tall conversation');
    assert.equal(await ui.eval(() => document.querySelector('#conversation-navigator-root').dataset.discovery), 'idle', 'CSS class names alone do not require a discovery sweep');
    assert.equal(await ui.eval(() => document.querySelector('.thread-scroll-container').style.opacity), '');
    const before = await ui.eval(() => document.querySelector('.thread-scroll-container').scrollTop);
    await pause(350);
    assert.ok(Math.abs(await ui.eval(() => document.querySelector('.thread-scroll-container').scrollTop) - before) < 2, 'startup leaves the transcript stationary');
    await ui.click('.row[data-key="id:loaded-2"] .jump');
    const immediate = await position('[data-turn-key="loaded-2"] [data-user-message-bubble]');
    assert.ok(Math.abs(immediate - 24) <= 3, `first click offset ${immediate}`);
    await wait(async () => await ui.eval(() => typeof window.navigationTiming?.duration === 'number'), 'first navigation animation frame');
    const timing = await ui.eval(() => window.navigationTiming);
    assert.ok(timing.duration < 250, `first click to next frame took ${timing.duration}ms`);
    assert.ok(Math.abs(timing.offset - 24) <= 3);
    await ui.click('.row[data-key="id:loaded-8"] .heading-toggle');
    await ui.click('.row[data-key="id:loaded-8"] .heading-jump');
    await wait(async () => Math.abs(await position('[data-turn-key="loaded-8"] h1') - 24) <= 3, 'preloaded heading jump');
    entry.startupNavigation.push({ scenario: 'preloaded-260000px', initialDiscovery: 'idle', firstClickOffset: immediate, firstFrame: timing });
  });
  await check('窗口化重排：历史位置过期后，单击提问和 H1 仍定位当前占位节点', async () => {
    await ui.goto('/c/fixture-virtual-reflow');
    await wait(async () => await ui.eval(() => document.querySelector('#conversation-navigator-root')?.dataset.discovery) === 'complete', 'initial virtual discovery');
    assert.equal(await rows(), 16);
    await ui.eval(() => {
      const style = document.createElement('style');
      style.textContent = '.virtual-turn:nth-child(-n+8){height:30000px!important}';
      document.head.append(style);
    });
    assert.equal(await ui.eval(() => !!document.querySelector('[data-turn-key="virtual-1"] [data-user-message-bubble]')), false);
    await ui.click('.row[data-key="id:virtual-1"] .jump');
    await wait(async () => {
      const offset = await position('[data-turn-key="virtual-1"] [data-user-message-bubble]');
      return offset !== null && Math.abs(offset - 16) <= 3;
    }, 'reflowed unmounted question aligns in one click');
    await pause(1100);
    const question = await position('[data-turn-key="virtual-1"] [data-user-message-bubble]');
    assert.ok(Math.abs(question - 16) <= 3);
    await ui.click('.row[data-key="id:virtual-16"] .jump');
    await wait(async () => {
      const offset = await position('[data-turn-key="virtual-16"] [data-user-message-bubble]');
      return offset !== null && Math.abs(offset - 16) <= 3;
    }, 'return to last virtual window');
    await pause(1100);
    await ui.click('.row[data-key="id:virtual-3"] .heading-toggle');
    await ui.click('.row[data-key="id:virtual-3"] .heading-jump:nth-child(2)');
    await wait(async () => {
      const offset = await position('[data-turn-key="virtual-3"] h1:last-child');
      return offset !== null && Math.abs(offset - 16) <= 3;
    }, 'reflowed unmounted H1 aligns in one click');
    const heading = await position('[data-turn-key="virtual-3"] h1:last-child');
    assert.equal(await rows(), 16);
    entry.startupNavigation.push({ scenario: 'virtual-reflow-240000px', questionOffset: question, headingOffset: heading });
  });
}
