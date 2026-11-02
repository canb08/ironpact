# Decisions

Authority: SPEC §10, then §1.6, then §1.1. These are decisions, not claims that later-phase features have shipped.

## Canonical register (§1.6 with errata applied)

- D1: User-facing SPOTTER; repo/package/Dexie `ironpact`; export prefix `spx_` (E1.1).
- D2: Floor · Log · Crew · Progress; Settings behind the avatar.
- D3: Invite codes are 10-character Crockford base32, hashed, single use, expire after seven days, shown in two groups of five.
- D4: Six-digit email OTP is primary; browser magic link is the fallback (E3.2).
- D5: At most 2.0 credits per local day; weekly target defaults to 3, range 1–7.
- D6: The Bar gains one plate when both FULL, holds when both at least HELD, loses at most one when anyone REST unless spotted; freeze remains unused in schema (E2.5).
- D7: Iron 0–3 #9AA0A6; Steel 4–7 #7FA7C9; Titanium 8–15 #C9CCD1; Obsidian 16+ #1A1420 with molten rim (E2.1).
- D8: Spots open Sunday noon crew time, require own target + 1 credit, one per member per calendar month without rollover.
- D9: Readiness rows store 1–3; sum ≤5 suggests MIN; skip gives no suggestion (E2.2).
- D10: Nudge when all working sets reach target and max RPE ≤8 or no RPE; suppress after a gap over 14 days.
- D11: Partner PR, nudge, recap, spot and opt-in partner start may push; hype never pushes; cap three/day and quiet hours 22:00–08:00 recipient time, subject to E5.10/E9.1 exemptions.
- D12: Export §5 wins; runs and each martial discipline sum daily; max working-set RPE; distinct notes joined with semicolon and capped at 120; Weight → lifts → martial → Run → MIN.
- D13: Export is symmetric and personal, at most three active tokens, default lines with JSON/CSV options.
- D14: DB/import RPE 5–10 step 0.5, weight 30–300, names 1–20; forms RPE 6–10, weight 30–250, names 1–16 (E2.3).
- D15: Running rest timer occupies the top read-only zone, controls directly above LOG SET, steppers remain usable; no sheet over controls (E7.1).
- D16: Android vibrations: logged [18], PR [30,40,30,40,120], timer [80,60,80,60,200].
- D17: Initial JS ≤170 KB gzip; fonts ≤220 KB and four files, aim ≤180 KB, drop Anybody first.
- D18: Martial disciplines: BJJ, Muay Thai, Boxing, Kickboxing, Judo, Wrestling, MMA, Karate, plus free text ≤16 characters.

## §10 overrides

