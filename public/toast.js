(function () {
  const DURATIONS = { success: 3500, neutral: 3500, error: 6000 };

  function getStack() {
    let stack = document.getElementById('toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'toast-stack';
      stack.className = 'toast-stack';
      stack.setAttribute('aria-live', 'polite');
      stack.setAttribute('aria-atomic', 'true');
      document.body.appendChild(stack);
    }
    return stack;
  }

  function dismiss(toast) {
    if (!toast || toast.dataset.leaving === '1') return;
    toast.dataset.leaving = '1';
    toast.classList.add('is-leaving');
    toast.addEventListener(
      'transitionend',
      () => {
        toast.remove();
      },
      { once: true },
    );
    setTimeout(() => toast.remove(), 400);
  }

  function show(message, tone = 'neutral') {
    if (!message) return null;
    const stack = getStack();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.tone = tone;
    toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    toast.textContent = message;
    toast.addEventListener('click', () => dismiss(toast));
    stack.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });

    const duration = DURATIONS[tone] ?? DURATIONS.neutral;
    setTimeout(() => dismiss(toast), duration);
    return toast;
  }

  function clear() {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    stack.querySelectorAll('.toast').forEach(dismiss);
  }

  window.toast = { show, clear };
})();
