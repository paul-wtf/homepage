function reveal(btn: HTMLElement): string | null {
  const { emailUser, emailDomain } = btn.dataset;
  if (!emailUser || !emailDomain) return null;
  const email = `${emailUser}@${emailDomain}`;
  const span = btn.querySelector<HTMLElement>('[data-email-text]');
  if (span) span.textContent = email;
  return email;
}

document.querySelectorAll<HTMLElement>('[data-email-user]').forEach(reveal);

document.addEventListener('click', async (event) => {
  const target = event.target as Element | null;

  const mail = target?.closest<HTMLElement>('[data-email-user]');
  if (mail) {
    const email = reveal(mail);
    if (email) window.location.href = `mailto:${email}`;
    return;
  }

  const btn = target?.closest<HTMLElement>('[data-discord]');
  const username = btn?.dataset.discord;
  if (!btn || !username) return;
  try {
    await navigator.clipboard.writeText(username);
  } catch {
    return;
  }
  const span = btn.querySelector<HTMLElement>('[data-discord-text]');
  if (!span || btn.classList.contains('copied')) return;
  const original = span.textContent ?? username;
  span.textContent = 'Kopiert!';
  btn.classList.add('copied');
  setTimeout(() => {
    span.textContent = original;
    btn.classList.remove('copied');
  }, 1500);
});
