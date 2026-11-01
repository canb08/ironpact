# P3B · Duo data layer + realtime client
**Lane:** E (Eytan's Claude · Eytan's Codex + Grok) · **Model:** Codex · GPT-6 Astra, High · **Branch:** `P3B-duo` · **Starts after:** P3A merged

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §4.5, §2 F15, §6 Phase 3, §10 E7.7. `src/data/adapter.ts`, `repo.ts`, `adapter.supabase.ts`, `adapter.mock.ts`, P3A's RPCs.

## Scope
1. `src/data/duo.contract.ts`: `RepoDuo` = `weeks(fromWeekStart)` (crew_weeks), `bar()` (current value + history), `spots()` + `useSpot(weekStart)`, `presence.onChange(cb)` (partner presence `{user_id, session_id, kind, exercise_label, set_no, started_at}`), `onCrewChange(cb)` (new partner rows → delta pull).
2. `src/data/duo.ts` implements it (Dexie reads liveQuery-safe). `src/data/realtime.ts`: Supabase private channel `crew:{crew_id}`, presence track/untrack, re-subscribe + delta pull on `visibilitychange`. `src/data/realtime.mock.ts`: in-memory bus for `VITE_BACKEND=mock` (units + e2e).
3. **Presence is published by the data layer**, not the UI: `startSession`, `logSet`, `finishSession` update it; it clears 2 min after the last activity.
4. Wiring only: `Repo` gains `duo: RepoDuo` (one line in `adapter.ts` + creation in `repo.ts`); `Remote` gains `useSpot` (+ realtime hooks if needed) in `adapter.ts`, `adapter.supabase.ts`, `adapter.mock.ts`. Record as **L10** in `docs/DECISIONS.md`.
5. Tests: units on mock; `tests/integration/realtime.supabase.test.ts` (CI local stack): a set logged on client A appears on B in **≤3 s, p90 over 10 runs**; presence clears ≤2 min 10 s (fake clock).

## Files you may touch
`src/data/duo.contract.ts`, `src/data/duo.ts`, `src/data/realtime.ts`, `src/data/realtime.mock.ts`, `src/data/adapter.ts` (Repo.duo + new Remote methods only), `src/data/repo.ts` (wiring + presence hooks only), `src/data/adapter.supabase.ts` + `adapter.mock.ts` (new Remote methods only), `tests/unit/data/duo*.test.ts`, `tests/integration/realtime.supabase.test.ts`, `.github/workflows/ci.yml` (`db` job step only, if the new test isn't picked up), `docs/DECISIONS.md` (L10 only), `src/ui/copy.ts` (your anchor only).
**Do not touch:** lane C's new query/write methods (P2A), `src/features/**`, `supabase/**`.

## Acceptance
- [ ] p90 ≤3 s printed from CI.
- [ ] Third member joins with no schema change (test).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P3B: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
