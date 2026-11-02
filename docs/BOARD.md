# BOARD: who is doing what (claim before you fire)

Status: `todo` · `running` · `pr #n` · `merged` · `parked (why)`. Pull before editing; commit `BOARD: <ID> <status>`.

## Engines (4 coders + 2 Claude Leads) — Phase 2–3 lanes: see `docs/LANES.md`
| Engine | Account | Best at here |
|---|---|---|
| Codex (Sol High / Astra) | Can | screens with tricky state (B4, B6), e2e |
| Codex (Sol High / Astra) | friend | backend + sync (A6 finish, A7) |
| Grok (SuperGrok) | friend | independent config/research (R1, A8), then B3 |
| Grok (SuperGrok) | Can | independent PWA shell (B7), then B5 |
Grok runs tickets per `docs/GROK.md` (grok.com → model **Build** → GitHub connector works). Risky code (RLS, sync, export) stays on Codex.

## Phase 0–1 (walking skeleton)
| ID | What | Engine | Claimed by | Status |
|---|---|---|---|---|
| A1 | Scaffold + CI | Codex Sol | Can | merged #1 |
| C2 | Export formatter + goldens | Claude | Can's Claude | merged #2 |
| A2 | Schema, triggers, seed, DB CI | Codex Sol | friend | merged #5 |
| A3 | RLS, RPCs, security tests | Codex Astra | friend | merged #6 |
| B1 | Tokens, UI primitives, copy bank | Codex Sol | Can | merged #7 |
| C1 | Frozen contracts (types + Repo/Remote) | Claude | Can's Claude | merged (direct) |
| A5 | Edge Functions export + health | Codex Sol | friend | merged #8 |
| B2 | Pure core: validate, weeks, credits, e1RM | Codex Sol | Can | merged #9 |
| C3 | Frozen route table, placeholder screens, `useRepo()` | Claude | Can's Claude | merged (direct) |
| A6 | Offline data layer + mock backend | Codex **Astra** → fixes on Grok | friend | merged #10 |
| R1 | Verify ⚠️ platform facts (research) | Grok | friend | merged #11 |
| A8 | `_headers`, keepalive, deploy docs | Grok | friend | merged #12 |
| B7 | sw.ts, manifest, S1 install gate, storage persist | Codex Sol | Can | merged #13 |
| A7 | Supabase Remote + 20-set flight test + health DB read (L4) | Codex Sol | Can | merged #18 (Lead: 15 s request timeout) |
| B4 | S6 session + S7 exercise picker | Codex Sol | Can | merged #15 |
| B3 | S2 OTP sign-in, S3 crew + /join, App wiring + install bootstrap (L5) | Grok | friend | merged #14 |
| B5 | S11 quick logs + S4 Floor | Grok | Can | merged #16 (Lead: live queries) |
| B6 | S12 Crew + Settings → Vault export | Codex Sol | Can | merged #17 |
| B8 | Playwright p1 e2e + CI job | Grok | Can | pr #19 (Lead added CI e2e job; CI running) |
| G1 | Phase 1 gate: deploy, demo, checkpoint | Claude | — | todo (needs Supabase project + Cloudflare) |

## Phase 2–3 (two lanes, rules in `docs/LANES.md`)
| ID | What | Engine | Lane | Status |
|---|---|---|---|---|
| C6 | Router + copy anchors for Phase 2–3 | Claude | C | merged (direct) |
| P2A | Data contract: history, PR events, prefs, day, edits (L9) | Codex Astra | C | running 2026-11-02 |
| P2F | Server re-check of PR events (0007) | Codex Sol | C | running 2026-11-02 |
| P2B | Core: PRs, progression, readiness, prefill | Grok | C | running 2026-11-02 |
| P2C | Rest timer engine + Wake Lock + haptics | Grok | C | running 2026-11-02 |
| P2D | Session engine UI (prefill, nudge, timer, PR card, RACK IT, summary, readiness) | Codex Sol | C | todo — after P2A, P2B, P2C |
| P2E | S14 exercise detail + S15 day editor | Grok | C | todo — after P2A |
| P2G | Playwright Phase 2 | Grok | C | todo — after P2D, P2E |
| P3A | Realtime channel + week-close cron (0004/0005) | Codex Astra | E | running 2026-11-02 |
| P3C | Core: Bar, spots, fair comparison, comeback | Grok | E | running 2026-11-02 |
| P3D | Ring component | Grok | E | running 2026-11-02 |
| P3B | Duo data layer + realtime client (L10) | Codex Astra | E | todo — after P3A |
| P3E | Crew full + presence + Bar + comeback | Codex Sol | E | todo — after P3B, P3C, P3D |
| P3F | Progress S13: trend chart | Grok | E | todo — after P3C |
| P3G | Playwright Phase 3 | Grok | E | todo — after P3E, P3F |

## Phase 4–5 queue (fire order in `docs/LANES.md`)
| ID | What | Engine | Lane | Status |
|---|---|---|---|---|
| P4A | Design foundation: tokens, fonts, contrast (L1), textures | Grok | C | running 2026-11-02 01:05 |
| P5E | App shell: offline/server-asleep banners, SW update chip | Grok | C | running 2026-11-02 01:05 |
| P4D | Sound (Web Audio) + iOS haptics flag | Grok | C | todo — after P2C |
| P4B | Motion foundation + Tier-3 micro + moment queue | Codex Sol | C | todo — after P4A, P2D |
| P4C | PR takeover + partner shockwave hook | Codex Sol | C | todo — after P4B, P2D |
| P5B | S14 completed | Grok | C | todo — after P2E |
| P5C | S16 Settings full | Codex Sol | C | todo — after P2A, P5D |
| P4G | Playwright Phase 4 | Grok | C | todo — after P4C, P4E |
| P5D | Delete account function + 30-day purge (L11) | Codex Astra | E | todo — no deps |
| P4F | S1 install gate full + Floor install chip | Grok | E | todo — after P4A |
| P4E | Duo moments: ring close, Bar tier-up, flame, shockwave | Codex Sol | E | todo — after P4B, P3E |
| P5A | S13 Progress full | Grok | E | todo — after P3F |

## Parked / follow-ups
- C4 (Phase 2): exercise-muscle contract + picker grouping (L7).
- Light-theme contrast fixes (DECISIONS L1) → Phase 4 visual ticket.
- Size budget: initial JS = entry + modulepreloads; the data layer (Dexie, zod, sync, adapters) is lazy-loaded in `App.tsx` (C5) → initial **100.5 / 170 kB**. Keep screens and backend libraries out of the static import graph.
- Dependabot #3 (setup-node v7): rebase requested; merge with human OK.
- Keep-alive must touch the **database**, not just the `health` function (R1 #9: only DB/API activity is documented to stop the free-tier pause) → at G1 point `HEALTH_URL` at a PostgREST read (e.g. `/rest/v1/exercises?select=id&limit=1` with the anon `apikey` header) or make `health` run `select 1`.
- Email: **no custom SMTP** (L6). At G1: invite the friend to the Supabase organization so built-in mail reaches him.
- Installed iOS app does **not** share Safari storage or open at `/join/<CODE>` (R1 #5) → B3 must show the code big with Copy/Paste/typing.
