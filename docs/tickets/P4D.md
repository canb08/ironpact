# P4D · Sound (Web Audio) + iOS haptics flag
**Lane:** C (Can's Claude · Can's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P4D-sound` · **Starts after:** P2C merged

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §3.8 (sound and haptics), §1.6 D16, §6 Phase 4 sound bullet, §3.13 (⚠️ verify on device). P2C's `src/platform/haptics.ts`.

## Scope
1. `src/platform/audio.ts`: Web Audio **synth** (no files): clank, 3-2-1, bell, PR riser, ring chord. Off by default (`sound_on`). AudioContext unlocked on the first tap; `navigator.audioSession.type = 'playback'` when present (feature-detected).
2. Extend `src/platform/haptics.ts` with the iOS checkbox-switch trick **behind a flag, off** unless verified (record in `docs/PLATFORM-NOTES.md`).
3. A tiny `useSound()` hook other tickets call (`play('bell')`); no feature wiring here except a demo on `/dev/ui`.

## Files you may touch
`src/platform/audio.ts`, `src/platform/haptics.ts`, `src/ui/DevUi.tsx` (demo only), `tests/unit/platform/audio.test.ts`, `tests/unit/platform/haptics.test.ts`, `docs/PLATFORM-NOTES.md` (one section), `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/features/**`, `src/ui/*` other than DevUi.

## Acceptance
- [ ] Sound off by default; first-tap unlock; each sound callable (tests with a mocked AudioContext).
- **Phase 4 extra:** `motion`, `@number-flow/react`, `canvas-confetti` and fonts must stay **out of initial JS** (lazy chunks / `LazyMotion` per R1 item 8). Everything respects reduced motion (media query **or** the in-app toggle).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P4D: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
