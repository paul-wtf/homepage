import { THEME_EVENT } from '../theme';

export type ParticleKind = 'rain' | 'snow';

interface Particle {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  alpha: number;
}

// Particles on a 1280 × 800 viewport for light, normal and heavy precipitation.
const DENSITY = [0, 24, 44, 70];
const REFERENCE_AREA = 1280 * 800;
const MAX_AREA_FACTOR = 2.5;
const MAX_DPR = 2;
const MAX_STEP = 0.05;
const RAIN_SLANT = -0.18;

const between = (min: number, max: number) => min + Math.random() * (max - min);

export function createParticles(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let kind: ParticleKind | null = null;
  let intensity = 0;
  let items: Particle[] = [];
  let color = '';
  let width = 0;
  let height = 0;
  let raf = 0;
  let last = 0;

  function make(): Particle {
    const rain = kind === 'rain';
    const speed = rain ? between(420, 640) : between(18, 45);
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      size: rain ? between(9, 16) : between(1, 2.2),
      speed,
      drift: rain ? speed * RAIN_SLANT : between(-8, 8),
      alpha: rain ? between(0.18, 0.3) : between(0.35, 0.6),
    };
  }

  function fit(): void {
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(DENSITY[intensity] * Math.min(MAX_AREA_FACTOR, (width * height) / REFERENCE_AREA));
    items = Array.from({ length: count }, make);
    color = getComputedStyle(canvas).color;
  }

  function draw(): void {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (const p of items) {
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      if (kind === 'rain') {
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.size * RAIN_SLANT, p.y + p.size);
        ctx.stroke();
      } else {
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function step(now: number): void {
    const dt = Math.min(MAX_STEP, (now - last) / 1000);
    last = now;
    for (const p of items) {
      p.y += p.speed * dt;
      p.x += p.drift * dt;
      if (p.y > height + p.size) p.y = -p.size;
      if (p.x < -p.size) p.x = width + p.size;
      else if (p.x > width + p.size) p.x = -p.size;
    }
    draw();
    raf = requestAnimationFrame(step);
  }

  function stop(): void {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function start(): void {
    if (raf || !kind || reduced.matches || document.visibilityState !== 'visible') return;
    last = performance.now();
    raf = requestAnimationFrame(step);
  }

  function refresh(): void {
    stop();
    canvas.hidden = !kind;
    if (!kind) {
      items = [];
      return;
    }
    fit();
    draw();
    start();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') start();
    else stop();
  });
  reduced.addEventListener('change', refresh);
  window.addEventListener('resize', () => {
    if (!kind) return;
    fit();
    draw();
  });
  window.addEventListener(THEME_EVENT, () => {
    if (!kind) return;
    color = getComputedStyle(canvas).color;
    draw();
  });

  return {
    set(next: ParticleKind | null, level: number): void {
      if (next === kind && level === intensity) return;
      kind = next;
      intensity = level;
      refresh();
    },
  };
}
