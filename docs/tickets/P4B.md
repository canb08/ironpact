# P4B · Motion foundation + Tier-3 micro + moment queue
**Lane:** C (Can's Claude · Can's Codex + Grok) · **Model:** Codex · GPT-6.1 Sol, High · **Branch:** `P4B-motion` · **Starts after:** P4A and P2D merged

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §3.7 (motion tokens, moment hierarchy, reduced motion), §3.9.9, §3.10.1 ("Locked in."), §6 Phase 4 (Tier 3, "one Tier-1 per screen open, 400 ms gap, PR first"). R1 item 8 (`LazyMotion`, `motion/react-m`).

## Scope
1. `src/ui/motion/`: lazy `MotionProvider` (`LazyMotion` + `domAnimation`), the UI / SLAM / HEAVY spring tokens, `useReducedMotion()` (media query **or** profile `reduce_motion`), feature-detected View Transitions helper, lazy `NumberFlow` wrapper.
2. `src/ui/moments/queue.ts` + `MomentHost.tsx`: one Tier-1 per screen open, queued with a 400 ms gap, PR first; Tier-2 runs inline. Moments register by id; lane E's ring close and Bar tier-up use the same queue later.
3. Tier 3 micro on set logged (0.96 → 1 scale, 4 px plate drop, `wdth` flex), "Locked in." toast. Wire it in `src/features/session/` with a single hook call.
4. Flash-rate guard: a helper that asserts no more than 3 flashes per second (used by P4G).

## Files you may touch
`src/ui/motion/**`, `src/ui/moments/**`, `src/ui/index.ts` (export lines), `src/features/session/**` (the micro hook only), `tests/unit/ui/motion/**`, `tests/unit/ui/moments/**`, `package.json` + lock (`motion`, `@number-flow/react` only), `docs/STACK.md`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/ui/Ring.tsx`, `src/features/duo/**`, `src/features/floor/**` (lane E), `src/data/**`.

## Acceptance
- [ ] Queue test: two Tier-1 moments → PR first, second 400 ms later; one per screen open.
- [ ] Reduced motion → every motion component renders static (test).
- [ ] Initial JS unchanged ±2 kB (print).
- **Phase 4 extra:** `motion`, `@number-flow/react`, `canvas-confetti` and fonts must stay **out of initial JS** (lazy chunks / `LazyMotion` per R1 item 8). Everything respects reduced motion (media query **or** the in-app toggle).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P4B: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
