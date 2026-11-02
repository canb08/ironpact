# P2A · Data contract for the workout engine
**Lane:** C (the owner's Claude · the owner's Codex + Grok) · **Model:** Grok · Build (moved from Codex: usage limit) · **Branch:** `P2A-data` · **Starts after:** nothing (fire first)

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §2.3 F4–F13, §2.4 S5, S6, S8–S10, S14, S15, §4.3 (`sets`, `sessions`, `pr_events`, `exercise_prefs`, `cardio_entries`, `martial_entries`, `min_entries`, `bodyweight_entries`), §10 E5.x, E7.2. `src/data/adapter.ts`, `src/data/repo.ts`, `tests/unit/data/repo.contract.ts`.

## Scope
Additive changes to the frozen Repo (pre-approved by the Lead as **L9**; record it in `docs/DECISIONS.md` in one entry):
1. `RepoQueries` gains:
   - `exerciseHistory(exerciseId, limitSessions)` → my sessions containing that exercise, newest first, each with its sets (S14, F4, F5);
   - `recentSessionsWithSets(limit)` → my last N finished gym sessions with ordered sets (next-exercise guess, F4);
   - `prEvents(filter: { exerciseId?; sessionId?; since? })` → live (non-deleted) PR events;
   - `exercisePref(exerciseId)` → my `exercise_prefs` row or `undefined`;
   - `day(date: LocalDate)` → every entry of mine on that local date (sessions + sets, cardio, martial, MIN, bodyweight) (S15).
2. `RepoWrites` gains:
   - `recordPrEvents(rows)` (one outbox transaction; rows come from `core/prs.ts`, built in P2B);
   - `setExercisePref(exerciseId, patch)` (rest seconds only — **Big jumps is the profile flag `profiles.big_jumps`**, read via `q.me()`, written via `upsertMyProfile`; no schema change);
   - `updateSession(id, patch)` (started_at, ended_at, note, readiness, **local_date move**; children keep consistent dates per E5.5);
   - `updateEntry(table: 'cardio_entries' | 'martial_entries' | 'min_entries' | 'bodyweight_entries', id, patch)`.
   - Verify `softDelete('sets', id)` tombstones that set's `pr_events` in the **same** outbox batch (F8); add it if missing.
3. Implement all of it in `src/data/repo.ts` (Dexie reads must stay liveQuery-safe: only Dexie promises inside queries). Validation through `src/core/validate.ts` (add schemas there).
4. Contract tests: add one case per new method to `tests/unit/data/repo.contract.ts`. It already runs on **mock and Supabase** in CI, so both backends are proven.
No schema change is expected. If a column is missing, stop and ask (contract change request).

## Files you may touch
`src/data/adapter.ts` (additive only: new methods and types, no renames), `src/data/repo.ts`, `src/core/validate.ts` (new schemas only), `tests/unit/data/**`, any test fixture that implements the full `Repo` (e.g. `tests/unit/features/auth/mockRepo.ts`: add the new methods only), `docs/DECISIONS.md` (the L9 entry only), `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/data/duo*.ts`, `src/data/realtime*.ts` (lane E), `supabase/**`, `src/features/**`, existing method signatures.

## Acceptance
- [ ] Every new method has a contract case passing on mock **and** Supabase in CI `db` (print both counts).
- [ ] Deleting a set tombstones its PR events in one batch (test).
- [ ] Moving a session to another date moves its children (test).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P2A: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
