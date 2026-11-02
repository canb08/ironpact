# P4F · S1 install gate (full) + Floor install chip
**Lane:** E (the friend's Claude · the friend's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P4F-s1` · **Starts after:** P4A merged

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §2.4 S1, §6 Phase 4 S1 bullet, §10 E3.7, E3.8, `docs/research/R1-platform.md` items 5 + 7. B7's `src/platform/install.ts` + `InstallGate.tsx`.

## Scope
1. `src/features/install/InstallGate.tsx`: animated Share → Add to Home Screen walkthrough (iOS), the Android `beforeinstallprompt` button, "Open this in Safari / Chrome" for unsupported browsers. Static under reduced motion.
2. Floor chip "Install to keep your data safe" when the gate was skipped (in `src/features/floor/`, lane E).
3. Dark iOS startup images + Apple head metadata (L5 deferred this here): `index.html` meta + generated images in `public/icons/`.

## Files you may touch
`src/features/install/**`, `src/features/floor/**` (the chip only), `index.html` (Apple meta only), `public/icons/**`, `tests/unit/platform/InstallGate.test.tsx`, `tests/unit/features/floor/**`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/platform/install.ts` (import only), `src/features/session/**`.

## Acceptance
- [ ] Walkthrough per platform + chip behaviour tested; reduced motion static.
- **Phase 4 extra:** `motion`, `@number-flow/react`, `canvas-confetti` and fonts must stay **out of initial JS** (lazy chunks / `LazyMotion` per R1 item 8). Everything respects reduced motion (media query **or** the in-app toggle).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P4F: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
