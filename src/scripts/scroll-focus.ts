const PROBE_Y = 0.4;
const TOP_ZONE = 40;

export function initScrollFocus(): () => void {
  let raf = 0;
  let current: Element | null = null;

  const update = () => {
    raf = 0;
    const portrait = document.querySelector('.hero .window');
    let next: Element | null = null;
    if (window.scrollY < TOP_ZONE && portrait) {
      next = portrait;
    } else {
      const px = window.innerWidth / 2;
      const py = window.innerHeight * PROBE_Y;
      let best = Infinity;
      for (const w of document.querySelectorAll('.window')) {
        const r = w.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const dx = Math.max(r.left - px, 0, px - r.right);
        const dy = Math.max(r.top - py, 0, py - r.bottom);
        const d = Math.hypot(dx, dy);
        if (d < best) {
          best = d;
          next = w;
        }
      }
    }
    if (next === current) return;
    current?.classList.remove('is-focus');
    next?.classList.add('is-focus');
    current = next;
  };

  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  update();

  return () => {
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    current?.classList.remove('is-focus');
    current = null;
  };
}
