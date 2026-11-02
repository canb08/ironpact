# Security audit (H3)

Audit of the §4 security rules against `main` `5a017ed`. §10 wins over §4 where they disagree. Status is **pass** or **gap**. Evidence is a test name or `file:line`. This ticket does not change migrations or functions.

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
| S11 | Nudges: parties read; inserts only through `send_nudge` | gap | Read path passes (`0002_rls.sql:49`, `96-97`). **H3-G1**: `send_nudge` is not created. No client INSERT grant, so there is no open write. |
| S12 | Challenges: member read; member may insert `proposed` only | gap | Policies pass (`0002_rls.sql:99-101`). **H3-G2**: `settle_challenge` is not created. No client UPDATE grant, so status cannot be forged. |
| S13 | E4.2: joining a challenge requires membership and `proposed` | pass | `0002_rls.sql:106-110`. `rls.test.sql` E4.2. |
| S14 | E4.7: push rows are select/delete own; insert/update only via `save_push_subscription` | gap | Policies pass (`0002_rls.sql:112-116`). **H3-G3**: the RPC does not exist, so an endpoint cannot be reassigned. Direct INSERT/UPDATE is denied (`security_audit.test.sql`). |
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
| S26 | `public/_headers` CSP is the project origin, plus frame-ancestors, referrer, permissions, nosniff | gap | **H3-G5**. Other directives match §4.7 (`public/_headers:1-5`), including `style-src 'unsafe-inline'`, which §4.7 allows. `sw.js` is `no-cache` (`public/_headers:12-13`). |
| S27 | Service worker does not cache Supabase API, Realtime, or export | pass | `src/sw.ts:9-21` ignores `*.supabase.co` / `*.supabase.in` and `/functions`. No runtime route caches those URLs. The spec's explicit `NetworkOnly` route is not registered; nothing else caches them. |
| S28 | Browser client has no service-role key | pass | `src/data/supabase.ts:21-25` uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only. No `service_role` / `eyJ` / `sb_` secret-key prefix under `src/` or `public/`. Edge functions read `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEYS` (`export/index.ts:6-10`, `health/index.ts:5-9`, `delete-account/index.ts:5-9`), E3.3. |
| S29 | Account deletion is the signed-in user, not a body id | pass | `adapter.supabase.ts:133-138` invokes `delete-account` with `{}`. `delete-account/handler.ts:22-25`. `delete-account/index.test.ts` sends another user's id and still deletes the caller only. |
| S30 | Pulled tables exclude secret tables | pass | `src/core/types.ts:187-195` (`PULLED_TABLES`) has no `export_tokens`, `crew_invites`, `push_log`, `invite_attempts`, or `push_subscriptions`. |
| S31 | E3.5 `verify_jwt = false` only where the function checks its own credential | gap | `export`, `health`, and `delete-account` check a credential (`config.toml:179-193`; handlers above). **H3-G6**: `push-dispatch` and `rest-alarm` are `verify_jwt = false` with only a `.gitkeep`. |
| S32 | Push sender requires `X-Dispatch-Secret` and Vault storage | gap | **H3-G6**. No `push-dispatch` handler, no webhook, no `DISPATCH_SECRET` reader. `weekly-recap` is also only `.gitkeep` and is not in `config.toml`. |
| S33 | Purge of `deleted_at` older than 30 days is scheduled and not a client RPC | pass | `0008_purge.sql:70-100`. `purge.test.sql`. |
| S34 | Week close is scheduled and not a client RPC | pass | `0005_cron.sql:191-214`. Schedule is `5 * * * *` (P3A), not the two lines in the §4.7 table. `week_close.test.sql`. |
| S35 | Auth OTP length 6 and expiry 600s; profiles store no email | pass | `config.toml` `otp_length` / `otp_expiry` (CI `db` asserts both). `adapter.supabase.ts:109-120` uses `signInWithOtp` / `verifyOtp`. E3.1 SMTP and E3.2 dashboard templates are human steps (`docs/SETUP.md`), not code. |
| S36 | E3.4 `VAPID_SUBJECT` is an https URL, not a mailbox | pass | Not set in the repo. `docs/SETUP.md` records `https://<app>.pages.dev`. No mailto subject in code. |
| S37 | `mark_seen` only mutates rows addressed to the caller | gap | **H3-G4**. Owners can still `UPDATE` their own `pr_events`, including `seen_by`, because the training-table policy is general (`0002_rls.sql:40-41`). A crewmate has no UPDATE grant. |

