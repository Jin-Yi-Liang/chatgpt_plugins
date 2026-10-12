export function scrollContainer(anchor) {
  for (let node = anchor.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return document.scrollingElement;
}

export function viewport(container) {
  if (container === document.scrollingElement) return { top: 0, height: innerHeight };
  return { top: container.getBoundingClientRect().top + container.clientTop, height: container.clientHeight };
}

export function positionHint(anchor) {
  if (!anchor?.isConnected || !anchor.getClientRects().length) return null;
  const container = scrollContainer(anchor);
  const area = viewport(container);
  return { container, top: container.scrollTop + anchor.getBoundingClientRect().top - area.top };
}

export function createNavigation() {
  let current = null;
  function cancel() {
    if (!current) return;
    cancelAnimationFrame(current.frame);
    current.finish({ success: false, cancelled: true });
    current = null;
  }
  function navigate(resolve, offset = null) {
    cancel();
    return new Promise(finish => {
      const run = { finish, frame: 0, started: performance.now(), lastSeek: -Infinity, stableSince: null };
      current = run;
      let initial = true;
      function step() {
        if (current !== run) return;
        const now = performance.now();
        const target = resolve();
        if (target?.anchor?.isConnected && target.anchor.getClientRects().length) {
          const anchor = target.anchor;
          if (initial) { anchor.scrollIntoView({ behavior: 'instant', block: 'start', inline: 'nearest' }); initial = false; }
          const container = scrollContainer(anchor);
          const area = viewport(container);
          const padding = offset ?? Math.max(16, parseFloat(getComputedStyle(container).scrollPaddingTop) || 0, parseFloat(getComputedStyle(anchor).scrollMarginTop) || 0);
          const rect = anchor.getBoundingClientRect();
          const delta = rect.top - area.top - padding;
          const before = container.scrollTop;
          if (Math.abs(delta) > 2) container.scrollTo({ top: before + delta, behavior: 'instant' });
          const next = anchor.getBoundingClientRect();
          const aligned = Math.abs(next.top - area.top - padding) <= 2;
          const atBoundary = Math.abs(container.scrollTop - before) < 0.5 && next.top >= area.top && next.top < area.top + area.height - 20;
          if (aligned || atBoundary) run.stableSince ??= now;
          else run.stableSince = null;
        } else if (target?.hint?.container?.isConnected && now - run.lastSeek > 70) {
          const { container, top, direction = 0 } = target.hint;
          // First seek uses the recorded position. Later seeks follow the mounted window.
          container.scrollTo({ top: run.lastSeek === -Infinity ? top : container.scrollTop + direction * viewport(container).height * 0.8, behavior: 'instant' });
          run.lastSeek = now;
          run.stableSince = null;
        } else if (!target) { cancel(); return; }
        if ((now - run.started >= 1000 && run.stableSince !== null && now - run.stableSince >= 180) || now - run.started >= 2400) {
          current = null;
          finish({ success: run.stableSince !== null, cancelled: false });
          return;
        }
        run.frame = requestAnimationFrame(step);
      }
      step();
    });
  }
  // A new click, wheel, touch or scroll key always gives control back to the user.
  for (const type of ['wheel', 'touchstart', 'pointerdown']) document.addEventListener(type, event => { if (event.isTrusted) cancel(); }, { passive: true, capture: true });
  document.addEventListener('keydown', event => { if (['PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp', 'Escape', ' '].includes(event.key)) cancel(); }, true);
  return { navigate, cancel, get active() { return current !== null; } };
}
