# P4H · Wire the partner-PR shockwave end to end (+ `mark_seen` RPC)
**Lane:** C (owner's Codex) · **Model:** Codex · GPT-6 Astra, High · **Branch:** `P4H-work` · **Starts after:** P4G merged (P4C #52, P4E #46 on main)

## Why
P4G's PR (#53) found the shockwave is never triggered in production: `usePartnerPrShockwave` (P4C) has no caller, nothing invokes `publishPartnerShockwaves` (P4E), and the Repo has no `unseenPartnerPrs` / `markPrEventsSeen`. H3's audit gap **G4**: no `mark_seen` RPC, so a partner cannot record "seen" (RLS lets only the owner update `pr_events`).

## Read first
`AGENTS.md`. `docs/SPEC.md` §6 Phase 4 Tier 2 (partner PR shockwave on next open, plays once, `pr_events.seen_by`), §4.4, §2.8. `docs/SECURITY-AUDIT.md` G4. `src/features/prs/` (P4C hook), `src/features/duo/` (P4E shockwave), `src/data/adapter.ts`, `repo.ts`, `adapter.supabase.ts`, `adapter.mock.ts`, `supabase/migrations/0007_pr_check.sql` + `0009_pr_check_upsert.sql` (the PR guard must keep passing).

## Scope
1. `supabase/migrations/0010_mark_seen.sql`: `mark_pr_events_seen(ids uuid[])` security definer, `set search_path = ''`, granted to `authenticated` only: appends `auth.uid()` to `seen_by` for live PR rows owned by a crewmate (`is_crewmate`), idempotent, nothing else changes. Make sure 0007/0009's guard accepts it (a `seen_by`-only change by this function). pgTAP: crewmate can mark, non-member can't, owner's claim fields unchanged, idempotent.
2. Contract (additive, record **L16**): `Remote.markPrEventsSeen(ids)`; `Repo.q.unseenPartnerPrs()` (live partner PR rows where my id ∉ `seen_by`); `Repo.w.markPrEventsSeen(ids)` (calls the RPC online; queues nothing offline — it retries on next open).
3. Wire it: Floor (and Crew) call the P4C hook on open → P4E shockwave plays once → `markPrEventsSeen`. Remove the dead publisher path or route it through this.
4. Tests: contract cases on mock + Supabase; a unit test that it plays once and not on the next open.

## Files you may touch
`supabase/migrations/0010_mark_seen.sql`, `supabase/tests/mark_seen.test.sql`, `src/data/adapter.ts` (additive), `src/data/repo.ts`, `src/data/adapter.supabase.ts`, `src/data/adapter.mock.ts`, `src/features/prs/**`, `src/features/duo/**`, `src/features/floor/**`, `src/features/crew-feed/**`, `tests/unit/**`, `tests/integration/**`, `tests/unit/features/auth/mockRepo.ts` (stubs), `docs/DECISIONS.md` (L16 only).

## Acceptance
- [ ] CI `check` + `db` + `e2e` green; pgTAP for the RPC; contract cases on both backends.
- [ ] P4G's two-context shockwave spec still passes.
