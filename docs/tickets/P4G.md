# P4G · Playwright Phase 4
**Lane:** C (Can's Claude · Can's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P4G-playwright` · **Starts after:** P4C and P4E merged

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §6 Phase 4 Definition of done + Demo script, §7.4, §7.6 (CLS).

## Scope
`tests/e2e/p4-*.spec.ts`: (1) `reducedMotion: 'reduce'` → a PR shows the static card and no `<canvas>`; (2) no flashes faster than 3/s on the timer-zero and PR sequences; (3) PR takeover → Back to work → timer still counting; (4) partner shockwave plays once across two opens (two contexts); (5) CLS ≤0.05 on Floor and Session (PerformanceObserver).

## Files you may touch
`tests/e2e/p4-*.spec.ts`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/**` (missing `data-testid` → ask in the PR), `playwright.config.ts`, `ci.yml`.

## Acceptance
- [ ] CI `e2e` green on both projects.

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P4G: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
