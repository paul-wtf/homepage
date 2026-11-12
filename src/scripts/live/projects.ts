import { latest, subscribe } from './status';

export function markProjects(root: ParentNode = document): void {
  const states = latest()?.projects;
  for (const badge of root.querySelectorAll<HTMLElement>('[data-project]')) {
    const state = states?.[badge.dataset.project ?? ''];
    if (state) badge.dataset.state = state;
    else badge.removeAttribute('data-state');
    const word = badge.querySelector<HTMLElement>('[data-word]');
    if (word) word.textContent = state === 'down' ? 'down' : 'live';
  }
}

subscribe(() => markProjects());
markProjects();
