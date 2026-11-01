# BOARD: who is doing what (claim before you fire)

Status: `todo` · `running` · `pr #n` · `merged` · `parked (why)`. Pull before editing; commit `BOARD: <ID> <status>`.

## Engines (4 coders + 2 Claude Leads)
| Engine | Account | Best at here |
|---|---|---|
| Codex (Sol High / Astra) | Can | screens with tricky state (B4, B6), e2e |
| Codex (Sol High / Astra) | friend | backend + sync (A6 finish, A7) |
| Grok (SuperGrok) | friend | independent config/research (R1, A8), then B3 |
| Grok (SuperGrok) | Can | independent PWA shell (B7), then B5 |
Grok runs tickets per `docs/GROK.md` (grok.com → model **Build** → GitHub connector works). Risky code (RLS, sync, export) stays on Codex.
**Until A6 merges:** B-tickets work on pre-made branches = main + A6 draft (`B3-auth-crew`, `B4-session`, `B5-floor-quicklog`). Commit only to that branch; the Lead rebases them onto main after A6 merges.

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
| A7 | Supabase Remote + 20-set flight test + health DB read (L4) | Codex Sol | Can (friend's Codex out of usage) | running 2026-11-01 23:45 (branch pre-made = main + A6; must not touch A6 files — the A6 fix is running in parallel) |
| B4 | S6 session + S7 exercise picker | Codex Sol | Can | pr #15 (reviewed OK; muscles deferred L7; merges after A6 + B3) |
| B3 | S2 OTP sign-in, S3 crew + /join, App wiring + install bootstrap (L5) | Grok | friend | pr #14: main merged by Can (fb861b2); friend's Claude ran the same code locally: typecheck/lint/355 tests/build green, size 169.4/170 kB; Can's Claude merging |
| B5 | S11 quick logs + S4 Floor | Grok | Can | pr #16 (reviewed OK; merges after A6 + B3) |
| B6 | S12 Crew + Settings → Vault export | Codex Sol | Can | pr #17 (reviewed OK; merges after A6 + B3) |
| B8 | Playwright p1 e2e + CI job | Codex Sol | — | todo (after B3–B7) |
| G1 | Phase 1 gate: deploy, demo, checkpoint | Claude | — | todo (needs Supabase project + Cloudflare) |

**Merge order once A6 is ready:** A6 #10 → B3 #14 (mounts RepoProvider) → B4 #15 → B5 #16 → B6 #17 (Lead rebases each onto main).

## Parked / follow-ups
- C4 (Phase 2): exercise-muscle contract + picker grouping (L7).
- Light-theme contrast fixes (DECISIONS L1) → Phase 4 visual ticket.
- Size budget: fixed 2026-11-01 (initial = entry + modulepreloads). **Headroom is ~0.7 kB** once the data layer loads (B3: 169.3/170 kB): supabase-js (A7) must be lazy; next shrink candidates are `zod` → `zod/mini` in the data path, or splitting Dexie behind the first query.
- Dependabot #3 (setup-node v7): rebase requested; merge with human OK.
- Keep-alive must touch the **database**, not just the `health` function (R1 #9: only DB/API activity is documented to stop the free-tier pause) → at G1 point `HEALTH_URL` at a PostgREST read (e.g. `/rest/v1/exercises?select=id&limit=1` with the anon `apikey` header) or make `health` run `select 1`.
- Email: **no custom SMTP** (L6). At G1: invite the friend to the Supabase organization so built-in mail reaches him.
- Installed iOS app does **not** share Safari storage or open at `/join/<CODE>` (R1 #5) → B3 must show the code big with Copy/Paste/typing.
