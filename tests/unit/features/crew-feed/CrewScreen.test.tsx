// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RepoProvider } from '../../../../src/app/RepoProvider.tsx';
import CrewScreen from '../../../../src/features/crew-feed/CrewScreen.tsx';
import { groupFeed } from '../../../../src/features/crew-feed/feed.ts';
import { MOCK_USER_IDS } from '../../../../src/data/adapter.mock.ts';
import { defaultProfile } from '../../../../src/data/defaults.ts';
import type { FeedItem } from '../../../../src/data/adapter.ts';
import { copy } from '../../../../src/ui/copy.ts';
import { mockRepo } from '../settings/harness.ts';

let context: Awaited<ReturnType<typeof mockRepo>>;
beforeEach(async () => { context = await mockRepo(); });
afterEach(async () => { await context.close(); vi.restoreAllMocks(); });

function mount() { return render(<RepoProvider repo={context.repo}><CrewScreen /></RepoProvider>); }

it('shows partner sets grouped by session and refreshes new activity through Repo pull', async () => {
  await context.remote.simulateCrewmateActivity();
  await context.repo.sync.pullNow();
  mount();
  const feed = await screen.findByRole('list', { name: copy.crewFeedTitle });
  await waitFor(() => expect(feed.children).toHaveLength(1));
  expect(feed.textContent).toContain('Bench press');
  const pull = vi.spyOn(context.repo.sync, 'pullNow');
  await context.remote.simulateCrewmateActivity();
  await userEvent.setup().click(screen.getByRole('button', { name: copy.refresh }));
  await waitFor(() => expect(feed.children).toHaveLength(2));
  expect(pull).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.getByRole('button', { name: copy.refresh }).hasAttribute('disabled')).toBe(false));
  fireEvent.touchStart(screen.getByRole('main'), { touches: [{ clientY: 0 }] });
  fireEvent.touchEnd(screen.getByRole('main'), { changedTouches: [{ clientY: 100 }] });
  await waitFor(() => expect(pull).toHaveBeenCalledTimes(2));
});

it('filters unshared bodyweight even if stale rows remain cached, then shows it when sharing is on', async () => {
  const partner = MOCK_USER_IDS.bob;
  // Deliberately leave a stale cached weight behind a profile with sharing off.
  await context.db.bodyweight_entries.put({ id: crypto.randomUUID(), user_id: partner,
    local_date: '2026-10-25', client_updated_at: '2026-10-25T12:00:00Z', deleted_at: null,
    measured_at: '2026-10-25T12:00:00Z', weight_kg: 87.6 });
  const weight = (await context.db.bodyweight_entries.toArray())[0]!;
  const feed = vi.spyOn(context.repo.q, 'crewFeed').mockResolvedValue([{ type: 'weight', row: weight }]);
  mount();
  await waitFor(() => expect(feed).toHaveBeenCalled());
  expect(screen.queryByText(/87\.6/)).toBeNull();
  await act(async () => { await context.db.profiles.update(partner, { show_bodyweight: true }); });
  expect(await screen.findByText('Weight · 87.6kg')).toBeTruthy();
  await act(async () => { await context.db.profiles.update(partner, { show_bodyweight: false }); });
  await waitFor(() => expect(screen.queryByText(/87\.6/)).toBeNull());
});

it('copies an absolute /join/<CODE> invite from createInvite and reports denied clipboard access', async () => {
  const user = userEvent.setup(); mount();
  const write = vi.spyOn(navigator.clipboard, 'writeText');
  await user.click(await screen.findByRole('button', { name: copy.copyInvite }));
  await waitFor(() => expect(write).toHaveBeenCalledOnce());
  expect(write.mock.calls[0]?.[0]).toMatch(/^http:\/\/localhost(?::\d+)?\/join\/[0-9A-Z]{10}$/);
  write.mockRejectedValue(new Error('Denied'));
  await waitFor(() => expect(screen.getByRole('button', { name: copy.copyInvite }).hasAttribute('disabled')).toBe(false));
  await user.click(screen.getByRole('button', { name: copy.copyInvite }));
  expect(await screen.findByText(copy.clipboardUnavailable)).toBeTruthy();
  expect(document.querySelector('.crew-link')?.textContent).toContain('/join/');
});

it('requires confirmation and a completed hold before leaving the crew', async () => {
  const leave = vi.spyOn(context.repo.crew, 'leave');
  const user = userEvent.setup(); mount();
  await user.click(await screen.findByRole('button', { name: copy.leaveCrew }));
  expect(leave).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: copy.cancel }));
  expect(leave).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: copy.leaveCrew }));
  const dialog = screen.getByRole('dialog', { name: copy.leaveCrew });
  const hold = within(dialog).getByRole('button', { name: copy.holdLeaveCrew });
  fireEvent.keyDown(hold, { key: 'Enter' });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 650)); });
  fireEvent.keyUp(hold, { key: 'Enter' });
  await waitFor(() => expect(leave).toHaveBeenCalledOnce());
  expect(await screen.findByText(copy.noCrew)).toBeTruthy();
});

it('groups sets without merging different sessions and caps visible entries at 20', async () => {
  await context.remote.simulateCrewmateActivity();
  await context.repo.sync.pullNow();
  const items = await context.repo.q.crewFeed(20);
  const item = items.find((entry) => entry.type === 'set');
  if (!item || item.type !== 'set') throw new Error('Expected mock set');
  const entries: FeedItem[] = Array.from({ length: 25 }, (_, index) => ({ ...item,
    row: { ...item.row, id: `set-${index}`, set_index: index + 1, session_id: index < 10 ? 'one' : 'two',
      logged_at: new Date(Date.parse('2026-10-25T12:00:00Z') + index * 1000).toISOString() } }));
  const groups = groupFeed(entries, [defaultProfile(MOCK_USER_IDS.bob, 'UTC')]);
  expect(groups).toHaveLength(2);
  expect(groups.flatMap((group) => group.items)).toHaveLength(20);
  expect(groups[0]?.items[0]?.type === 'set' && groups[0].items[0].row.set_index).toBe(11);
  expect(groupFeed(entries, [])).toHaveLength(0);
});
