# P2G · Playwright Phase 2 end-to-end
**Lane:** C (Can's Claude · Can's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P2G-playwright` · **Starts after:** P2D, P2E merged (and B8)

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §6 Phase 2 Definition of done + Demo script, §7.4. B8's `playwright.config.ts`.

## Scope
`tests/e2e/p2-*.spec.ts` (mock backend, both projects):
1. Log 3 sets using taps only inside the bottom 40% of the viewport → timer starts → `page.clock` fast-forward → flash element visible at 0 → "+0:05 over" 5 s later.
2. Background 60 s mid-timer (page clock) → correct remaining time on return.
3. Heavier set → PR card → delete the set → PR gone.

## Files you may touch
`tests/e2e/p2-*.spec.ts`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/**` (missing `data-testid` → ask in the PR), `playwright.config.ts`, `ci.yml`.

## Acceptance
- [ ] CI `e2e` job green on both projects.

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P2G: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
