/** Keep the newest current-exercise row above the fixed input dock. */
export function revealLatestSet(main: HTMLElement): void {
  const dock = main.querySelector<HTMLElement>('[data-session-dock]');
  const row = main.querySelector<HTMLElement>('[data-current-exercise] .session-set-row:last-child');
  if (!row || !dock || row.getBoundingClientRect().height === 0) return;
  if (getComputedStyle(dock).position !== 'fixed') return;
  const delta = row.getBoundingClientRect().bottom - dock.getBoundingClientRect().top + 12;
  window.scrollBy(0, delta);
}
