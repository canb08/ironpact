// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RepoProvider } from '../../../../src/app/RepoProvider.tsx';
import SettingsScreen from '../../../../src/features/settings/SettingsScreen.tsx';
import { clearDocumentFeel } from '../../../../src/features/settings/feel.ts';
import { hapticsEnabled } from '../../../../src/platform/haptics.ts';
import { soundEnabled } from '../../../../src/platform/audio.ts';
import { copy, fill } from '../../../../src/ui/copy.ts';
import { mockRepo } from './harness.ts';

let context: Awaited<ReturnType<typeof mockRepo>>;
beforeEach(async () => {
  clearDocumentFeel();
  context = await mockRepo();
});
afterEach(async () => {
  cleanup();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  await context.close();
  clearDocumentFeel();
  vi.restoreAllMocks();
});

function mount() {
  return render(<RepoProvider repo={context.repo}><SettingsScreen /></RepoProvider>);
}

function setInput(element: HTMLElement, value: string) {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
  fireEvent.input(element);
}

async function hold(button: HTMLElement) {
  fireEvent.keyDown(button, { key: 'Enter' });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 800)); });
  fireEvent.keyUp(button, { key: 'Enter' });
}

async function me() {
  return context.repo.q.me();
}

it('persists every toggle through upsertMyProfile and applies feel flags', async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByRole('checkbox', { name: copy.soundOn });

  await user.click(screen.getByRole('checkbox', { name: copy.soundOn }));
  await waitFor(async () => expect((await me())?.sound_on).toBe(true));
  await waitFor(() => expect(soundEnabled()).toBe(true));

  await user.click(screen.getByRole('checkbox', { name: copy.hapticsOn }));
  await waitFor(async () => expect((await me())?.haptics_on).toBe(false));
  await waitFor(() => expect(hapticsEnabled()).toBe(false));

  await user.click(screen.getByRole('checkbox', { name: copy.reduceMotionOn }));
  await waitFor(async () => expect((await me())?.reduce_motion).toBe(true));
  await waitFor(() => expect(document.documentElement.dataset.reducedMotion).toBe('on'));

  await user.click(screen.getByRole('checkbox', { name: copy.batterySaverOn }));
  await waitFor(async () => expect((await me())?.battery_saver).toBe(true));
  await waitFor(() => expect(document.documentElement.dataset.batterySaver).toBe('on'));

  await user.click(screen.getByRole('checkbox', { name: copy.bigJumps }));
  await waitFor(async () => expect((await me())?.big_jumps).toBe(true));

  await user.click(screen.getByRole('checkbox', { name: copy.shareBodyweight }));
  await waitFor(async () => expect((await me())?.show_bodyweight).toBe(true));

  await user.click(screen.getByRole('checkbox', { name: copy.shareDots }));
  await waitFor(async () => expect((await me())?.share_dots).toBe(true));

  await user.click(screen.getByRole('checkbox', { name: copy.notifyPartnerStart }));
  await waitFor(async () => expect((await me())?.notify.partner_start).toBe(true));
  await user.click(screen.getByRole('checkbox', { name: copy.notifyPartnerPr }));
  await waitFor(async () => expect((await me())?.notify.partner_pr).toBe(false));
  await user.click(screen.getByRole('checkbox', { name: copy.notifyNudge }));
  await waitFor(async () => expect((await me())?.notify.nudge).toBe(false));
  await user.click(screen.getByRole('checkbox', { name: copy.notifyRecap }));
  await waitFor(async () => expect((await me())?.notify.recap).toBe(false));
  await user.click(screen.getByRole('checkbox', { name: copy.notifySpot }));
  await waitFor(async () => expect((await me())?.notify.spot).toBe(false));

  await user.click(screen.getByRole('radio', { name: copy.themeLight }));
  await waitFor(async () => expect((await me())?.theme).toBe('light'));
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));

  const units = screen.getByRole('checkbox', { name: /^kg$/ });
  expect(units.hasAttribute('disabled')).toBe(true);
  expect((units as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText(copy.unitsFixed)).toBeTruthy();
  expect(screen.getByText(fill(copy.restCompoundLine, { seconds: 120 }))).toBeTruthy();
  expect(screen.getByText(fill(copy.restIsolationLine, { seconds: 90 }))).toBeTruthy();
});

