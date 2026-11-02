# P4C · PR takeover (Tier 1) + partner PR shockwave hook
**Lane:** C (Can's Claude · Can's Codex + Grok) · **Model:** Codex · GPT-6.1 Sol, High · **Branch:** `P4C-pr` · **Starts after:** P4B merged and P2D merged

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §3.9.4 (PR takeover), §2 F7, §3.7.2, §6 Phase 4 Tier 1 + Tier 2 (shockwave uses `pr_events.seen_by`), Demo script.

## Scope
1. `src/features/prs/Takeover.tsx`: full-screen PR takeover per §3.9.4 via the P4B moment queue; ≤120 particles with lazy `canvas-confetti`; tap to skip; "Back to work" / "Share" (stub). The rest timer keeps counting underneath.
2. Reduced motion → the static PR card (P2D) and **no `<canvas>`**.
3. Partner PR shockwave data hook `usePartnerPrShockwave()` in `src/features/prs/`: returns unseen partner PRs once and marks them seen (`pr_events.seen_by`, through a Repo write; ask in the PR if P2A has none). Lane E renders it on Crew/Floor (P4E).

## Files you may touch
`src/features/prs/**`, `tests/unit/features/prs/**`, `package.json` + lock (`canvas-confetti` only), `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/features/session/**` (P2D owns it; mount via the moment queue), `src/features/duo/**`, `src/features/floor/**`, `src/data/**`.

## Acceptance
- [ ] Demo script part 1 in a test: heavier set → takeover → Back to work → timer still counting.
- [ ] Reduced motion → no canvas (test).
- [ ] ≤3 flashes/s on the PR sequence (P4B guard).
- **Phase 4 extra:** `motion`, `@number-flow/react`, `canvas-confetti` and fonts must stay **out of initial JS** (lazy chunks / `LazyMotion` per R1 item 8). Everything respects reduced motion (media query **or** the in-app toggle).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P4C: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
