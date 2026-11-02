# P2E · S14 exercise detail + S15 day editor
**Lane:** C (the owner's Claude · the owner's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P2E-s14` · **Starts after:** P2A merged

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §2.4 S14, S15, §2.7 (validation), §2 F8 (delete/restore). P2A's `exerciseHistory`, `day`, `updateSession`, `updateEntry`, `setExercisePref`.

## Scope
1. `src/features/progress/ExerciseDetailScreen.tsx` (route `/exercise/:id`, already in the frozen router): history per session (sets, best e1RM as a number; the chart is P3F), rest-seconds default and Big jumps toggle (`setExercisePref`).
2. `src/features/progress/DayEditorScreen.tsx` (route `/day/:date`): every entry of that local day; edit any field **including the date** (moves the entry); soft delete + restore. Validation via `src/core/validate.ts`.
Entry links into these screens are added later by their owners; test via the routes.

## Files you may touch
`src/features/progress/**`, `tests/unit/features/progress/**`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/router.tsx`, `src/data/**`, `src/core/**`, other features.

## Acceptance
- [ ] Moving a run from one day to another shows it on the new day only (test).
- [ ] Out-of-range edits show the copy-bank error and don't save (test).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P2E: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
