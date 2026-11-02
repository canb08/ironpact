# P3H · Shared credit fixtures (SQL ↔ TypeScript parity)
**Lane:** E (Eytan's Claude · Eytan's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P3H-work` · **Starts after:** P3A (#28) + P3C (#27), both merged · **Why:** `docs/DECISIONS.md` L12 (P3A's contract change request)

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §10 E5.5, E5.6, **E5.7** (one credit rule, tested against the same `tests/fixtures/credits/*.json` from pgTAP **and** Vitest so SQL and TS can't drift), §1.6 D5. Existing `src/core/credits.ts` + `tests/unit/core/credits.test.ts`, `supabase/migrations/0005_cron.sql` (`public.week_credits`) + `supabase/tests/week_close.test.sql` (setup pattern for users, sessions and entries).

## Scope
Tests only. No change to `credits.ts`, `0005_cron.sql` or any migration.
1. `tests/fixtures/credits/*.json`: one file per case. Each = `{ name, week_start, target, sessions: [...], min_entries: [...], sets: [...], cardio_entries: [...], martial_entries: [...], expected: { credits, status } }`, using fixed UUIDs and `alice@example.test`-style test users only. At least these cases:
   - one gym session with a working set → 1; warm-up sets only → 0;
   - Floor MIN rows → 0.5 each, the MIN session itself never 1 (E5.6);
   - two sessions + MINs on one date cap at 2.0; another date has its own cap;
   - run and martial sessions → 1 each when they have an entry, 0 when empty;
   - soft-deleted session or entry → not counted;
   - a set at 23:30 local on Sun 25 Oct 2026 counts in the week of Mon 19 Oct (credit date = session `local_date`, E5.5);
   - the 2027-03-28 week;
   - status FULL / HELD / REST at the target boundary.
2. `tests/unit/core/credits.fixtures.test.ts`: loads every JSON file and asserts `weekCredits(...)` equals `expected` (one named test per fixture).
3. `scripts/credit-fixtures.mjs`: generates `supabase/tests/credits_fixtures.test.sql` from the same JSON (pgTAP: insert the rows in a transaction, `is(public.week_credits(user, week_start), expected.credits, name)`, roll back). Plain Node, no new dependency.
4. `tests/unit/core/credits.fixtures.sql.test.ts`: runs the generator in memory and fails if the committed `.sql` file differs (so nobody edits one side only).

## Files you may touch
`tests/fixtures/credits/**`, `tests/unit/core/credits.fixtures.test.ts`, `tests/unit/core/credits.fixtures.sql.test.ts`, `scripts/credit-fixtures.mjs`, `supabase/tests/credits_fixtures.test.sql` (generated).
**Do not touch:** `src/**`, `supabase/migrations/**`, other `supabase/tests/*`, `.github/workflows/*` (the `db` job already runs every `supabase/tests/*.test.sql`; if it doesn't, raise a `## Contract change request`).

## Acceptance
- [ ] Same fixture set passes in Vitest and pgTAP (CI `check` + `db` green; print the fixture count from both).
- [ ] Changing one JSON `expected` value makes both suites fail (state you tried it locally for Vitest).
- [ ] Generated `.sql` is up to date (the drift test passes).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- No UI strings in this ticket.
- Initial JS stays ≤170 kB gzip (`npm run size`); this ticket adds no app code.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
