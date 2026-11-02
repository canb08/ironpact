# Security audit (H3)

Audit of the §4 security rules against `main` `5a017ed`. §10 wins over §4 where they disagree. Status is **pass**, **gap**, or **deferred**. Evidence is a test name or `file:line`. H5 updates below close G4–G7; G1–G3 are deferred to Phase 7 with their feature.

`supabase/tests/security_audit.test.sql` proves the catalogue rules and D-23. pgTAP was not executed in the Grok sandbox (no Docker). CI job `db` is the proof. Assertions that describe a known gap are `todo` so a red assertion does not hide the rest of the file.

## Checklist

| ID | Rule | Status | Evidence |
|---|---|---|---|
| S1 | RLS on every public table, including tables added after A3 | pass | `0001_schema.sql:381`, `0002_rls.sql:30`. `rls.test.sql` D-1. `security_audit.test.sql` scans `pg_class` (covers `invite_attempts`, E4.3). No table is created after `0002`. |
| S2 | Client roles start with no table privileges; grants are least privilege | pass | `0002_rls.sql:24-52`. `security_audit.test.sql` asserts `anon` has no DML on any public table and `authenticated` has none on `crew_invites`, `export_tokens`, `invite_attempts`, `push_log`. |
| S3 | Training tables: owner writes, crew reads, no client delete | pass | `0002_rls.sql:33-41`. DELETE is not granted (`security_audit.test.sql`). Behaviour: `rls.test.sql` D-2, D-4, D-5, D-7. |
| S4 | Bodyweight is crew-visible only when `show_bodyweight` | pass | `0002_rls.sql:61-65`. `rls.test.sql` D-6. Default is false (`0001_schema.sql:17`). |
| S5 | Profiles: self or crewmate read; self write; no email column | pass | `0002_rls.sql:54-59`. Columns `0001_schema.sql:10-34` have no email. |
| S6 | Exercises: global, owner, or crewmate read; owner write | pass | `0002_rls.sql:71-76`. |
| S7 | `exercise_muscles` follow the parent exercise | pass | `0002_rls.sql:78-82`. Stricter than §4.4 `using (true)`: the `EXISTS` is subject to `exercises` RLS. |
| S8 | Crews, members, weeks, streak tokens: member read, no client write | pass | `0002_rls.sql:50-51`, `84-87`, `120`. |
| S9 | `crew_invites`, `export_tokens`, `push_log`, `invite_attempts`: no client policy or grant | pass | `0002_rls.sql:118-119`. `rls.test.sql` secret-table assertion. `security_audit.test.sql` privilege checks. |
| S10 | Reactions: parties read; member insert; no client update | pass | `0002_rls.sql:89-95`. No UPDATE grant (stricter than §4.4 `using (false)`). |
| S11 | Nudges: parties read; inserts only through `send_nudge` | deferred | Read path passes (`0002_rls.sql:49`, `96-97`). **H3-G1**: `send_nudge` is not created. No client INSERT grant, so there is no open write. |
| S12 | Challenges: member read; member may insert `proposed` only | deferred | Policies pass (`0002_rls.sql:99-101`). **H3-G2**: `settle_challenge` is not created. No client UPDATE grant, so status cannot be forged. |
| S13 | E4.2: joining a challenge requires membership and `proposed` | pass | `0002_rls.sql:106-110`. `rls.test.sql` E4.2. |
| S14 | E4.7: push rows are select/delete own; insert/update only via `save_push_subscription` | deferred | Policies pass (`0002_rls.sql:112-116`). **H3-G3**: the RPC does not exist, so an endpoint cannot be reassigned. Direct INSERT/UPDATE is denied (`security_audit.test.sql`). |
| S15 | `is_crewmate` / `is_member`: security definer, empty `search_path`, authenticated only | pass | `0002_rls.sql:2-22`. `rls.test.sql` catalogue block. |
| S16 | Shipped client RPCs: security definer, empty `search_path`, `auth.uid()` check, not granted to `anon` | pass | `0003_rpc.sql:2-172`. `use_spot` (`0005_cron.sql:184-187`) checks `auth.uid()` in `use_spot_at` (`0005_cron.sql:131`). `security_audit.test.sql` calls it with no JWT and expects `unauthenticated`. `server_now` is security invoker on purpose (`0006_sync.sql:2-7`). |
| S17 | Every security definer function sets `search_path = ''` | pass | Each `security definer` in `0002`, `0003`, `0005`, `0008` sets it. `week_close.test.sql` catalogue query. Repeated in `security_audit.test.sql`. |
| S18 | No public function is executable by `anon` | pass | Revokes in `0001_schema.sql:394-396`, `0002_rls.sql:20-21`, `0003_rpc.sql:167-169`, `0005_cron.sql:207-209`, `0006_sync.sql:6`, `0007_pr_check.sql:149`, `0008_purge.sql:66`, `98`. `rls.test.sql` walks `pg_proc`. Repeated in `security_audit.test.sql`. |
| S19 | Service functions are not executable by `authenticated` | pass | `close_week`, `close_due_weeks` granted only to `service_role` (`0005_cron.sql:212`). `purge_deleted_rows` likewise (`0008_purge.sql:99`). `use_spot_at` and trigger functions are revoked and not re-granted. `week_close.test.sql` plus `security_audit.test.sql`. They do not check `auth.uid()` because cron has no user JWT. |
| S20 | Invite codes: owner RPC, sha256 at rest, single use, expiry, revoke, normalisation, `slow_down`, `crew_full` | pass | `0003_rpc.sql:24-111`. `invite_attempts` has no client policy (`0001_schema.sql:269-272`). `invites.test.sql` D-12, D-13, D-14, D-15. |
| S21 | Export token: `spx_` + 43 base64url chars, sha256 at rest, max 3 active, own revoke, list omits `token_hash` | pass | `0003_rpc.sql:126-172`. `export_tokens.test.sql` D-16, D-17. `security_audit.test.sql` denies `SELECT token_hash` and checks `list_export_tokens()` keys. |
| S22 | §5.1–§5.2 export endpoint: bearer or `X-Export-Token`, reject `?token=`, 401 empty body, rate limit, `user_id` only from the token row, private no-cache | pass | `supabase/functions/_shared/export-http.ts:19-36`, `102-109`. `export/handler.ts:16-42`. `export/store.ts:18`, `52-55`, `83-94` (service role, hash lookup, `eq('user_id', userId)`). No CORS headers. Deno `export/index.test.ts` (CI `db`). |
| S23 | `delete_my_account` leaves 0 rows for that user (E4.1 D-23) | pass | No SQL function of that name. Equivalent path: `delete-account` checks the caller JWT and ignores a body user id (`delete-account/handler.ts:21-25`, `index.ts:25-35`), then `delete_account_cleanup` (`0008_purge.sql:19-68`) runs in the auth delete. `delete-account/index.test.ts` counts 0. `security_audit.test.sql` D-23 repeats that count in pgTAP, including a shared exercise, a partner `seen_by`, and `crew_weeks.statuses`. |
| S24 | E4.1 foreign keys cascade or set null as specified | pass | `0001_schema.sql` (`exercises.owner_id` cascade `:59`, `crews.created_by` set null `:39`, invite columns `:53-55`, nudge/reaction users `:208`, `:221`, challenge creator `:243`, session children `:110`, `:129`, `:143`, `:171`, exercise refs restrict `:111`, `:195`). `schema.test.sql` E4.1. |
| S25 | Realtime crew topic: members only, for broadcast and presence | pass | `0004_realtime.sql:9-22`. `realtime.test.sql` D-21. Postgres Changes add no extra policy; source-table RLS applies (`0004_realtime.sql:1-7`). |
| S26 | `dist/_headers` CSP is the project origin, plus frame-ancestors, referrer, permissions, nosniff | pass | **H3-G5 fixed (H5)**: `public/_headers` is the template; `scripts/gen-headers.mjs` generates project-only HTTPS/WSS origins or self-only for mock. `tests/unit/scripts/gen-headers.test.ts` covers valid, invalid, mock and unresolved-source paths; `tests/unit/headers.test.ts` checks the other headers. |
| S27 | Service worker does not cache Supabase API, Realtime, or export | pass | `src/sw.ts:9-21` ignores `*.supabase.co` / `*.supabase.in` and `/functions`. No runtime route caches those URLs. The spec's explicit `NetworkOnly` route is not registered; nothing else caches them. |
| S28 | Browser client has no service-role key | pass | `src/data/supabase.ts:21-25` uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only. No `service_role` / `eyJ` / `sb_` secret-key prefix under `src/` or `public/`. Edge functions read `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEYS` (`export/index.ts:6-10`, `health/index.ts:5-9`, `delete-account/index.ts:5-9`), E3.3. |
| S29 | Account deletion is the signed-in user, not a body id | pass | `adapter.supabase.ts:133-138` invokes `delete-account` with `{}`. `delete-account/handler.ts:22-25`. `delete-account/index.test.ts` sends another user's id and still deletes the caller only. |
| S30 | Pulled tables exclude secret tables | pass | `src/core/types.ts:187-195` (`PULLED_TABLES`) has no `export_tokens`, `crew_invites`, `push_log`, `invite_attempts`, or `push_subscriptions`. |
| S31 | E3.5 `verify_jwt = false` only for implemented functions | pass | **H3-G6 fixed (H5)**: `supabase/config.toml` declares only `export`, `health`, and `delete-account`; `.github/workflows/ci.yml` asserts that exact set without stripping blocks. Export and delete-account validate credentials; health is the intentionally public health probe. |
| S32 | Push sender requires `X-Dispatch-Secret` and Vault storage | deferred | **H3-G6 deploy exposure fixed (H5)**: no handler-less functions are configured. `supabase/config.toml` requires the F24 / rest-alarm handlers to check `X-Dispatch-Secret` before restoring their declarations. Push, Vault and weekly-recap implementation remain Phase 7 work. |
| S33 | Purge of `deleted_at` older than 30 days is scheduled and not a client RPC | pass | `0008_purge.sql:70-100`. `purge.test.sql`. |
| S34 | Week close is scheduled and not a client RPC | pass | `0005_cron.sql:191-214`. Schedule is `5 * * * *` (P3A), not the two lines in the §4.7 table. `week_close.test.sql`. |
| S35 | Auth OTP length 6 and expiry 600s; profiles store no email | pass | `config.toml` `otp_length` / `otp_expiry` (CI `db` asserts both). `adapter.supabase.ts:109-120` uses `signInWithOtp` / `verifyOtp`. E3.1 SMTP and E3.2 dashboard templates are human steps (`docs/SETUP.md`), not code. |
| S36 | E3.4 `VAPID_SUBJECT` is an https URL, not a mailbox | pass | Not set in the repo. `docs/SETUP.md` records `https://<app>.pages.dev`. No mailto subject in code. |
| S37 | Partner PR receipts only append the caller to eligible rows | pass | **H3-G4 fixed (P4H #54)**: `supabase/migrations/0010_mark_seen.sql` adds `mark_pr_events_seen(uuid[])` and preserves server-owned `seen_by` on owner writes. `supabase/tests/mark_seen.test.sql` proves receipt isolation; `security_audit.test.sql` asserts the shipped RPC exists. See L16. |

## Deferred to Phase 7

G1–G3 are deferred to Phase 7 with their feature; existing client writes remain closed.

### H3-G1 · `send_nudge` — deferred to Phase 7 with its feature (F25)

§4.4 RPC table. `supabase/migrations/` has no `send_nudge`. Clients also have no INSERT on `nudges` (`0002_rls.sql:49`), so the hole is a missing feature, not an open write. `security_audit.test.sql` marks `has_function('public','send_nudge')` as `todo`.

### H3-G2 · `settle_challenge` — deferred to Phase 7 with its feature (challenges)

§4.4 RPC table. No function in `supabase/migrations/`. Clients have no UPDATE on `challenges` (`0002_rls.sql:49` grants SELECT, INSERT only). Same `todo` pattern.

### H3-G3 · `save_push_subscription` — deferred to Phase 7 with its feature (F24)

E4.7 and `0002_rls.sql:112-116`. Direct insert/update is denied, which is what the comment promises, but the reassign RPC was never added. A second account on the same endpoint still cannot take the row. `todo` on `has_function('public','save_push_subscription')`.

## Fixed

### H3-G4 · Partner PR receipts — fixed by P4H #54

`supabase/migrations/0010_mark_seen.sql` ships `mark_pr_events_seen(uuid[])`, not the generic `mark_seen` name. It appends only the caller to live crewmate PRs and prevents ordinary owner writes from forging or erasing receipts. `supabase/tests/mark_seen.test.sql` covers the behavior; `security_audit.test.sql` now asserts the actual RPC without a TODO. L16 defines this PR-receipt scope; reaction/nudge receipts remain with their features.

### H3-G5 · Project-specific CSP — fixed by H5

`public/_headers` holds the project placeholders. `scripts/gen-headers.mjs`, run after Vite by `npm run build`, writes `dist/_headers` with only the configured project's HTTPS and WSS origins for Supabase, or `connect-src 'self'` for other backends. Missing/malformed Supabase URLs, surviving `<ref>` and `*.supabase.co` fail the build. `tests/unit/scripts/gen-headers.test.ts` proves these paths. L17 supersedes L3's temporary wildcard.

### H3-G6 · Handler-less function declarations — fixed by H5

`supabase/config.toml` contains only the three implemented functions: `export`, `health`, `delete-account`. `.github/workflows/ci.yml` asserts exactly those entries and no longer strips function blocks from the isolated stack config. The config comment requires `push-dispatch` (F24) and `rest-alarm` to return only with handlers checking `X-Dispatch-Secret`. Their implementation, plus `weekly-recap`, remains Phase 7 work.

### H3-G7 · Future object privileges — fixed by H5

`supabase/migrations/0011_default_privileges.sql` revokes postgres-owned public-schema defaults on tables, sequences and functions from `anon`, `authenticated` and `PUBLIC`, plus the global function EXECUTE default that schema-local revokes cannot subtract. Existing object grants are unchanged. Later migrations must grant explicitly. `security_audit.test.sql` has a real G7 catalogue assertion and creates a table, sequence and function to prove effective client privileges are absent (including inherited PUBLIC EXECUTE), then removes the probes in its rolled-back transaction.

## Not a gap

- `use_spot` is security definer and its own body does not mention `auth.uid()`. `use_spot_at` raises `unauthenticated` before it writes (`0005_cron.sql:131`). The pgTAP call with an empty JWT expects that error. `use_spot_at` is not granted to clients.
- `close_week`, `close_due_weeks`, and `purge_deleted_rows` do not check `auth.uid()`. They are `service_role` / cron only. Checking `auth.uid()` would break the job.
- RLS is enabled but not `FORCE`. `anon` and `authenticated` do not own the tables, so policies still apply to them. The spec requires enable, not force.
- There is no SQL `delete_my_account`. The edge function plus `delete_account_cleanup` is the shipped path and is what D-23 exercises.
