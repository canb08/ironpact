# P5B · S14 completed: rep-max table, PR list, per-set edit
**Lane:** C (the owner's Claude · the owner's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P5B-s14` · **Starts after:** P2E merged

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §2.4 S14, §6 Phase 5 S14 bullet. P2E's `ExerciseDetailScreen.tsx`, P2A queries.

## Scope
Complete S14 in `src/features/progress/`: rep-max table placeholder, PR list (`prEvents`), edit/delete per set (updateSet / softDelete + restore), a hidden data table for screen readers, the trend chart embedded from `src/features/stats/` if lane E exported one (import only).

## Files you may touch
`src/features/progress/**`, `tests/unit/features/progress/**`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/features/stats/**` (import only), `src/data/**`.

## Acceptance
- [ ] Editing a set's kg updates the list and the export preview (test).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P5B: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
