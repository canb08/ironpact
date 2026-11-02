# P2D · Session engine: prefill, nudge, timer, PRs, RACK IT, summary, readiness
**Lane:** C (the owner's Claude · the owner's Codex + Grok) · **Model:** Grok · Build (moved from Codex: usage limit) · **Branch:** `P2D-session` · **Starts after:** P2A, P2B, P2C merged

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §2 F4, F5, F7, F8, F10, F11, F13; §2.4 S5, S6, S9 (static PR card), S10; §3.10.2 readiness rows; §6 Phase 2 + Demo script; §10 E7.x. The APIs from P2A (`exerciseHistory`, `recordPrEvents`, `exercisePref`), P2B (`core/prs`, `progression`, `readiness`, `prefill`), P2C (`useRestTimer`, `RestTimerOverlay`, `wakeLock`).

## Scope
Upgrade the existing S6 in `src/features/session/` (B4) to the Phase 2 engine:
1. Opens on the predicted next exercise with last session's numbers prefilled; an untouched prefilled set logs with **1 tap**.
2. Progression nudge chip "+2.5 → 82.5": tap applies, never automatic; Big jumps from `exercisePref`.
3. LOG SET starts the rest timer (`startRest`, remembered per exercise); the overlay is mounted on S6; Wake Lock requested on session start.
4. After each set: `core/prs` → `recordPrEvents` → static PR card (S9 plain, in `src/features/prs/`); first-ever exercise → "Baseline set" toast. Deleting the PR's set removes the card.
5. F8 timings: 8 s Undo on a new row; swipe-left soft delete + 5 s restore snackbar.
6. F10: per-set weights, warm-up flag, bodyweight-lift added load (0 or negative).
7. F11: session clock; **RACK IT** hold 600 ms → S10 summary (duration, tonnes, sets, PRs, one-line note); "Resume session (14 min)?" after a crash; a second session is blocked with "Finish or discard the open one".
8. F13: readiness sheet (S5) before the first set: **Do MIN** / **Full send**; it never blocks.

## Files you may touch
`src/features/session/**`, `src/features/prs/**`, `tests/unit/features/session/**`, `tests/unit/features/prs/**`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/features/timer/**`, `src/core/**`, `src/data/**` (import only), `src/features/floor/**` (lane E).

## Acceptance
- [ ] The §6 Phase 2 demo script works in a unit/integration test with the mock Repo (start → readiness → predicted exercise → 1-tap set → timer → PR card → delete → PR gone → RACK IT → summary).
- [ ] All workout targets in the bottom 40% are ≥64 px.

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P2D: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
