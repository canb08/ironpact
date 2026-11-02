# P5D · Delete-account function + 30-day purge
**Lane:** E (the friend's Claude · the friend's Codex + Grok) · **Model:** Codex · GPT-6 Astra, High · **Branch:** `P5D-delete-account` · **Starts after:** nothing (fire when a lane E Codex is free)

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §6 Phase 5 (delete account, purge), §4.4, §5.2 (token revoke), §10 E3.3, existing `supabase/functions/**` patterns (A5/A7).

## Scope
1. `supabase/functions/delete-account/index.ts`: authenticated caller only; deletes **all** of that user's rows (or anonymises shared crew rows per §4.4), revokes export tokens, deletes the auth user. Idempotent.
2. Repo entry point: `Remote.deleteAccount()` + `Repo.auth.deleteAccount()` (additive; record **L11**).
3. `supabase/migrations/0008_purge.sql`: pg_cron daily purge of soft-deleted rows older than 30 days.
4. Tests: Deno integration (after delete, an SQL count of that user's rows = 0; their export token → 401) + pgTAP for the purge.

## Files you may touch
`supabase/functions/delete-account/**`, `supabase/migrations/0008_purge.sql`, `supabase/tests/purge.test.sql`, `supabase/config.toml` (function entry), `src/data/adapter.ts` + `adapter.supabase.ts` + `adapter.mock.ts` + `repo.ts` (deleteAccount only), `tests/integration/**`, `.github/workflows/ci.yml` (`db` job step only), `docs/DECISIONS.md` (L11 only), `src/ui/copy.ts` (your anchor only).
**Do not touch:** other migrations, `src/features/**`.

## Acceptance
- [ ] Row count 0 + token 401 after delete (CI `db`).
- [ ] Purge keeps rows younger than 30 days (pgTAP).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P5D: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
