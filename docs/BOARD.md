# BOARD: who is doing what (claim before you fire)

Status: `todo` · `running` · `pr #n` · `merged` · `parked (why)`. Pull before editing; commit `BOARD: <ID> <status>`.

## Phase 0–1 (walking skeleton)
| ID | What | Engine | Claimed by | Status |
|---|---|---|---|---|
| A1 | Scaffold + CI | Codex Sol | Can | merged #1 |
| C2 | Export formatter + goldens | Claude | Can's Claude | merged #2 |
| A2 | Schema, triggers, seed, DB CI | Codex Sol | friend | merged #5 |
| A3 | RLS, RPCs, security tests | Codex Astra | friend | merged #6 |
| B1 | Tokens, UI primitives, copy bank | Codex Sol | Can | merged #7 |
| C1 | Frozen contracts (types + Repo/Remote) | Claude | Can's Claude | merged (direct) |
| A5 | Edge Functions export + health | Codex Sol | friend | pr #8: code reviewed OK; CI `db` fails at "Start local Auth, API and function services" (supabase start). Diagnostic log line pushed (e376e41); fix in the same Codex chat |
| B2 | Pure core: validate, weeks, credits, e1RM | Codex Sol | Can | merged #9 |
| A6 | Offline data layer + mock backend | Codex **Astra** | — | todo (after a fresh window) |
| R1 | Verify ⚠️ platform facts (research) | Codex Sol, internet | — | todo |
| A7 | Supabase Remote + 20-set flight test | Codex Sol | — | ticket not written (needs A6 + Supabase project) |
| A8 | keepalive, gen-headers, `_headers`, Pages deploy | Codex Sol | — | ticket not written (needs Cloudflare) |
| B3 | S2 OTP sign-in, S1 install gate, S3 crew + /join | Codex Sol | — | ticket not written (needs A6 mock) |
| B4 | S6 session + S7 exercise picker | Codex Sol | — | ticket not written |
| B5 | S11 quick logs + S4 Floor | Codex Sol | — | ticket not written |
| B6 | S12 Crew + Settings → Vault export | Codex Sol | — | ticket not written |
| B7 | sw.ts, manifest, install, Playwright p1 | Codex Sol | — | ticket not written |
| G1 | Phase 1 gate: deploy, demo, checkpoint | Claude | — | todo |

## Parked / follow-ups
- Light-theme contrast fixes (DECISIONS L1) → Phase 4 visual ticket.
- Size budget counts lazy chunks too (`.size-limit.js`) → fix before Phase 3 charts.
- Dependabot #3 (setup-node v7): rebase requested; merge with human OK.
