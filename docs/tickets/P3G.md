# P3G · Playwright Phase 3 end-to-end
**Lane:** E (the friend's Claude · the friend's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P3G-playwright` · **Starts after:** P3E, P3F merged (and B8)

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §6 Phase 3 Definition of done + Demo script, §7.4. B8's `playwright.config.ts`.

## Scope
`tests/e2e/p3-*.spec.ts` (mock backend with the realtime mock bus, two browser contexts): B starts a session → A's Floor shows the presence banner; B logs a set → appears in A's Crew feed and B's ring segment fills; `?debug=week` → plate added; presence clears after 2 min (page clock).

## Files you may touch
`tests/e2e/p3-*.spec.ts`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/**` (missing `data-testid` → ask in the PR), `playwright.config.ts`, `ci.yml`.

## Acceptance
- [ ] CI `e2e` job green on both projects.

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P3G: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
