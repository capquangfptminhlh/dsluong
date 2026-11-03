const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function motionKind(button) {
  const className = String(button.className || '').toLowerCase();
  const text = String(button.textContent || '').trim().toLowerCase();
  const type = String(button.getAttribute('type') || '').toLowerCase();

  if (/rose|red|danger|destructive|delete|remove/.test(className) || /xóa|huỷ|hủy|xoá/.test(text)) return 'danger';
  if (className.includes('icon-btn') || (button.getAttribute('aria-label') && text.length === 0)) return 'icon';
  if (/primary|blue-6|blue-7|emerald-6|autotax-pos-pay/.test(className) || type === 'submit' || /thanh toán|xác nhận|lưu|tạo đơn|đăng nhập/.test(text)) return 'primary';
  return 'secondary';
}

function prepare(button) {
  if (!(button instanceof HTMLButtonElement)) return false;
  if (button.dataset.autotaxMotion === 'ready') return true;
  if (button.dataset.autotaxMotion === 'skipped') return false;

  // Motion must never change layout semantics. The old global motion class forced
  // position:relative + transform on every button, which broke fixed launchers,
  // full-screen backdrops, absolute modal close buttons and transformed controls.
  // Skip those layout-sensitive buttons entirely; ordinary static buttons keep the
  // ripple/lift treatment.
  const style = window.getComputedStyle(button);
  const layoutSensitive = ['fixed', 'absolute', 'sticky'].includes(style.position)
    || (style.transform && style.transform !== 'none');
  if (layoutSensitive) {
    button.dataset.autotaxMotion = 'skipped';
    return false;
  }

  button.dataset.autotaxMotion = 'ready';
  button.classList.add('autotax-motion-button', `autotax-motion-${motionKind(button)}`);
  return true;
}

function pulse(button, event) {
  if (button.disabled || window.matchMedia(REDUCED_MOTION_QUERY).matches) return;
  if (!prepare(button)) return;

  const rect = button.getBoundingClientRect();
  const x = Number.isFinite(event?.clientX) && event.clientX > 0 ? event.clientX - rect.left : rect.width / 2;
  const y = Number.isFinite(event?.clientY) && event.clientY > 0 ? event.clientY - rect.top : rect.height / 2;
  const size = Math.max(rect.width, rect.height) * 1.45;

  const ripple = document.createElement('span');
  ripple.className = 'autotax-button-ripple';
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${x - size / 2}px`;
  ripple.style.top = `${y - size / 2}px`;
  ripple.setAttribute('aria-hidden', 'true');
  button.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });

  button.classList.remove('autotax-button-fired');
  requestAnimationFrame(() => {
    button.classList.add('autotax-button-fired');
    window.setTimeout(() => button.classList.remove('autotax-button-fired'), 360);
  });
}

export function installAutoTaxButtonMotion() {
  if (typeof document === 'undefined' || document.documentElement.dataset.autotaxButtonMotion === 'installed') return;
  document.documentElement.dataset.autotaxButtonMotion = 'installed';

  document.querySelectorAll('button').forEach(prepare);

  const observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.matches?.('button')) prepare(node);
      node.querySelectorAll?.('button').forEach(prepare);
    }));
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('pointerdown', (event) => {
    const button = event.target.closest?.('button');
    if (button) pulse(button, event);
  }, { passive: true, capture: true });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const button = event.target.closest?.('button');
    if (button) pulse(button, null);
  }, true);
}