- E0.1: Ignore corrupted pasted sections; validate real YYYY-MM-DD dates and full 43-character export-token suffixes; invalid token gets delayed empty 401.
- E0.2: Ignore the leftover drafting note at the end of §3.
- E0.3: Resolve stale source-document section pointers using §10.0's mapping.
- E1.1: Canonical identifiers are SPOTTER, `ironpact`, and `spx_`.
- E1.2: Scan tracked files and dist for full export tokens, secret-key prefixes, privileged-key assignments and JWT signatures.
- E2.1: Use the canonical four-tier palette above; no Bare bar or Bronze.
- E2.2: Readiness is 1–3 per row, sum ≤5 suggests MIN.
- E2.3: Forms are stricter than DB checks; import validation matches DB.
- E2.4: Reaction kinds are light_weight, clean, again, chalk; no emoji.
- E2.5: Schema allows spot/freeze; freeze is never written.
- E2.6: Use the final copy table and gender-neutral partner references.
- E2.7: E6.2 is the sole Copy for my AI template.
- E3.1: Custom SMTP is mandatory before inviting a partner; organization-member delivery is only a first-test stop-gap.
- E3.2: Both signup and magic-link templates include the token; OTP length 6, expiry 600 seconds, UI reads VITE_OTP_LENGTH.
- E3.3: Never set reserved SUPABASE_ secrets; use injected project keys and set only custom push/dispatch secrets.
- E3.4: VAPID subject is the application's HTTPS URL, never an email.
- E3.5: Persist verify_jwt=false for export, health, push-dispatch and rest-alarm in Supabase config with CI checks.
- E3.6: Build generates CSP headers from the real backend origins and rejects surviving project-ref placeholders.
- E3.7: Shortcuts are Android-only; generate iOS startup images before device release.
- E3.8: Join offers copy, user-triggered paste, URL prefill when available, and manual entry.
- E3.9: Public-repo inactivity can disable schedules; retain the monthly heartbeat only as a guard.
- E3.10: Phase 4 uses LazyMotion/domAnimation/m.*, lazy domMax/confetti; measure the Log route with that code included.
- E4.1: Apply the corrected cascade/set-null/restrict foreign keys and test complete account deletion.
- E4.2: Challenge joining checks the caller, crew membership and proposed status.
- E4.3: Store invite attempts in a table without client policies for rate limiting.
- E4.4: Compute acted-on nudges from credit within 24 hours; drop the stored flag.
- E4.5: LWW guard returns NULL on stale writes and runs before updated_at.
- E4.6: Exercise preferences, reactions and bodyweights use deterministic UUIDv5 natural keys; date moves replace identity.
- E4.7: save_push_subscription RPC reassigns unique endpoints to the caller; client insert/update policies are removed.
- E4.8: Viewing clients verify partner PRs; push waits two minutes if feasible, otherwise sends immediately.
- E4.9: Reject export-keyword labels and conflicting martial/lift labels.
- E5.1: Upsert with returned rows; fetch and reconcile any LWW-dropped row.
- E5.2: Bisect 4xx batches and mark only failing individual rows dead.
- E5.3: Pull with (updated_at,id) keyset pagination and five-second overlap.
- E5.4: Measure and apply server clock offset on every launch; ten minutes only controls the warning.
- E5.5: Sessions use device timezone at start; refresh profile timezone on launch; crew weeks compare local dates, Monday start.
- E5.6: MIN entries earn 0.5, gym/run/martial sessions with qualifying entries earn 1, gym Do MIN earns 1, cap 2/day.
- E5.7: Week close is SQL close_week via pg_cron, not an Edge Function; SQL/client credits share fixtures.
- E5.8: Crew creation and member join weeks cannot lose plates.
- E5.9: Skip partner-start push for sessions received over ten minutes late.
- E5.10: Partner PR, recap, spot and rest-alarm bypass the credited-today suppression.
- E5.11: Week debug mode exists only in dev or mock builds.
- E6.1: Vault sync pulls the full export with ETag at most hourly and replaces the whole SPOTTER section on 200.
- E6.2: Use the canonical personal-export instructions, validated header and token stored separately as a secret.
- E6.3: Banned-copy scans cover only UI copy and shared push copy.
- E6.4: Keep golden fixtures byte-exact; test reserved labels and separator handling.
- E7.1: Timer controls/LOG SET/Undo/finish/next start below 60% viewport, steppers/RPE below 40%, compact RPE below 700px.
- E7.2: Volume PR only at finish as a badge; at most one takeover per exercise/session; foreground visits define screen opens.
- E7.3: Three readiness skips enable auto-skip, reversible in Settings.
- E7.4: Seasons and DOTS move to Stretch; Duels stay v1.
- E7.5: Same-day weigh-in overwrites its deterministic row.
- E7.6: Crew defaults to Crew, editable later; onboarding never asks for it.
- E7.7: Presence includes planned_sets and last_active_at.
- E9.1: v1 self-push rest alarm is device-verified behind a flag, with foreground fallback and no cap/quiet-hours suppression.
- E9.2: v1 shows an offline PR-within-reach cue outside warm-ups and comeback mode.
- E9.3: v1 plate-math equivalents use pure arithmetic.
- E9.4: v1 app badge counts unseen good news only, clears on Crew open, feature-detected no-op fallback.

## A1 scaffold (2026-10-26)

- `npm view <package> version` selects current stable versions: Vite 8 (table 7), React plugin 6, TypeScript 7 (table 5), React Router 8 (table 7), PWA plugin 2 (table 1), ESLint 10 and Vitest 5. Routing remains SPA data mode; PWA remains injectManifest. Exact versions are in STACK.md.
- TypeScript 7 has no stable compiler API for typescript-eslint. Use Microsoft’s [documented side-by-side aliases](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0): `@typescript/native` → `typescript@7.0.2` provides `tsc`, and `typescript` → `@typescript/typescript6@6.0.2` provides the supported lint API. Both are exact pins; no peer overrides or install bypasses.
- Secret scanner tests live in-source in the allowed script via Vitest includeSource, avoiding an out-of-scope test file.
- Folder placeholders follow §4.2 with E5.7/E9.1 applied: credits fixtures and rest-alarm are reserved, functions/week-close is omitted. Future implementation files are not created as stubs.
- A1's SPOTTER text is confined to the allowed router and HTML; a later ticket can add the frozen copy module. No backend account setup, device feature, fonts, motion or deployment is implemented here.
- Size-limit conservatively counts every page JS chunk plus registration; font count and total raw bytes are also checked. Revisit chunk selection when lazy feature routes land.

