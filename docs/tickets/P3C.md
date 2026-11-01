# P3C · Core: the Bar, spots, fair comparison, comeback
**Lane:** E (Eytan's Claude · Eytan's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P3C-core` · **Starts after:** nothing (fire first)

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §2.2, §10 E2.1, §1.6 D5–D8, §2.8 (duo mechanics, fair comparison), §2 F16 (comeback), §7.1, §6 Phase 3 unit list. Existing `src/core/weeks.ts`, `credits.ts`.

## Scope
Pure functions + unit tests:
1. `src/core/streak.ts`: the Bar table (FULL/FULL +1, HELD/FULL 0, REST −1, REST spotted 0, never below 0), spot window + monthly limit, a local week-close preview (the server result wins).
2. `src/core/duel.ts`: relative % vs own trailing 4-week baseline, "Baseline building" state, rebasing to % of first value (partner trend line).
3. `src/core/comeback.ts`: ≥5 days with no credit → comeback state (no count of missed days).
4. Add only what's missing to `weeks.ts` / `credits.ts`, with the DoD cases: a set at 23:30 local on Sun 25 Oct 2026 → week starts Mon 19 Oct; the 2027-03-28 switch; credits MIN 0.5, cap 2.0/day.

## Files you may touch
`src/core/streak.ts`, `src/core/duel.ts`, `src/core/comeback.ts`, `src/core/weeks.ts` + `credits.ts` (additive only), `tests/unit/core/**`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/core/prs.ts`, `progression.ts`, `readiness.ts`, `prefill.ts`, `validate.ts` (lane C), `src/data/**`, `src/features/**`.

## Acceptance
- [ ] Every §6 Phase 3 unit case is a named test.
- [ ] `src/core` line coverage ≥95%.

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P3C: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
