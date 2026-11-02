# P2F · Server re-check of PR events
**Lane:** C (Can's Claude · Can's Codex + Grok) · **Model:** Grok · Build (moved from Codex: usage limit) · **Branch:** `P2F-server` · **Starts after:** nothing (fire first, parallel with P2A)

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §2 F7 ("inserted locally and re-checked on the server"), §4.3 `pr_events`, §4.4, §10 E7.2. Existing migrations 0001–0003, 0006.

## Scope
1. `supabase/migrations/0007_pr_check.sql`: a trigger on `pr_events` insert/update that rejects (raises) a row whose source set/entry doesn't exist, isn't the caller's, is soft-deleted, or whose claimed value doesn't match the source (recompute Epley e1RM, reps, volume, distance, pace). A rejected row dead-letters in the client outbox, which is the intended behaviour.
2. Soft-deleting a source set server-side also soft-deletes its `pr_events` (trigger), mirroring the client batch. Validation must still allow an unchanged PR row to become a tombstone after its source is deleted.
3. pgTAP `supabase/tests/pr_check.test.sql`: valid PR accepted; forged value rejected; another user's set rejected; deleted source rejected; set delete cascades.

## Files you may touch
`supabase/migrations/0007_pr_check.sql`, `supabase/tests/pr_check.test.sql`, existing `supabase/tests/*.sql` fixtures that insert fabricated PR values (correct the values only), `src/ui/copy.ts` (your anchor only).
**Do not touch:** migrations 0001–0006, `src/**`.

## Acceptance
- [ ] CI `db` green with the new pgTAP file (print its count).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P2F: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