## A2 database contract (2026-10-26)

- E2.2/E2.3: readiness requires all three integer rows in 1–3; DB/import names allow 20 characters, bodyweight 300 kg, and every RPE accepts 5–10 in exact half steps. RPE uses unconstrained `numeric` so PostgreSQL cannot round an invalid fraction into a valid value before the CHECK runs.
- E2.4/E2.5: reactions use `kind` (four chalk stamps), including its natural-key UNIQUE constraint; streak tokens allow spot/freeze, with no freeze-writing logic.
- E3.2/E3.5: local Auth defaults to six-digit OTPs expiring in 600 seconds; export/health/push-dispatch/rest-alarm persist `verify_jwt=false`. CI asserts these values.
- E4.1/E4.3/E4.4: apply the corrected cascade/set-null/restrict FKs (crew creator becomes nullable), add indexed server-owned invite attempts, and omit stored `nudges.acted_on`. The account-deletion RPC remains A3's responsibility.
- E4.5: `a_lww_guard` returns NULL before `b_set_updated_at` on stale writes. Accepted equal timestamps remain last-arrival-wins. Timestamp updates preserve the literal table contract: `jsonb_populate_record` updates `received_at` only on rows that have it, so exercises/profiles/challenges do not gain an undocumented column ([PostgreSQL JSON record rules](https://www.postgresql.org/docs/current/functions-json.html)).
- E4.6: client IDs remain required without random server defaults on exercise preferences, reactions and bodyweights; UUIDv5 generation belongs to the later client ticket. The three server-created UUID defaults from §4.3 remain.
- E4.9: reserved labels are case-insensitive CHECKs; martial labels cannot collide with global or same-owner active lift labels, including on reverse exercise edits. Normalize and lock the label before either check so concurrent READ COMMITTED writes cannot create a cross-table collision. Soft-deleted labels do not reserve the namespace.
- E5.5/E5.6: retain session-start device timezone/local date and force child rows to that date; standalone bodyweights keep their own date. Preserve `sessions.kind`/`mode` and MIN rows; credit calculation and Monday crew-week grouping are deferred to their RPC/client tickets.
- A2 enables RLS on all 25 public tables and deliberately creates no policies or application RPCs; A3 supplies the allowed access. pgTAP tests run as the local test owner to validate schema behaviour independently of those future policies.

## A3 access control and RPCs (2026-10-26)

- Training rows remain soft-delete-only under SPEC §4.4 and D-7; the ticket's general "full CRUD" wording does not grant hard deletes. Crew membership and derived/server-owned data remain RPC/service controlled. E4.2 restricts challenge participation to current members of a proposed challenge's crew. E4.7 permits only owner SELECT/DELETE on push subscriptions; the subscription-save RPC is outside A3's enumerated RPC scope.
- Invite creation returns the ticket's plain ten-character Crockford code; display grouping belongs to the client. Export-token plaintext is returned only by creation, while listing exposes only the five specified metadata columns.
- Approved contract change: `redeem_invite(code text)` returns JSONB `{crew_id: uuid|null, error: null|code_dead|crew_full|slow_down|already_in_crew}` for expected outcomes, keeping failed-attempt recording and the result in one committed transaction. The former UUID/exception contract could not durably record failed attempts: PostgreSQL and PostgREST roll back failed statements/requests ([PostgreSQL exception handling](https://www.postgresql.org/docs/17/plpgsql-control-structures.html#PLPGSQL-ERROR-TRAPPING), [PostgREST transaction end](https://docs.postgrest.org/en/stable/references/transactions.html#transaction-end)). Future callers must handle `data.error`; SQL authentication/unexpected failures still raise normally.
- Approved scope extension: `schema.test.sql` now checks that server-only tables have no client policies, replacing its obsolete A2-only zero-public-policies assertion. The user explicitly approved both changes in this chat on 2026-10-26 ("Yes, apply both fixes").
- User locks serialize rate counting and crew creation/join/leave, crew-row locks serialize capacity, invite rotation and consumption, and token-user locks serialize the three-active-token cap. Session date propagation preserves child timestamps and locks parent reads to prevent concurrent child inserts from inheriting the old date. These locking mechanisms were reviewed; the sequential pgTAP suite does not claim to exercise simultaneous requests.

## Lead decisions 2026-10-26
- **L1 · Contrast conflicts from B1 (§3.2.4):** dark theme (the hero) keeps its source colours. Obsidian's 3:1 is carried by its molten rim, so the contrast test asserts rim vs surface-1, not the core. Light theme only: molten, Iron, Steel and Titanium get darker light-theme variants (same hue, lower lightness) until molten ≥ 4.5:1 on surface-2 and each tier ≥ 3:1 on surface-1. Implemented in the Phase 4 visual-system ticket; until then B1's five `it.fails` cases document the gap.
- **L1 closed (P4A):** light molten `#BE3400`, Iron `#70757B`, Steel `#6B93B4`, Titanium `#8D9095`; obsidian core stays `#1A1420` and the test asserts the molten rim. The five `it.fails` cases now pass.
- **L3 · CSP origins (A8, E3.6):** Phase 1 ships `https://*.supabase.co wss://*.supabase.co` in `public/_headers`; G1 replaces the wildcard with the real project origin once the project exists. No build-time header generator until then.
- **L4 · Keep-alive must hit the database (R1 #9):** `health` does one trivial read (`select 1` via the service client, or a 1-row `exercises` read) so the 2-day ping counts as database activity. Built in A7; `keepalive.yml` unchanged.
- **L5 · B7 gaps:** install/storage bootstrap and the first-launch gate are wired in `App.tsx` by B3. The `storage.persist()` result stays in a localStorage marker (no `meta` API added to the frozen Repo; it's diagnostics only). Apple head metadata and startup images go to the Phase 4 visual ticket.
- **L6 · No custom SMTP (Can, 2026-11-01; overrides E3.1 "custom SMTP mandatory"):** the app has two users only. Use Supabase's built-in email: both users are members of the Supabase **organization** (built-in mail only reaches team members, 2 emails/hour per R1 #3). No domain, no Brevo. Revisit only if a third user is ever added.
- **L7 · Exercise muscles deferred (B4 contract request):** Phase 1 creates exercises with name/category/kind only; S7 groups by category. A Phase 2 contract ticket (C4) adds `q.exerciseMuscles` + `w.createExercise({…, muscles})` writing `exercise_muscles` in the same outbox transaction; the muscle picker and grouping land with it (the heatmap needs it anyway).
- **L8 · Sign-out keeps local rows (A6 fix):** only a real account switch clears the device; a null user (startup, sign-out, expired token) keeps unsynced writes. Two users on their own phones, so not clearing is the safer default.
- **C5 · Lazy data layer:** `App.tsx` dynamic-imports `src/data/index.ts`; Dexie, zod and the backend adapter are outside initial JS (169.4 → 100.5 kB).
- **L2 · `redeem_invite` returns jsonb** `{crew_id, error}` (approved on A3) so failed-attempt rows commit and the rate limit works.
- **L9 · P2A workout-engine Repo (pre-approved, 2026-11-02):** additive `RepoQueries` / `RepoWrites` only; no schema change and no rename. Big jumps stays `profiles.big_jumps` (`q.me` / `upsertMyProfile`). `setExercisePref` writes `rest_s` only. `exercise_prefs.id` is UUIDv5 of `user_id:exercise_id` under namespace `bcd6de86-04e6-52f5-ae97-a0323dde2be5` (v5 of `ironpact.exercise_prefs` in the DNS namespace) so two offline devices cannot dead-letter the natural key (E4.6); `ids.ts` is outside this ticket, so the constant lives in `repo.ts`. `updateSession` local-date moves rewrite `sets`, `cardio_entries`, `martial_entries` and `min_entries` in the same outbox batch, including tombstones, and do not change those children's `client_updated_at` (same rule as `propagate_session_local_date`). A bodyweight date edit soft-deletes the old row and inserts the deterministic id for the new date. `recordPrEvents` accepts `core/prs.ts` drafts, drops `display` and `bucket_label`, and inserts one batch. `softDelete` of a set or run already tombstones matching `pr_events` in that same batch (F8).

- **L10 · P3B duo data seam (2026-11-02):** `Repo.duo` exposes local, liveQuery-safe `weeks(fromWeekStart)`, `bar()` (`{value, history}`) and `spots()`, plus `useSpot(weekStart)`, `presence.onChange` and `onCrewChange`. Row/presence types live in `src/data/duo.contract.ts`, leaving the frozen core row types untouched. The Bar is the latest canonical `crew_weeks.plates_after`; local previews remain the pure P3C helpers, and server rows win. `Remote` adds `useSpot` (P3A's idempotent UUID RPC and exact error codes) and `subscribeCrew` (presence and change notifications). Like the existing crew RPCs, `useSpot` is online-only: flush training writes first so SQL sees the credits, invoke the server-owned operation, then pull canonical tokens. Offline calls return `network`; no optimistic spot or success is fabricated. Extending durable outbox replay to RPC commands requires a follow-up to the sync/outbox contract.
  - Data writes publish presence only after their Dexie transaction commits; start/set update it, finish/discard clear it, and a local timer expires both sent and received entries after 120 seconds. E7.7 fields include `planned_sets` from the previous session's exercise count (or current logged count) and `last_active_at`. Account changes, crew departures and repo close tear down connections; visibility/online recovery expires stale entries, recreates disconnected channels and pulls deltas. Each published table has an unfiltered Postgres Changes subscription governed by RLS; the private presence room is `crew:{crew_id}`. Events coalesce into pulls, with another pass when an event arrives during a pull, preserving the existing pending-outbox conflict handling. No realtime payload writes directly into the mirror.
  - The mock's isolated in-memory room bus observes its existing server tables every 50 ms, without replacing the existing mock write methods. It exercises the same Remote pull and local mirror path; it does not claim cross-process browser transport. `autoStart: false` continues to disable automatic work for existing contract tests; `realtime: true` explicitly enables subscriptions independently for latency tests. No screen, route, schema, dependency or copy changes.
  - CI exposed the pinned server's per-client presence limit: [Realtime v2.147.1 PresenceHandler](https://github.com/supabase/realtime/blob/v2.147.1/lib/realtime_web/channels/realtime_channel/presence_handler.ex) defaults to five events per 30 seconds, and its channel handler disconnects clients on overflow. The transport sends at most four track updates in a 30.1-second window, coalesces excess rapid sets to the latest payload, and reserves the fifth event for finish/untrack. It sends no initial empty untrack and never waits for a track acknowledgement before sending finish. This pacing applies only to presence; Postgres Changes and set-to-feed latency remain immediate.

## A5 export endpoint (2026-10-26)

- Scope and formatter remain frozen. No migration, client code or export formatter was changed. The user explicitly approved guarded atomic updates for the export quota ("Yes, use guarded updates"): compare both original window fields, owner, ID and non-revoked state, then re-read on a lost race. This preserves the fixed-window count without a new SQL RPC; it uses function time rather than database `now()` and fails closed after 100 collisions. The strict older-than-one-hour rule and schema's creation-time initial window follow §5.1's SQL.
- E0.1: strict 47-character tokens and real-date `since` validation; all unauthorized paths request a fixed 200ms delay. E3.3: [official injected-key documentation](https://supabase.com/docs/guides/functions/secrets) confirms both SUPABASE_SERVICE_ROLE_KEY and SUPABASE_SECRET_KEYS; prefer the legacy service-role value when present and fall back to the default injected secret. Never set reserved names or log credentials. The existing PLATFORM-NOTES E3.3 source entry is preserved; A5's scoped deployment findings live in EXPORT.md.
- E3.5: existing verify_jwt=false config is preserved. Both credential headers are tested through the local gateway; which works in production remains G1's explicit deploy check, as recorded in EXPORT.md. E6.1/E6.2: full vault pulls, conditional ETags and whole-section replacement; the canonical copy template never contains a real token. E6.3: technical error text is not UI/push copy.
- All owner-row queries and referenced-exercise queries use ID keyset pagination to exhaustion, including short pages below the requested size. Referenced soft-deleted exercise labels are retained. HEAD/304 consume quota and update last use; last use does not affect representation bytes or ETags. A final non-revoked last-use update suppresses a response if revocation happened during data reads.
- Vitest discovers the required Deno test filename, so it registers a clearly labelled skipped sentinel there. The same file executes its real integration suite in the Deno CI job; JSR imports load only in that runtime. No Vitest configuration or check-job change is needed.
- CI uses a private runner-temporary copy of the Supabase project for function tests, retaining only export/health declarations there. The CLI otherwise validates the missing future push/rest function entrypoints even with edge-runtime excluded. Original config and its four verify_jwt checks remain unchanged; no future function is stubbed. Only Auth, API, gateway, database and mail services start, reducing irrelevant image pulls. The CLI's [documented workdir and exclude flags](https://supabase.com/docs/reference/cli/supabase-start) keep this entirely within A5's workflow scope.
- Real-stack findings: the local gateway adds its own CORS header, independently of the function. Supabase's [official Kong configuration](https://github.com/supabase/supabase/blob/master/docker/volumes/api/kong.yml) includes a CORS plugin on functions-v1. The handler test proves the function emits none; gateway removal cannot be controlled by these function files and must be checked in G1. Integration representation comparisons request identity encoding so gateway compression cannot weaken only GET's validator. Golden bulk inserts use missing=default to preserve schema defaults on optional fixture fields.

## A6 offline data layer (2026-11-01)

- The frozen `Repo`, `Remote` and row contracts are implemented without editing them. B2 is already merged, so writes import its real form/DB validation schemas; no temporary validation shim is introduced. Public `src/data/index.ts` exports only `createRepo()` and contract types. `VITE_BACKEND=supabase` explicitly throws `A7 not merged` until the real Remote exists.
- One Dexie read/write transaction saves each local mutation and its coalesced outbox payload. A revision token distinguishes an in-flight payload from a newer local edit, so an old acknowledgement cannot erase the new edit. Flush selects the earliest pending table again after each batch, preserving parent-before-child order even when writes arrive during a flush. Returned server values, including LWW winners, are reconciled before acknowledged payloads are removed; missing returned rows are fetched first.
- E5.3/A7 Remote convention: the six pulled tables without `updated_at` (`exercise_muscles`, `crews`, `crew_members`, `crew_weeks`, `nudges`, `challenge_participants`) use complete snapshots each pull. Cursor time is the fixed epoch `1970-01-01T00:00:00.000Z`; rows sort by stable primary-key identity. The four composite IDs are JSON arrays of their ordered primary-key parts, shared with `db.ts`. A7 must implement the same convention through the existing `pullPage`/`fetchByIds` interface. Virtual cursor metadata is removed before storing those mirror rows. This is an adapter convention, not a new database timestamp column or frozen contract change.
- Complete successful snapshots remove absent cached rows unless an unsynced outbox entry protects them. Partial/failed snapshots never remove absent rows. This is necessary for membership/privacy: after a remote crew departure, RLS can return no membership rows rather than a tombstone. Queries use current membership and profile sharing settings to hide retained partner history and bodyweight.
- E5.4/E5.5: time is injected and fresh calibration applies every measured offset, including less than ten minutes; the larger threshold controls only the diagnostic flag. Sessions retain the device timezone and local date at start, and children copy that date across midnight/DST. Bodyweight IDs use UUIDv5 of `user_id:local_date` in the fixed namespace `d188af2e-e717-4b89-86a4-bf30e766a21b`; same-day writes replace the same row.
- The data layer relies on foreground/online triggers and persisted IndexedDB, not Background Sync. Storage persistence requests, install prompts and real-device storage retention are platform-ticket work. The [Dexie transaction contract](https://dexie.org/docs/Dexie/Dexie.transaction()) and [abort behavior](https://dexie.org/docs/Transaction/Transaction.abort()) underpin atomic write/rollback tests. Clock/date behavior uses the existing [date-fns timezone package](https://github.com/date-fns/tz).
- A7 immutable-table convention: `exercise_muscles`, `reactions` and `challenges` lack client UPDATE grants. An exact replay of an already-stored immutable payload returns its canonical acknowledgement; a differing payload is rejected. The real Remote must implement insert-ignore plus an ownership-checked fetch instead of attempting a forbidden UPDATE.
- Cached `clock_offset_ms` is restored before offline initialization and replaced by fresh online calibration. A module-level promise registry keyed by database name serializes multiple controllers, and `createRepo()` memoizes its public instance. Mock requests capture the caller before latency and reject an intervening account switch; Repo RPC responses are fenced by the account epoch.
- Remaining review concern: initial online bootstrap currently waits for calibration/pull before its local write gate opens. Cached offline startup is immediate, but a slow/unreachable server while the browser reports online can delay the first write. Evaluate and test decoupling network bootstrap from local readiness before marking A6 ready; no frozen contract change is required.
- **L12 · E5.7 credit fixture parity (P3A #28 contract request, 2026-11-02):** deferred out of P3A. P3A's pgTAP and P3C's Vitest each cover the credit rules independently for now. Follow-up ticket P3H (lane E, test-only, after P3A + P3C merge): `tests/fixtures/credits/*.json` + a Vitest consumer for `core/credits.ts` + a pgTAP loader for `week_credits`, same cases both sides.
