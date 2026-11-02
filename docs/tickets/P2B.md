# P2B · Core: PRs, progression, readiness, prefill
**Lane:** C (the owner's Claude · the owner's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P2B-core` · **Starts after:** nothing (fire first)

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §2 F4 (prefill + next-exercise guess, ties), F5 + §1.6 D10 (progression), F7 + §10 E7.2 (PR tiers), F13 + D9 + §10 E2.2 (readiness), §7.1 (unit test list), §6 Phase 2 Definition of done. Existing `src/core/e1rm.ts`, `volume.ts`, `types.ts`.

## Scope
Pure functions only (no React, no I/O, time and timezone injected), each with unit tests:
1. `src/core/prs.ts`: detect PRs for a new set or entry: e1RM (Epley, r 1–12), rep-max, volume, run distance, pace bucket ±5%. Only the **highest tier** fires. A first-ever exercise returns `baseline` instead of a PR. Output = rows ready for `pr_events`.
2. `src/core/progression.ts`: the D10 nudge ("+2.5 → 82.5"): RPE present, RPE absent, a gap of more than 14 days, Big jumps (+5 kg) for lower-body compounds.
3. `src/core/readiness.ts`: the D9 readiness score and the **Do MIN** plan (first 2 exercises of the last session × 2 sets at 90%).
4. `src/core/prefill.ts`: prefill sets from the last session of that exercise (extra sets copy the last set) and the next-exercise guess (fixtures from §2, ties per spec).
5. Add the missing e1RM cases from the DoD (r=1, 12, 13; bodyweight lifts with and without a logged bodyweight) to tests; edit `e1rm.ts` only if a case fails.

## Files you may touch
`src/core/prs.ts`, `src/core/progression.ts`, `src/core/readiness.ts`, `src/core/prefill.ts`, `src/core/e1rm.ts` (only if a DoD case fails), `tests/unit/core/**`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/core/weeks.ts`, `credits.ts`, `streak.ts`, `duel.ts`, `comeback.ts` (lane E), `src/data/**`, `src/features/**`.

## Acceptance
- [ ] Every DoD unit case from §6 Phase 2 is a named test.
- [ ] `src/core` line coverage ≥95% (print it).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P2B: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
