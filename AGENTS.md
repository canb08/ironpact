# AGENTS.md: rules for every coding agent in this repo

You are one of several agents (Claude Leads, Codex, Grok) building **SPOTTER** (code name `ironpact`): an offline-first gym PWA.
The full spec is [`docs/SPEC.md`](docs/SPEC.md). **§10 (errata) wins over every other section**, then §1.6, then §1.1's order.

## The team
| Agent | Role | Owns |
|---|---|---|
| Claude (Lead) | plans, writes tickets and frozen contracts, reviews, merges, deploys | `docs/`, `src/data/adapter.ts`, `src/core/types.ts`, `supabase/functions/_shared/export-format.ts`, `tests/fixtures/export/*` |
| Codex A (backend) | DB, RLS, RPCs, Edge Functions, offline sync | `supabase/**` (except `_shared/export-format.ts`), `src/data/*` (except `adapter.ts`) |
| Codex B (frontend) | UI, screens, pure logic, device APIs, e2e | `src/ui/*`, `src/features/*`, `src/core/*` (except `types.ts`), `src/platform/*`, `tests/e2e/*` |
| Grok (two accounts) | same rules as Codex; takes whichever role its ticket names | only the files its ticket lists |

`src/router.tsx` and `src/app/*` are frozen (C3): a screen ticket replaces its own placeholder screen file, never the route table.

## How you work
1. You get one ticket: `docs/tickets/<ID>.md`. Do **only** that ticket. Read the spec sections it names before writing code.
2. **Touch only the files the ticket lists.** Need a file outside your list, or a change to a frozen contract? Stop, write the request in the PR description under `## Contract change request`, and don't make the change.
3. Branch `<ID>-<short-name>` (e.g. `A1-scaffold`). Open **one PR** to `main`. Never push to `main`. Never force-push.
4. PR description = the ticket's acceptance checklist, each item ticked with the test or command that proves it. Anything you could not do goes under `## Not done` with the reason. **Never stub a feature and call it done** (spec §1.2).
5. Every ⚠️ item you touch: verify against official docs (MDN, caniuse, vendor docs), record the finding plus a link in `docs/PLATFORM-NOTES.md`, then build the fallback the spec names. If no fallback is named, stop that item and say so in the PR.
6. CI must be green before review. If you can't run something in your sandbox (Docker, Supabase local, browsers), say so; CI is the source of truth.

## Hard rules (from the spec)
- TypeScript `strict`, `noUncheckedIndexedAccess`. No `any` in `src/core` or `supabase/functions/_shared`.
- `src/core` and `_shared` are pure: no I/O, no React, no `Date.now()` (time is injected).
- Every user-data write goes through the outbox. No component calls Supabase directly.
- Every copy string lives in `src/ui/copy.ts`.
- **No real names, surnames or emails** anywhere in code, seeds, fixtures or copy. Test users: `alice@example.test`, `bob@example.test`.
- Secrets only in env vars. Only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`, `VITE_BACKEND`, `VITE_OTP_LENGTH` may be `VITE_`-prefixed. Never print a secret.
- Pin **exact** dependency versions. Record them in `docs/STACK.md`.
- User-facing name is always **SPOTTER**. Repo, package, Dexie DB: `ironpact`. Export token prefix: `spx_` (§10 E1.1).
- No motion, sound, textures or particles before Phase 4 (§1.5).
- Plain-English commit messages that start with the ticket ID: `A2: schema + triggers, pgTAP green`.

## Commands (once A1 lands)
`npm ci` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run build` · `npm run size`
