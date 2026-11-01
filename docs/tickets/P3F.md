# P3F · Progress S13 minimal: trend chart
**Lane:** E (Eytan's Claude · Eytan's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P3F-progress` · **Starts after:** P3C merged

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §2.4 S13, §2 F18, §2.8 (rebasing), §6 Phase 3.

## Scope
`src/features/stats/ProgressScreen.tsx` (route `/progress`, already in the frozen router): pick an exercise → best e1RM per session over 12 weeks as a plain SVG line chart (no chart library); partner line toggle (dashed, rebased to % of each person's own first value via `core/duel.ts`). Data from existing `repo.q.entriesBetween` for me and the partner.

## Files you may touch
`src/features/stats/**`, `tests/unit/features/stats/**`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/router.tsx`, `src/data/**`, `src/core/**`, other features.

## Acceptance
- [ ] Rebasing test: both lines start at 100%.
- [ ] Route chunk stays lazy (initial JS unchanged, print size).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P3F: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
