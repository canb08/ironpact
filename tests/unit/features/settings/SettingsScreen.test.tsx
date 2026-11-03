// @vitest-environment jsdom
import { createMemoryRouter, RouterProvider } from 'react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { formatExport, type ExportInput } from '@shared/export-format.ts';
import { RepoProvider } from '../../../../src/app/RepoProvider.tsx';
import SettingsScreen from '../../../../src/features/settings/SettingsScreen.tsx';
import { previewDates } from '../../../../src/features/export/export.ts';
import { copy } from '../../../../src/ui/copy.ts';
import { unwrap } from '../../data/harness.ts';
import { mockRepo } from './harness.ts';

let context: Awaited<ReturnType<typeof mockRepo>>;
beforeEach(async () => {
  context = await mockRepo();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
});
afterEach(async () => { await context.close(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

let router: ReturnType<typeof createMemoryRouter>;
function mount(section = 'privacy') {
  router = createMemoryRouter([{ path: '/settings/:section?', element: <SettingsScreen /> }], { initialEntries: [`/settings/${section}`] });
  const view = render(<RepoProvider repo={context.repo}><RouterProvider router={router} /></RepoProvider>);
  fireEvent.click(screen.getByText(copy.x8Tokens, { selector: 'summary' }));
  fireEvent.click(screen.getByText(copy.exportPreview, { selector: 'summary' }));
  fireEvent.click(screen.getByText(copy.x8ExportAccess, { selector: 'summary' }));
  return view;
}

function previewBody(): HTMLPreElement {
  const region = screen.getByRole('region', { name: copy.exportPreview });
  const pre = region.querySelector('pre');
  expect(pre).toBeTruthy();
  return pre as HTMLPreElement;
}

async function hold(button: HTMLElement, duration = 1250) {
  vi.useRealTimers();
  fireEvent.keyDown(button, { key: 'Enter' });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, duration)); });
  fireEvent.keyUp(button, { key: 'Enter' });
}

it('shows a generated token once, copies it, masks on close/remount, and lists revocation', async () => {
  const user = userEvent.setup();
  const view = mount();
  const generate = await screen.findByRole('button', { name: copy.generateToken });
  await waitFor(() => expect(generate.hasAttribute('disabled')).toBe(false));
  await user.click(generate);
  const dialog = await screen.findByRole('dialog', { name: copy.generateToken });
  const plaintext = dialog.querySelector('code')!.textContent!;
  expect(plaintext).toMatch(/^spx_[A-Za-z0-9_-]{43}$/);
  const write = vi.spyOn(navigator.clipboard, 'writeText');
  await user.click(within(dialog).getByRole('button', { name: copy.copyToken }));
  expect(write).toHaveBeenCalledWith(plaintext);
  await user.keyboard('{Escape}');
  expect(document.body.textContent).not.toContain(plaintext);
  expect(await screen.findByText(copy.tokenMask)).toBeTruthy();
  view.unmount(); mount();
  expect(await screen.findByText(copy.tokenMask)).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  await hold(screen.getByRole('button', { name: copy.revokeToken }));
  expect(await screen.findByText(copy.tokenRevoked, { selector: 'p' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: copy.revokeToken })).toBeNull();
  expect(unwrap(await context.repo.exportTokens.listTokens())[0]?.revoked_at).not.toBeNull();
});

it('revokes before regenerating, displays the replacement once and retains revoked metadata', async () => {
  unwrap(await context.repo.exportTokens.createToken('Vault'));
  const user = userEvent.setup(); mount();
  await hold(await screen.findByRole('button', { name: copy.regenerateToken }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.querySelector('code')!.textContent).toMatch(/^spx_[A-Za-z0-9_-]{43}$/);
  await user.click(within(dialog).getByRole('button', { name: copy.close }));
  const rows = unwrap(await context.repo.exportTokens.listTokens());
  expect(rows).toHaveLength(2);
  expect(rows.filter((row) => row.revoked_at)).toHaveLength(1);
  expect(await screen.findByText(copy.tokenRevoked, { selector: 'p' })).toBeTruthy();
});

it('never redisplays a token when a clipboard request is rejected after the sheet closes', async () => {
  const user = userEvent.setup(); mount();
  const generate = await screen.findByRole('button', { name: copy.generateToken });
  await waitFor(() => expect(generate.hasAttribute('disabled')).toBe(false));
  await user.click(generate);
  const dialog = await screen.findByRole('dialog');
  const plaintext = dialog.querySelector('code')!.textContent!;
  let reject!: () => void;
  vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => new Promise<void>((_, fail) => { reject = () => fail(new Error('Denied')); }));
  await user.click(within(dialog).getByRole('button', { name: copy.copyToken }));
  await user.keyboard('{Escape}');
  await act(async () => { reject(); });
  expect(document.body.textContent).not.toContain(plaintext);
  expect(await screen.findByText(copy.clipboardUnavailable)).toBeTruthy();
});

it('keeps the old token revoked when regeneration cannot connect', async () => {
  unwrap(await context.repo.exportTokens.createToken('Vault'));
  vi.spyOn(context.repo.exportTokens, 'createToken').mockResolvedValue({ ok: false, error: 'network' });
  mount();
  await hold(await screen.findByRole('button', { name: copy.regenerateToken }));
  expect(await screen.findByText(copy.tokenRevoked, { selector: 'p' })).toBeTruthy();
  expect(await screen.findByText(copy.networkRetry)).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(unwrap(await context.repo.exportTokens.listTokens()).filter((row) => !row.revoked_at)).toHaveLength(0);
});

