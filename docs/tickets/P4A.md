# P4A · Design foundation: tokens, fonts, contrast, textures
**Lane:** C (the owner's Claude · the owner's Codex + Grok) · **Model:** Grok · Build · **Branch:** `P4A-design` · **Starts after:** nothing (fire when a lane C Grok is free)

## Read first
`AGENTS.md`, `docs/LANES.md`. `docs/SPEC.md` §3.0–§3.6, §3.12, §1.6 D17, §10 E7.x, `docs/DECISIONS.md` **L1** (light-theme contrast fix belongs here). `docs/research/R1-platform.md` item 8 (`@fontsource-variable/big-shoulders@5.3.0` has `opsz`). B1's `tokens.css` + `tests/unit/ui/tokens.contrast.test.tsx` (5 `it.fails` cases document L1).

## Scope
1. `src/ui/tokens.css`: full §3.2 oklch tokens (converted with `culori`), type scale (§3.3), spacing/radius/elevation (§3.5), brushed-steel edge class (max 4 on screen), glass utility (nav + timer only, ≤2 blur layers), knurl hatch class for RACK IT.
2. Fonts: Big Shoulders (opsz), Inter Tight, JetBrains Mono via `@fontsource-variable/*`, self-hosted, `font-display: swap`, precached by the SW, **≤220 KB total** (the size config already checks this). Anybody stays off unless D17 says otherwise.
3. Grain: `src/assets/grain-256.png` ≤12 KB, baked at build, never animated; off under battery saver.
4. **L1:** darken the light-theme molten/Iron/Steel/Titanium variants until the contrast test passes; turn B1's five `it.fails` into passing tests.
5. Icons: `lucide-react` (tree-shaken) + ~10 custom glyphs in `src/ui/icons/`.
Restyle only through tokens/classes. Don't change component APIs or behaviour.

## Files you may touch
`src/ui/tokens.css`, `src/ui/icons/**`, `src/ui/*.tsx` (styling only, not `Ring.tsx`), `src/assets/grain-256.png`, `src/main.tsx` (font imports only), `tests/unit/ui/tokens.contrast.test.tsx`, `package.json` + lock (fontsource, culori, lucide-react only), `docs/STACK.md`, `docs/DECISIONS.md` (close L1 in one line), `src/ui/copy.ts` (your anchor only).
**Do not touch:** `src/ui/Ring.tsx` (lane E), `src/features/**`, `src/data/**`.

## Acceptance
- [ ] Contrast test fully green in dark **and** light (text ≥4.5:1, large numbers/controls ≥3:1), no `it.fails` left.
- [ ] Fonts ≤220 KB, initial JS ≤170 KB (print both).
- [ ] `/dev/ui` screenshot or description at 375 px, dark + light.
- **Phase 4 extra:** `motion`, `@number-flow/react`, `canvas-confetti` and fonts must stay **out of initial JS** (lazy chunks / `LazyMotion` per R1 item 8). Everything respects reduced motion (media query **or** the in-app toggle).

## Rules for every Phase 2–3 ticket
- Branch from the **latest `main`**. One PR. Touch only the files listed. Need another file or a contract change → `## Contract change request` in the PR, don't do it.
- UI strings: add them in `src/ui/copy.ts` **directly under your anchor** `// ── P4A: …` and nowhere else. Never edit another ticket's block.
- Plain UI only (tokens + `src/ui` primitives). No motion, sound, textures before Phase 4 (§1.5).
- Initial JS stays ≤170 kB gzip (`npm run size`); new screens are lazy routes, new libraries only inside lazy chunks.
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run build && npm run size` green. PR body = the acceptance list ticked with proof, then `## Not done` and `## Questions` (if any).
