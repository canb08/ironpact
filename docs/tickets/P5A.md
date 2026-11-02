# P5A · S13 Progress full: lifts, run, martial arts, body
**Lane:** E (the friend's Claude · the friend's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P5A-s13` · **Starts after:** P3F merged

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §2.4 S13, §6 Phase 5 (S13 + empty states), §2 F18. P3F's `ProgressScreen.tsx` + chart.

## Scope
Extend `src/features/stats/`: tabs Lifts (sparkline per lift → `/exercise/:id`), Run, Martial arts, Body (7-day moving average). Empty states with no fake numbers ("Two sessions and the lines start drawing."). Plain SVG, lazy route, a hidden data table for screen readers.

## Files you may touch
`src/features/stats/**`, `tests/unit/features/stats/**`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/features/progress/**` (lane C's S14/S15), `src/data/**`, `src/core/**`.

## Acceptance
- [ ] 7-day moving average test; empty states; works at 375 px with 200% text (no horizontal scroll).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P5A: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
