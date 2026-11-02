# P5C · S16 Settings full
**Lane:** C (Can's Claude · Can's Codex + Grok) · **Model:** Codex · GPT-6.1 Sol, High · **Branch:** `P5C-s16` · **Starts after:** P2A and P5D merged

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §2.4 S16, §6 Phase 5 Settings bullets, §3.11. B6's `SettingsScreen.tsx` + Vault export (keep it unchanged).

## Scope
Complete `src/features/settings/`: profile (name, target, colour from free hues, units greyed kg), plate inventory, rest defaults, sound / haptics / reduce motion / battery saver toggles (battery saver turns off grain and 3D), notification toggles (saved only, wired in Phase 7), share bodyweight (off) + share DOTS (off), crew invite + leave crew, sign out, **delete my account** (hold to confirm, then type "DELETE"; calls P5D's function), dead-letter list "1 entry couldn't sync" with retry / discard (`repo.sync`).

## Files you may touch
`src/features/settings/**`, `tests/unit/features/settings/**`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/features/export/**` (import only), `supabase/**` (P5D), `src/data/**`.

## Acceptance
- [ ] Each toggle persists through `upsertMyProfile` (tests).
- [ ] Delete needs the hold **and** typing DELETE (test).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P5C: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
