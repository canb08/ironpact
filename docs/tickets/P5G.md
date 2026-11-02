# P5G · S6 fits 375 px (kg/reps overflow)
**Lane:** C (the owner's Claude · the owner's Codex + Grok) · **Model:** Codex · GPT-6.1 Sol, High · **Branch:** `P5G-work` · **Starts after:** nothing

## Read first
`AGENTS.md`. `docs/SPEC.md` §3.11 (one-hand use), §6 Phase 5 DoD (every screen at 375 px and 200% text, no horizontal scroll). Reported by the friend's Lead on the board: on `/session` after choosing an exercise, at 375 px wide the kg and reps inputs overflow the right edge.

## Scope
1. Reproduce at 375×812 (mock backend): pick Bench press, check `document.documentElement.scrollWidth <= clientWidth`; list the overflowing elements.
2. Fix in `src/features/session/session.css` (likely the absolutely positioned stepper labels at `inset-inline-start: 80px` with no end bound, or grid items without `min-width: 0`). Keep all workout targets ≥64 px.
3. Add `tests/e2e/p5-session-375.spec.ts`: log one set at 375 px and 200% text (CSS zoom), assert no horizontal scroll and LOG SET / RACK IT visible.

## Files you may touch
`src/features/session/session.css`, `src/features/session/LoggingCard.tsx` (markup only if CSS can't fix it), `tests/e2e/p5-session-375.spec.ts`.

## Acceptance
- [ ] New e2e spec green on both projects; no horizontal scroll at 375 px and 200% text.
