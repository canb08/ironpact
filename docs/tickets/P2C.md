# P2C · Rest timer engine + Wake Lock + haptics
**Lane:** C (Can's Claude · Can's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P2C-rest` · **Starts after:** nothing (fire first)

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §2 F6, §2.4 S8, §3.9.5 (plain version only), §4.7 (device APIs), §1.6 D16 (Android vibrate), §10 E7.1. `docs/research/R1-platform.md` item 6 (Wake Lock works on iOS ≥18.4).

## Scope
1. `src/features/timer/restTimer.ts`: pure, `ends_at`-based state: `start(now, seconds)`, `adjust(±15)`, `skip()`, `remaining(now)`, `overBy(now)` (counts up after zero). Defaults 120 s compound / 90 s isolation; the caller passes the remembered per-exercise value.
2. `src/features/timer/useRestTimer.ts`: hook + tiny module store, so one timer survives route changes. `ends_at` is persisted to `localStorage` (crash/background safe). API: `startRest(exerciseId, seconds)`, `adjust`, `skip`, `state`.
3. `src/features/timer/RestTimerOverlay.tsx` (S8, plain): header chip `1:32` / `+0:12 over`, ±15 s, Skip, `aria-live` announcement at 10 s and at 0, **one** 300 ms visual pulse at 0 (disabled under reduced motion), no sound.
4. `src/platform/wakeLock.ts`: request on session start, timer start and `visibilitychange → visible`; muted 1 s looping-video fallback when the API is missing or fails; exposes `screenMaySleep` for the "Screen may sleep" chip.
5. `src/platform/haptics.ts`: Android vibrate per D16, no-op elsewhere or when `haptics_on` is false.
The session screen mounts the overlay and calls `startRest` in **P2D**. Document the API at the top of `useRestTimer.ts`.

## Files you may touch
`src/features/timer/**`, `src/platform/wakeLock.ts`, `src/platform/haptics.ts`, `src/assets/keepawake.mp4` (silent, ≤20 KB), `tests/unit/timer/**`, `tests/unit/platform/wakeLock.test.ts`, `tests/unit/platform/haptics.test.ts`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/features/session/**` (P2D), `src/data/**`, `src/core/**`.

## Acceptance
- [ ] Background for 60 s mid-timer → correct remaining time from `ends_at` (fake clock test).
- [ ] `+0:05 over` five seconds after zero (test).
- [ ] Wake Lock: API missing / rejected / released each lead to the fallback + `screenMaySleep` (tests).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P2C: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
