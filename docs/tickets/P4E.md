# P4E · Duo moments: ring close, Bar tier-up, forge flame, shockwave, segment fill
**Lane:** E (Eytan's Claude · Eytan's Codex + Grok) · **Model:** ~~Codex · GPT-6.1 Sol, High~~ → **Grok · Build** (friend's Codex weekly limit used up 2026-11-02; UI/motion only, allowed on Grok per CLAUDE.md §2) · **Branch:** `P4E-duo` · **Starts after:** P4B merged and P3E merged

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §3.9.1 (ring close), §3.9.2 (the Bar + forge flame, D7), §3.7.2, §6 Phase 4 Tier 1/Tier 2 bullets. P4B's motion + moment queue, P4C's `usePartnerPrShockwave()`.

## Scope
1. `src/features/duo/RingClose.tsx`: co-op ring close (Tier 1, via the moment queue). Own segment fill (Tier 2). MIN logged moment with "MIN day. Still counts. Chain's alive.".
2. The Bar tier-up (Tier 1) + forge flame (D7): breath animation paused offscreen and under reduced motion.
3. Partner PR shockwave (Tier 2) on Floor/Crew from P4C's hook: plays once, never again on the next open.
4. Ring motion lives in `src/ui/Ring.tsx` (lane E owns it).

## Files you may touch
`src/features/duo/**`, `src/features/floor/**`, `src/features/crew-feed/**`, `src/ui/Ring.tsx`, `tests/unit/features/duo/**`, `tests/unit/features/floor/**`, `tests/unit/ui/Ring.test.tsx`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/ui/motion/**`, `src/ui/moments/**` (import only), `src/features/prs/**`, `src/features/session/**` (lane C).

## Acceptance
- [ ] Shockwave plays once and not on the next open (test).
- [ ] Reduced motion → static ring/flame, no canvas (test).
- **Phase 4 extra:** `motion`, `@number-flow/react`, `canvas-confetti` and fonts must stay **out of initial JS** (lazy chunks / `LazyMotion` per R1 item 8). Everything respects reduced motion (media query **or** the in-app toggle).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P4E: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
