# P3D · Ring component (personal + co-op)
**Lane:** E (Eytan's Claude · Eytan's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P3D-ring` · **Starts after:** nothing (fire first)

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §2 F14, §3.9.1 (build only the plain geometry now; motion/texture is Phase 4), §3.2.2 (member colours), §3.11, §6 Phase 3 DoD (3 members).

## Scope
`src/ui/Ring.tsx`: SVG ring with N members × weekly target segments; a MIN is half thickness; the second member hatched; each member one contiguous arc; capacity = members × target (3 members works). Accessible text label ("2 of 3 · partner 1 of 3"). Add it to `src/ui/index.ts` and a demo to `src/ui/DevUi.tsx`.

## Files you may touch
`src/ui/Ring.tsx`, `src/ui/index.ts` (one export line), `src/ui/DevUi.tsx` (demo only), `tests/unit/ui/Ring.test.tsx`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** other `src/ui/*` primitives, `tokens.css`, `src/features/**`.

## Acceptance
- [ ] Tests: 1, 2 and 3 members; MIN half thickness; contiguous arcs; label text.

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P3D: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
