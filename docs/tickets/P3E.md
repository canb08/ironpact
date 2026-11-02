# P3E · Crew full + presence banner + the Bar + comeback
**Lane:** E (Eytan's Claude · Eytan's Codex + Grok) · **Model:** ~~Codex · GPT-6.1 Sol, High~~ → **Grok · Build** (friend's Codex weekly limit used up 2026-11-02; UI-only ticket, allowed on Grok per CLAUDE.md §2) · **Branch:** `P3E-crew` · **Starts after:** P3B, P3C, P3D merged

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §2.4 S4, S12 (full), §2 F14–F16, §2.8, §6 Phase 3 + Demo script, §3.10.1 strings. P3B `repo.duo`, P3C core, P3D `Ring`.

## Scope
1. S12 Crew (full) in `src/features/crew-feed/`: partner card with Ring, neutral status ("Last trained 2 d ago"), live feed (plain insert on `onCrewChange`), "Together" block, empty state "Crew of one. Send the code:", fair comparison as relative % (raw partner kg one tap deep, never side by side on the front page), partner left → ring and Bar frozen/archived.
2. Floor (`src/features/floor/`): personal + co-op Ring, the Bar value, presence banner "[name] is training · Bench · set 3 · 14 min" (hidden 2 min after last activity), comeback prompt "Welcome back. MIN today?" with **20-min session** / **Just log MIN**, "Bar adjusted after edit" notice.
3. Test-only `?debug=week` override (dev/mock builds only) to simulate a week close.

## Files you may touch
`src/features/crew-feed/**`, `src/features/floor/**`, `src/features/duo/**`, `tests/unit/features/crew-feed/**`, `tests/unit/features/floor/**`, `tests/unit/features/duo/**`, `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/features/session/**`, `src/features/timer/**`, `src/features/progress/**` (lane C), `src/data/**`, `src/core/**`.

## Acceptance
- [ ] Phase 3 demo script works on the mock backend in a test (presence banner, live feed insert, ring fill, `?debug=week` plate).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P3E: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
