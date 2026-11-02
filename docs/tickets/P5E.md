# P5E · App shell: offline + server-asleep banners, SW update chip
**Lane:** C (the owner's Claude · the owner's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P5E-app` · **Starts after:** nothing (fire when a lane C Grok is free)

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §6 Phase 5 (banners, SW update chip), §3.10.1 strings, §4.7 (SW update flow, `SKIP_WAITING`). `repo.sync.status()` (`offline`, `server_asleep`).

## Scope
1. `src/app/StatusBanners.tsx`: "Saved on your phone. Syncs when you're back up." while offline; "Server asleep — data safe on phone" on `server_asleep`.
2. `src/app/UpdateChip.tsx`: a new SW is waiting → "Update" chip that posts `SKIP_WAITING` and reloads; **suppressed while a session is open**.
3. Mount both in `src/App.tsx` (inside `AppShell`).

## Files you may touch
`src/app/StatusBanners.tsx`, `src/app/UpdateChip.tsx`, `src/App.tsx` (mount lines only), `tests/unit/app/**`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/sw.ts`, `src/data/**`, `src/features/**`.

## Acceptance
- [ ] Banner states + chip suppression during an open session (tests).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P5E: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
