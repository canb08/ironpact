# P3A · Realtime channel + week-close cron (database)
**Lane:** E (Eytan's Claude · Eytan's Codex + Grok) · **Model:** Codex · GPT-6 Astra, High · **Branch:** `P3A-realtime` · **Starts after:** nothing (fire first)

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §4.5 (Realtime), §2.2 + §10 E2.1 (credits, the Bar), §1.6 D5–D8 (credits cap, Bar, spots), §6 Phase 3, §7.2, §10 E7.7 (presence payload). Existing migrations 0001–0003, 0006.

## Scope
Migrations numbered **0004/0005** as the spec says (nothing is deployed yet, so ordering before 0006 is fine on a fresh reset):
1. `0004_realtime.sql`: publication for the tables §4.5 lists; private channel `crew:{crew_id}` with an RLS policy on `realtime.messages` so only crew members can receive/send broadcast + presence.
2. `0005_cron.sql`: `close_week(crew_id, week_start)` (security definer, idempotent): each member's credits (MIN 0.5, cap 2.0/day), week status FULL/HELD/REST into `crew_weeks`, the Bar delta table (FULL/FULL +1, HELD/FULL 0, REST −1, REST spotted 0, never below 0), spot consumption per D8 in `streak_tokens`. RPC `use_spot(week_start)` with the spot window + monthly limit. `pg_cron` runs hourly at :05 and closes every crew whose **local** time is Monday 00:05–01:04 (weeks built in the crew's zone, never +168 h).
3. pgTAP: `realtime.test.sql` (non-member can't read the crew channel), `week_close.test.sql` (the Bar table rows, idempotency, DST week 2027-03-28, spot limits).

## Files you may touch
`supabase/migrations/0004_realtime.sql`, `supabase/migrations/0005_cron.sql`, `supabase/tests/realtime.test.sql`, `supabase/tests/week_close.test.sql`, `supabase/config.toml` (enable realtime/cron only if required), `src/ui/copy.ts` (your anchor only).
**Do not touch:** migrations 0001–0003, 0006, 0007 (lane C), `src/**`.

## Acceptance
- [ ] CI `db` green; every Bar-table row and the DST week are named pgTAP tests (print the count).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P3A: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
