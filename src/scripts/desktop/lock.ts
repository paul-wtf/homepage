import { latest, subscribe } from '../live/status';
import { ui } from '../../data/ui';
import { lang } from '../lang';

const IDLE_MS = 5 * 60_000;
const CLOCK_MS = 1000;
const INPUT = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'];

export interface Lock {
  arm(): void;
  disarm(): void;
  now(): void;
}

export function createLock(): Lock {
  const el = document.querySelector<HTMLElement>('[data-lock]');
  const time = el?.querySelector<HTMLElement>('[data-lock-time]');
  const date = el?.querySelector<HTMLElement>('[data-lock-date]');
  const track = el?.querySelector<HTMLElement>('[data-lock-track]');
  const trackText = el?.querySelector<HTMLElement>('[data-lock-track-text]');
  const html = document.documentElement;

  let armed = false;
  let locked = false;
  let idle = 0;
  let clock = 0;
  let before: Element | null = null;

  function render(): void {
    const now = new Date();
    if (time) time.textContent = now.toLocaleTimeString(ui[lang].locale, { hour: '2-digit', minute: '2-digit' });
    if (date) date.textContent = now.toLocaleDateString(ui[lang].locale, { weekday: 'long', day: 'numeric', month: 'long' });
    const music = latest()?.music;
    if (track) track.hidden = !music;
    if (trackText && music) trackText.textContent = `${music.track} · ${music.artist}`;
  }

  function wait(): void {
    clearTimeout(idle);
    if (armed && !locked) idle = window.setTimeout(lock, IDLE_MS);
  }

  function lock(): void {
    if (!el || !armed || locked) return;
    locked = true;
    before = document.activeElement;
    render();
    clock = window.setInterval(render, CLOCK_MS);
    el.hidden = false;
    html.classList.add('is-locked');
    el.focus({ preventScroll: true });
  }

  function unlock(refocus: boolean): void {
    if (!el || !locked) return;
    locked = false;
    clearInterval(clock);
    el.hidden = true;
    html.classList.remove('is-locked');
    if (refocus && before instanceof HTMLElement) before.focus({ preventScroll: true });
    before = null;
  }

  function onInput(e: Event): void {
    if (!armed) return;
    if (!locked) {
      wait();
      return;
    }
    if (e.type !== 'keydown' && e.type !== 'pointerdown') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    unlock(true);
    wait();
  }

  // On window, so the unlocking key is swallowed before any document listener sees it.
  for (const type of INPUT) window.addEventListener(type, onInput, { capture: true });
  subscribe(() => {
    if (locked) render();
  });

  return {
    arm() {
      armed = true;
      wait();
    },
    disarm() {
      armed = false;
      clearTimeout(idle);
      unlock(false);
    },
    now() {
      clearTimeout(idle);
      lock();
    },
  };
}