it('clears a displayed token and its metadata when the account signs out', async () => {
  const user = userEvent.setup(); mount();
  const generate = await screen.findByRole('button', { name: copy.generateToken });
  await waitFor(() => expect(generate.hasAttribute('disabled')).toBe(false));
  await user.click(generate);
  const dialog = await screen.findByRole('dialog');
  const plaintext = dialog.querySelector('code')!.textContent!;
  await act(async () => { await context.repo.auth.signOut(); });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.body.textContent).not.toContain(plaintext);
  expect(screen.queryByText(copy.tokenMask)).toBeNull();
});

it('renders byte-exact seeded local previews in every format, saves through Repo, and updates live', async () => {
  const { repo } = context;
  const exercise = unwrap(await repo.w.createExercise({ name: 'Press', export_label: 'Press', kind: 'lift', category: 'compound', lower_body: false }));
  const session = unwrap(await repo.w.startSession({ kind: 'gym' }));
  unwrap(await repo.w.logSet({ session_id: session.id, exercise_id: exercise.id, reps: 5, weight_kg: 80, rpe: 8, note: 'a, "note" · ×' }));
  unwrap(await repo.w.finishSession(session.id));
  unwrap(await repo.w.logRun({ distance_m: 5200, duration_s: 1660 }));
  unwrap(await repo.w.logMartial({ discipline: 'BJJ', duration_min: 60 }));
  unwrap(await repo.w.logMin('20m walk'));
  unwrap(await repo.w.logBodyweight(78.4));
  const rows = await repo.q.entriesBetween(repo.auth.userId()!, '2026-10-19', '2026-10-25');
  const profile = (await repo.q.me())!;
  const input: ExportInput = { user_id: profile.id, tz: profile.tz, exercises: await repo.q.exercises(),
    sessions: rows.sessions, sets: rows.sets, cardio_entries: rows.cardio, martial_entries: rows.martial,
    min_entries: rows.min, bodyweight_entries: rows.bodyweight };
  const user = userEvent.setup(); mount();
  for (const [format, label] of [['lines', copy.exportLines], ['json', copy.exportJson], ['csv', copy.exportCsv]] as const) {
    const button = await screen.findByRole('button', { name: label });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    await user.click(button);
    await waitFor(() => expect(previewBody().textContent).toBe(formatExport(input, format, '2026-10-19')));
    expect((await repo.q.me())?.export_format).toBe(format);
  }
  await act(async () => { unwrap(await repo.w.logMin('new local entry')); });
  await waitFor(() => expect(previewBody().textContent).toContain('new local entry'));
});

it('copies the exact canonical E2.7/E6.2 text, with URL, format, header and no token', async () => {
  const profile = (await context.repo.q.me())!;
  const user = userEvent.setup(); mount();
  const button = await screen.findByRole('button', { name: copy.copyForAi });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  const write = vi.spyOn(navigator.clipboard, 'writeText');
  await user.click(button);
  const expected = `SPOTTER export for ${profile.display_name}: my own training data, read-only. Never anyone else's.
GET https://project.supabase.co/functions/v1/export   optional: ?format=lines|json|csv (my default: lines) · ?since=YYYY-MM-DD (inclusive, by local date)
Auth: Authorization: Bearer <MY_TOKEN>. The token is in env var SPOTTER_TOKEN. Never put it in a URL, a note, a log or a commit.
Lines format: newest date first, one line per exercise per day, LF endings, separators " · " (U+00B7) and "×" (U+00D7):
- 2026-10-24 · Bench · 3×5×80kg · RPE 8 · felt strong
- 2026-10-23 · Bench · 1×5×80kg + 2×3×85kg · RPE 9      (count×reps×kg groups, joined " + ", in set order)
- 2026-10-24 · Pull-up · 3×8×BW
- 2026-10-24 · Dip · 3×10×BW+10kg
- 2026-10-24 · Run · 5.2km · 27:40
- 2026-10-24 · BJJ · 60m · RPE 7 · drilled guard
- 2026-10-24 · Weight · 78.4kg
- 2026-10-24 · MIN · 20m walk
Sync: at most hourly. Pull the full export with If-None-Match: <last ETag>. 304 = no change.
On 200, REPLACE my whole SPOTTER section (past days can be edited or deleted). Never append.
200 with empty body = no entries. 401 = bad or revoked token. 429 = over 60 calls/hour (respect Retry-After).`;
  expect(write).toHaveBeenCalledWith(expected);
  expect(write.mock.calls[0]?.[0]).not.toMatch(/spx_[A-Za-z0-9_-]{43}/);
});

it('uses seven local calendar dates across DST and year boundaries', () => {
  expect(previewDates(new Date('2026-10-25T23:30:00Z'), 'Europe/Amsterdam')).toEqual({ from: '2026-10-20', to: '2026-10-26' });
  expect(previewDates(new Date('2027-01-02T12:00:00Z'), 'UTC')).toEqual({ from: '2026-12-27', to: '2027-01-02' });
});

it('disables remote token actions offline but keeps local format selection and preview', async () => {
  mount();
  await waitFor(() => {
    expect(previewBody().getAttribute('aria-label')).toBeNull();
  });
  await act(async () => { vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false); window.dispatchEvent(new Event('offline')); });
  expect(screen.getByRole('button', { name: copy.generateToken }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button', { name: copy.exportJson }).hasAttribute('disabled')).toBe(false);
  expect(screen.getByText(copy.needsSignal)).toBeTruthy();
});
