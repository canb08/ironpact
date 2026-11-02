# BOARD: who is doing what (claim before you fire)

Status: `todo` · `running` · `pr #n` · `merged` · `parked (why)`. Pull before editing; commit `BOARD: <ID> <status>`.

## Engines (4 coders + 2 Claude Leads) — Phase 2–3 lanes: see `docs/LANES.md`
| Engine | Account | Best at here |
|---|---|---|
| Codex (Sol High / Astra) | owner | screens with tricky state (B4, B6), e2e |
| Codex (Sol High / Astra) | friend | backend + sync (A6 finish, A7) |
| Grok (SuperGrok) | friend | independent config/research (R1, A8), then B3 |
| Grok (SuperGrok) | owner | independent PWA shell (B7), then B5 |
Grok runs tickets per `docs/GROK.md` (grok.com → model **Build** → GitHub connector works). Risky code (RLS, sync, export) stays on Codex.

## Phase 0–1 (walking skeleton)
| ID | What | Engine | Claimed by | Status |
|---|---|---|---|---|
| A1 | Scaffold + CI | Codex Sol | owner | merged #1 |
| C2 | Export formatter + goldens | Claude | the owner's Claude | merged #2 |
| A2 | Schema, triggers, seed, DB CI | Codex Sol | friend | merged #5 |
| A3 | RLS, RPCs, security tests | Codex Astra | friend | merged #6 |
| B1 | Tokens, UI primitives, copy bank | Codex Sol | owner | merged #7 |
| C1 | Frozen contracts (types + Repo/Remote) | Claude | the owner's Claude | merged (direct) |
| A5 | Edge Functions export + health | Codex Sol | friend | merged #8 |
| B2 | Pure core: validate, weeks, credits, e1RM | Codex Sol | owner | merged #9 |
| C3 | Frozen route table, placeholder screens, `useRepo()` | Claude | the owner's Claude | merged (direct) |
| A6 | Offline data layer + mock backend | Codex **Astra** → fixes on Grok | friend | merged #10 |
| R1 | Verify ⚠️ platform facts (research) | Grok | friend | merged #11 |
| A8 | `_headers`, keepalive, deploy docs | Grok | friend | merged #12 |
| B7 | sw.ts, manifest, S1 install gate, storage persist | Codex Sol | owner | merged #13 |
| A7 | Supabase Remote + 20-set flight test + health DB read (L4) | Codex Sol | owner | merged #18 (Lead: 15 s request timeout) |
| B4 | S6 session + S7 exercise picker | Codex Sol | owner | merged #15 |
| B3 | S2 OTP sign-in, S3 crew + /join, App wiring + install bootstrap (L5) | Grok | friend | merged #14 |
| B5 | S11 quick logs + S4 Floor | Grok | owner | merged #16 (Lead: live queries) |
| B6 | S12 Crew + Settings → Vault export | Codex Sol | owner | merged #17 |
| B8 | Playwright p1 e2e + CI job | Grok | owner | merged #19 |
| G1 | Phase 1 gate: deploy, demo, checkpoint | Claude | — | todo (needs Supabase project + Cloudflare) |

