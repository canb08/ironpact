# BOARD: who is doing what (claim before you fire)

Status: `todo` · `running` · `pr #n` · `merged` · `parked (why)`. Pull before editing; commit `BOARD: <ID> <status>`.

## Engines (4 coders + 2 Claude Leads)
| Engine | Account | Best at here |
|---|---|---|
| Codex (Sol High / Astra) | Can | screens with tricky state (B4, B6), e2e |
| Codex (Sol High / Astra) | friend | backend + sync (A6 finish, A7) |
| Grok (SuperGrok) | friend | independent config/research (R1, A8), then B3 |
| Grok (SuperGrok) | Can | independent PWA shell (B7), then B5 |
Grok runs tickets per `docs/GROK.md`. Risky code (RLS, sync, export) stays on Codex.

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
| A6 | Offline data layer + mock backend | Codex **Astra** | friend | pr #10 (draft: fix startup-latency item, then ready) |
| R1 | Verify ⚠️ platform facts (research) | Grok | friend | running (done in chat; push as PR) |
| A8 | `_headers`, keepalive, deploy docs | Grok | friend | todo (next after R1) |
| B7 | sw.ts, manifest, S1 install gate, storage persist | Grok | Can | todo (fire when Can's Grok is set up) |
| A7 | Supabase Remote + 20-set flight test | Codex Sol | friend | todo (after A6 merged) |
| B4 | S6 session + S7 exercise picker | Codex Sol | Can | todo (after A6 merged) |
| B3 | S2 OTP sign-in, S3 crew + /join, App wiring | Grok | friend | todo (after A6 merged + A8) |
| B5 | S11 quick logs + S4 Floor | Grok | Can | todo (after A6 merged + B7) |
| B6 | S12 Crew + Settings → Vault export | Codex Sol | Can | todo (after B4) |
| B8 | Playwright p1 e2e + CI job | Codex Sol | — | todo (after B3–B7) |
| G1 | Phase 1 gate: deploy, demo, checkpoint | Claude | — | todo (needs Supabase project + Cloudflare) |

## Parked / follow-ups
- Light-theme contrast fixes (DECISIONS L1) → Phase 4 visual ticket.
- Size budget counts lazy chunks too (`.size-limit.js`) → fix before Phase 3 charts.
- Dependabot #3 (setup-node v7): rebase requested; merge with human OK.
