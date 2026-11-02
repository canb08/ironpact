# P5F · Recompute PRs after an edit + edit notices
**Lane:** C (the owner's Claude · the owner's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P5F-work` · **Starts after:** nothing (P2A, P2B, P5B merged)

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §2.4 S14 + S15 (edit notices), §2 F7 + §10 E7.2 (PR tiers), §2.2 (week credits). `src/core/prs.ts` (P2B), `src/data/repo.ts` (`updateSet`, `updateEntry`, `softDelete`, `recordPrEvents`), `supabase/migrations/0007_pr_check.sql` (server re-check: a PR row must match its source).

## Scope
1. `src/data/repo.ts` + `src/data/adapter.ts` (additive): `RepoWrites.recomputePrs(exerciseId)` → re-run `core/prs.ts` over my live history for that exercise (or that run bucket), tombstone `pr_events` rows that no longer hold, insert the ones that now hold. One outbox batch. Returns `{ changed: boolean }`. Record as **L13** in `docs/DECISIONS.md`.
2. Call it after `updateSet`, `updateEntry` (cardio) and `softDelete`/`restore` of a set or run, inside the same write (UI stays a single call).
3. UI notices: S14 (`src/features/progress/`) and S15 show "PRs recalculated." when `changed`; "Bar adjusted after edit." when the edited entry's local date falls in a closed week (`crew_weeks` exists for that week). Strings under your copy anchor (add `// ── P5F` below the P5E anchor).
4. Contract test cases in `tests/unit/data/repo.contract.ts` (they run on mock **and** Supabase in CI, so the server re-check from 0007 must accept every row you write).

## Files you may touch
`src/data/adapter.ts` (additive), `src/data/repo.ts`, `src/features/progress/**`, `tests/unit/data/**`, `tests/unit/features/progress/**`, `tests/unit/features/auth/mockRepo.ts` (new method stub only), `docs/DECISIONS.md` (L13 only), `src/ui/copy.ts` (your anchor only).
**Do not touch:** `supabase/**`, `src/core/**` (import only), other features.

## Acceptance
- [ ] Editing the PR set down → its PR is tombstoned and the next-best set becomes the PR (contract test, mock + Supabase).
- [ ] Notices appear only when something changed (tests).
- [ ] typecheck, lint, test, build, size, e2e green.
