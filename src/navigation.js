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
  if (!hasLayout(anchor)) return null;
  const container = scrollContainer(anchor);
  const area = viewport(container);
  return { container, top: container.scrollTop + anchor.getBoundingClientRect().top - area.top };
}

export function hasLayout(anchor) {
  if (!anchor?.isConnected) return false;
  return [...anchor.getClientRects()].some(rect => rect.width > 0 && rect.height > 0);
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
      const run = { finish, frame: 0, started: performance.now(), lastSeek: -Infinity, stableSince: null, checked: -Infinity, anchor: null, container: null, padding: 16, reverse: false };
      current = run;
      function complete(success, reason) {
        if (current !== run) return;
        current = null;
        finish({ success, cancelled: false, reason });
      }
      function step() {
        if (current !== run) return;
        const now = performance.now();
        if (now - run.checked < 50) { run.frame = requestAnimationFrame(step); return; }
        run.checked = now;
        const target = resolve();
        if (target?.cancelled) { cancel(); return; }
        if (hasLayout(target?.anchor)) {
          const anchor = target.anchor;
          if (run.anchor !== anchor || !run.container?.isConnected || !run.container.contains(anchor)) {
            run.anchor = anchor; run.container = scrollContainer(anchor);
            run.stableSince = null;
            run.reverse = getComputedStyle(run.container).flexDirection === 'column-reverse';
            run.padding = offset ?? Math.max(16, parseFloat(getComputedStyle(run.container).scrollPaddingTop) || 0, parseFloat(getComputedStyle(anchor).scrollMarginTop) || 0);
          }
          const container = run.container;
          const area = viewport(container);
          const padding = run.padding;
          const rect = anchor.getBoundingClientRect();
          const delta = rect.top - area.top - padding;
          const before = container.scrollTop;
          const requested = before + delta;
          if (Math.abs(delta) > 2) {
            run.stableSince = null;
            container.scrollTo({ top: requested, behavior: 'instant' });
          }
          const next = anchor.getBoundingClientRect();
          const aligned = Math.abs(next.top - area.top - padding) <= 2;
          const range = Math.max(0, container.scrollHeight - container.clientHeight);
          const min = run.reverse ? -range : 0, max = run.reverse ? 0 : range;
          const clamped = Math.max(min, Math.min(max, requested));
          const atBoundary = (requested < min || requested > max) && Math.abs(container.scrollTop - clamped) <= 2
            && next.bottom > area.top && next.top < area.top + area.height;
          if (aligned || atBoundary) run.stableSince ??= now;
          else run.stableSince = null;
        } else if (target) {
          run.stableSince = null;
          if (target.hint?.container?.isConnected && now - run.lastSeek > 100) {
            const { container, top, direction = 0, source } = target.hint;
            // A live shell position may move during mounting: always follow its
            // latest geometry. Only historical hints need a window-by-window search.
            const destination = source === 'shell' || run.lastSeek === -Infinity ? top
              : container.scrollTop + direction * viewport(container).height * 0.8;
            if (Math.abs(destination - container.scrollTop) > 1) container.scrollTo({ top: destination, behavior: 'instant' });
            run.lastSeek = now;
          }
        } else { complete(false, 'unavailable'); return; }
        if (now - run.started >= 1000 && run.stableSince !== null && now - run.stableSince >= 350) { complete(true, 'aligned'); return; }
        // Mounting can exceed 2.4s in Firefox. Keep one cancellable operation alive
        // through that delay; a deadline is a failure, never evidence of arrival.
        if (now - run.started >= 12000) { complete(false, 'timeout'); return; }
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