## Found (not fixed)

Migrations, functions, and `public/_headers` are outside this ticket's file list.

### H3-G1 · `send_nudge` is missing

§4.4 RPC table. `supabase/migrations/` has no `send_nudge`. Clients also have no INSERT on `nudges` (`0002_rls.sql:49`), so the hole is a missing feature, not an open write. `security_audit.test.sql` marks `has_function('public','send_nudge')` as `todo`.

### H3-G2 · `settle_challenge` is missing

§4.4 RPC table. No function in `supabase/migrations/`. Clients have no UPDATE on `challenges` (`0002_rls.sql:49` grants SELECT, INSERT only). Same `todo` pattern.

### H3-G3 · `save_push_subscription` is missing

E4.7 and `0002_rls.sql:112-116`. Direct insert/update is denied, which is what the comment promises, but the reassign RPC was never added. A second account on the same endpoint still cannot take the row. `todo` on `has_function('public','save_push_subscription')`.

### H3-G4 · `mark_seen` is missing

§4.4 RPC table and `0002_rls.sql:95`. Recipients cannot mark a reaction, nudge, or partner PR seen. The owner update policy does not limit `pr_events.seen_by` to an append of the caller. `todo` on `has_function('public','mark_seen')`.

### H3-G5 · CSP `connect-src` is any Supabase project

`public/_headers:2` uses `https://*.supabase.co` and `wss://*.supabase.co`. §4.7 asks for the project `https` and `wss` origins. E3.6 says `scripts/gen-headers.mjs` must write `dist/_headers` from `VITE_SUPABASE_URL` and fail the build if `<ref>` survives. That script is not in the repo, and the placeholder was replaced with a wildcard, so the build cannot fail closed. `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, and `X-Content-Type-Options: nosniff` are present (`public/_headers:3-5`).

### H3-G6 · `verify_jwt = false` on functions that do not check a secret

`supabase/config.toml:185-189` sets `verify_jwt = false` for `push-dispatch` and `rest-alarm`. Both directories contain only `.gitkeep`. §4.7 requires `X-Dispatch-Secret` checked inside the function. CI strips those two blocks before `supabase start` (`.github/workflows/ci.yml`) because the CLI rejects a missing entrypoint, so they are not served in the `db` job. A deploy of this `config.toml` has no handler to refuse an unauthenticated call if an empty function is accepted. `weekly-recap` is also unimplemented.

### H3-G7 · Default privileges can re-open a future table

`0002_rls.sql:29-32` revokes client privileges only for tables that exist at that moment. A stock Supabase database grants `anon` and `authenticated` on future tables and functions in `public`. `security_audit.test.sql` asserts `pg_default_acl` does not name those roles, as `todo`. If CI reports that TODO as an unexpected success, this item is a pass.

## Not a gap

- `use_spot` is security definer and its own body does not mention `auth.uid()`. `use_spot_at` raises `unauthenticated` before it writes (`0005_cron.sql:131`). The pgTAP call with an empty JWT expects that error. `use_spot_at` is not granted to clients.
- `close_week`, `close_due_weeks`, and `purge_deleted_rows` do not check `auth.uid()`. They are `service_role` / cron only. Checking `auth.uid()` would break the job.
- RLS is enabled but not `FORCE`. `anon` and `authenticated` do not own the tables, so policies still apply to them. The spec requires enable, not force.
- There is no SQL `delete_my_account`. The edge function plus `delete_account_cleanup` is the shipped path and is what D-23 exercises.