it('saves name, colour, target, plates, bar, min label and quiet hours', async () => {
  const user = userEvent.setup();
  mount();
  const name = await screen.findByRole('textbox', { name: copy.displayName });
  setInput(name, 'Lifter');
  fireEvent.blur(name);
  await waitFor(async () => {
    const profile = await me();
    expect(profile?.display_name).toBe('Lifter');
    expect(profile?.initial).toBe('L');
  });

  await user.click(screen.getByRole('button', { name: copy.colourIce }));
  await waitFor(async () => expect((await me())?.color_hue).toBe(220));

  await user.click(screen.getByRole('button', { name: fill(copy.increase, { label: copy.weeklyTarget }) }));
  await waitFor(async () => expect((await me())?.weekly_target).toBe(4));

  await user.click(screen.getByRole('checkbox', { name: fill(copy.plateKg, { kg: 25 }) }));
  await waitFor(async () => expect((await me())?.plates_kg).not.toContain(25));
  expect((await me())?.plates_kg).toContain(20);

  await user.click(screen.getByRole('button', { name: fill(copy.increase, { label: copy.barKg }) }));
  await waitFor(async () => expect((await me())?.bar_kg).toBe(22.5));

  const min = screen.getByRole('textbox', { name: copy.settingsMinLabel });
  setInput(min, '10m walk');
  fireEvent.blur(min);
  await waitFor(async () => expect((await me())?.min_default_label).toBe('10m walk'));

  setInput(screen.getByLabelText(copy.quietStart), '21:30');
  await waitFor(async () => expect((await me())?.quiet_start).toBe('21:30'));
  setInput(screen.getByLabelText(copy.quietEnd), '07:15');
  await waitFor(async () => expect((await me())?.quiet_end).toBe('07:15'));
});

it('shows one dead entry and retries or discards it', async () => {
  const seq = await context.db.outbox.add({
    table: 'sets',
    row_id: '00000000-0000-4000-8000-000000000099',
    payload: { id: '00000000-0000-4000-8000-000000000099' },
    revision: 'rev-1',
    status: 'dead',
    created_at: '2026-10-25T12:00:00.000Z',
    last_error: 'invalid set',
  });
  const user = userEvent.setup();
  mount();
  expect(await screen.findByText(copy.deadOne)).toBeTruthy();
  const retry = vi.spyOn(context.repo.sync, 'retryDead').mockResolvedValue(undefined);
  await user.click(screen.getByRole('button', { name: copy.retryEntry }));
  expect(retry).toHaveBeenCalledWith(seq);

  retry.mockRestore();
  await user.click(screen.getByRole('button', { name: copy.discardEntry }));
  await waitFor(async () => expect(await context.repo.q.deadLetters()).toEqual([]));
  await waitFor(() => expect(screen.queryByText(copy.deadOne)).toBeNull());
});

it('does not delete until the hold and DELETE are both done', async () => {
  const user = userEvent.setup();
  const spy = vi.spyOn(context.repo.auth, 'deleteAccount');
  mount();
  const name = await screen.findByRole('textbox', { name: copy.displayName });
  await user.type(name, 'DELETE');
  expect(spy).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox', { name: copy.deleteTypeLabel })).toBeNull();

  await hold(await screen.findByRole('button', { name: copy.holdDeleteAccount }));
  const typed = await screen.findByRole('textbox', { name: copy.deleteTypeLabel });
  const confirm = screen.getByRole('button', { name: new RegExp(`^${copy.deleteAccount}$`) });
  expect(confirm.hasAttribute('disabled')).toBe(true);
  await user.type(typed, 'delete');
  expect(confirm.hasAttribute('disabled')).toBe(true);
  expect(spy).not.toHaveBeenCalled();
  await user.clear(typed);
  await user.type(typed, 'DELETE');
  expect(confirm.hasAttribute('disabled')).toBe(false);
  await user.click(confirm);
  await waitFor(() => expect(spy).toHaveBeenCalledOnce());
  expect(await screen.findByText(copy.profileNeeded)).toBeTruthy();
});

it('copies a crew invite and leaves on hold', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole('button', { name: copy.copyInvite }));
  const code = await screen.findByLabelText(copy.inviteCodeLabel);
  expect(code.textContent).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
  await hold(screen.getByRole('button', { name: copy.holdLeaveCrew }));
  await waitFor(async () => expect(await context.repo.q.myCrew()).toBeUndefined());
  expect(await screen.findByText(copy.noCrew)).toBeTruthy();
});

it('signs out from settings', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole('button', { name: copy.signOut }));
  expect(await screen.findByText(copy.profileNeeded)).toBeTruthy();
});
