// A continuous ten-tap gesture; no background timer or visible menu entry.
export function bindDeveloperEntry(view, title) {
  title.setAttribute('role', 'button');
  title.setAttribute('aria-label', '山河册');
  title.tabIndex = 0;
  title.style.pointerEvents = 'auto';
  title.style.touchAction = 'manipulation';
  title.style.userSelect = 'none';
  const tap = () => {
    const now = performance.now();
    const previous = view.developerGesture;
    const count = previous && now - previous.time <= 2000 ? previous.count + 1 : 1;
    view.developerGesture = { time: now, count };
    if (count < 10) return;
    delete view.developerGesture;
    try {
      view.dispatch('enableDeveloperMode', {});
      view.pendingToast = '开发者模式已开启：山河册全部解锁';
      view.render();
    } catch (error) {
      view.toast(error.message || String(error));
    }
  };
  title.addEventListener('click', tap);
  title.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
      event.preventDefault(); event.stopPropagation(); tap();
    }
  });
}