## Phase 2–3 (two lanes, rules in `docs/LANES.md`)
| ID | What | Engine | Lane | Status |
|---|---|---|---|---|
| C6 | Router + copy anchors for Phase 2–3 | Claude | C | merged (direct) |
| P2A | Data contract: history, PR events, prefs, day, edits (L9) | Grok | C | merged #25 |
| P2F | Server re-check of PR events (0007) | Grok | C | merged #31 |
| P2B | Core: PRs, progression, readiness, prefill | Grok | C | merged #21 |
| P2C | Rest timer engine + Wake Lock + haptics | Grok | C | merged #20 |
| P2D | Session engine UI (prefill, nudge, timer, PR card, RACK IT, summary, readiness) | Grok | C | merged #30 (Lead: RACK IT during rest) |
| P2E | S14 exercise detail + S15 day editor | Grok | C | merged #26 |
| P2G | Playwright Phase 2 | Grok | C | merged #41 |
| P3A | Realtime channel + week-close cron (0004/0005) | Codex Astra | E | merged #28 |
| P3C | Core: Bar, spots, fair comparison, comeback | Grok | E | merged #27 |
| P3D | Ring component | Grok | E | merged #29 |
| P3B | Duo data layer + realtime client (L10) | Codex Astra | E | merged #34 (Lead approved mockRepo.ts scope; CI p90 353 ms) |
| P3E | Crew full + presence + Bar + comeback | Grok (friend's Codex out of usage) | E | merged #39 |
| P3F | Progress S13: trend chart | Grok | E | merged #33 |
| P3G | Playwright Phase 3 | Grok | E | pr #49 (one e2e spec, in scope; CI e2e is the proof; PR opened by Lead) |
| P3H | Shared credit fixtures: SQL `week_credits` ↔ TS `credits.ts` parity (E5.7, L12) — **new ticket, test-only, no `src/**` or migrations** | Grok | E | merged #36 (24 fixtures, Vitest + pgTAP; PR-run db red = port-in-use flake, push-run db green) |

## Phase 4–5 queue (fire order in `docs/LANES.md`)
| ID | What | Engine | Lane | Status |
|---|---|---|---|---|
| P4A | Design foundation: tokens, fonts, contrast (L1), textures | Grok | C | merged #23 |
| P5E | App shell: offline/server-asleep banners, SW update chip | Grok | C | merged #22 (Lead: banner overlay fix) |
| P4D | Sound (Web Audio) + iOS haptics flag | Grok | C | merged #24 |
| P4B | Motion foundation + Tier-3 micro + moment queue | Grok | C | merged #40 |
| P4C | PR takeover + partner shockwave hook | Grok | **E** (moved: owner's Grok ~95% weekly; nothing pushed — start fresh from main) | running 2026-11-02 (friend's Grok, fresh from main) |
| P5B | S14 completed | Grok | C | merged #38 |
| P5C | S16 Settings full | Grok | C | merged #42 |
| P4G | Playwright Phase 4 | Grok | **E** (moved from C to balance lanes, 2026-11-02) | todo — after P4C, P4E |
| P5D | Delete account function + 30-day purge (L11) | Codex Astra | **C** (the owner's Codex took it: lane C idle, P5C needs it; the owner's Claude reviews + merges) | merged #32 |
| P4F | S1 install gate full + Floor install chip | Grok | **C** (the owner's Grok took it while idle; the owner's Claude reviews + merges) | merged #35 (Lead: kept "Continue in browser") |
| P4E | Duo moments: ring close, Bar tier-up, flame, shockwave | Grok (friend's Codex out of usage) | E | merged #46 |
| P5F | Recompute PRs after an edit + edit notices (L13) | Codex Astra | C (back from E) | running 2026-11-02 05:12 on owner's Codex (continue PR #44, branch P5F-work) |
| P5G | S6 fits 375 px (kg/reps overflow, reported by friend's Lead) | Codex Sol | C | running 2026-11-02 05:12 |
| P5A | S13 Progress full | Grok | **C** (the owner's Grok took it while idle; the owner's Claude reviews + merges) | merged #37 |

## Phase 6 hardening (pre-deploy part; G1 deploy + phone session need the owner)
| ID | What | Engine | Lane | Status |
|---|---|---|---|---|
| H1 | Accessibility pass (axe, 375 px/200%, target sizes) | Grok | **E** (moved: the owner's Grok at 90% weekly) | pr open (13 findings as named fixme, in Parked; PR opened by Lead) |
| H2 | Lighthouse CI on the production build | Grok | **E** (moved: the owner's Grok at 90% weekly) | pr #47 (CI job report-only per L14; findings in Parked) |
| H3 | Security checklist audit (§4) + missing pgTAP | Grok | **E** (moved: the owner's Grok at 90% weekly) | pr #48 (pgTAP read in full; gaps G1-G7 in Parked; PR opened by Lead) |
| H4 | Device test checklist (docs/DEVICE-TEST.md) | Grok | C | merged #45 |

## Parked / follow-ups
- **H2 performance findings (L14):** LCP ~3.8 s on slow 4G (budget 2 s); `/settings` layout shift 0.799 (budget 0.05, a real bug); lhci measures `/install` for every URL until the mock gets an install-dismissed + signed-in seed. One perf ticket: fix seed + LCP + settings CLS, then make the `lighthouse` job blocking.
- **H1 accessibility findings (13, listed as `test.fixme` in `tests/e2e/p6-a11y.spec.ts` with file:line once H1 merges):** session steppers overflow at 375 px / 200% text on S5/S6/S8/S9 (`session.css:22-26`, same as the earlier lane C note) and S14 heading (`progress.css:18`); S6 tab order vs visual order (Warm-up wraps into RPE row, `LoggingCard.tsx:125-132`); RACK IT hold button aria-label doesn't contain the visible text (`LoggingCard.tsx:137`); set list scroll region not keyboard-focusable (`SetList.tsx:26`); prohibited `aria-label` on a span (S15 `DayEditorScreen.tsx:111`) and a pre (S16 `VaultExport.tsx:145`). Mostly lane C screens: one small UI fix ticket, then delete each fixme as it passes.
- **P5F → Can's Codex (diagnosis by friend's Claude, 2026-11-02):** (1) Scope: `aadb337` rewrote the sync core (`src/data/outbox.ts` prelude/gen chaining, `src/data/sync.ts` send ordering, `src/data/db.ts` OutboxEntry fields), none of which P5F's allowlist permits, and CI still fails both `P5F ...` cases. Recommend reverting `aadb337`. (2) Cause: 0007's `unchanged_tombstone` only applies on **UPDATE**. When a PR claim was never acknowledged by the server and its set is edited offline, `enqueue` coalesces claim + tombstone into one payload, so the server sees an **INSERT** of a deleted claim → falls through to the value check → `pr_value_mismatch` / `pr_source_deleted`. (3) Smaller fix, `repo.ts` only: in `recomputePrs`, if a stale claim still has a pending outbox entry that the server never acknowledged (not in the pulled mirror), **drop that outbox entry and delete the local row** instead of enqueuing a tombstone. Claims the server already has get a tombstone that changes only `deleted_at` (passes 0007 before the source check). New claims go in the same batch as the edited source; `SYNCED_TABLES` order already sends `sets`/`cardio_entries` before `pr_events`. Read `src/data/**` in full on review.
- **H3 security gaps (from `docs/SECURITY-AUDIT.md` once H3 merges; none is an open write today):** G1 `send_nudge`, G2 `settle_challenge`, G3 `save_push_subscription`, G4 `mark_seen` RPCs missing (G4: owners can still edit `pr_events.seen_by`); G5 CSP `connect-src` is `*.supabase.co`, `scripts/gen-headers.mjs` (E3.6) never written; G6 `push-dispatch` / `rest-alarm` have `verify_jwt = false` but no handler; G7 default privileges may grant client roles on future tables. **Needs tickets before G1 deploy; migrations/RLS → Codex Astra, not Grok.** Owner: whichever Lead has a free Codex first (friend's Codex is out until ~2026-11-08).
- C4 (Phase 2): exercise-muscle contract + picker grouping (L7).
- Light-theme contrast fixes (DECISIONS L1) → Phase 4 visual ticket.
- Size budget: initial JS = entry + modulepreloads; the data layer (Dexie, zod, sync, adapters) is lazy-loaded in `App.tsx` (C5) → initial **100.5 / 170 kB**. Keep screens and backend libraries out of the static import graph.
- Dependabot #3 (setup-node v7): rebase requested; merge with human OK.
- Keep-alive must touch the **database**, not just the `health` function (R1 #9: only DB/API activity is documented to stop the free-tier pause) → at G1 point `HEALTH_URL` at a PostgREST read (e.g. `/rest/v1/exercises?select=id&limit=1` with the anon `apikey` header) or make `health` run `select 1`.
- Email: **no custom SMTP** (L6). At G1: invite the friend to the Supabase organization so built-in mail reaches him.
- Installed iOS app does **not** share Safari storage or open at `/join/<CODE>` (R1 #5) → B3 must show the code big with Copy/Paste/typing.
