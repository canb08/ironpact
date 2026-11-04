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
| G1 | Phase 1 gate: deploy, demo, checkpoint | Claude | C | deployed 2026-11-02: Supabase `Spotter` (eu-central-1, 11 migrations + seed, functions export/health/delete-account), Gmail SMTP + 6-digit OTP (L18), Pages **https://spotter-crew.pages.dev** (live 17:40; first project `ironpact` stuck on 522 and was deleted; CSP locked to the project), HEALTH_URL set. Next: owner phone test (`docs/DEVICE-TEST.md`) |

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
| P3G | Playwright Phase 3 | Grok | E | merged #49 (PR-run e2e flake in p1-demo on Pixel 7 re-run green) |
| P3H | Shared credit fixtures: SQL `week_credits` ↔ TS `credits.ts` parity (E5.7, L12) — **new ticket, test-only, no `src/**` or migrations** | Grok | E | merged #36 (24 fixtures, Vitest + pgTAP; PR-run db red = port-in-use flake, push-run db green) |

## Phase 4–5 queue (fire order in `docs/LANES.md`)
| ID | What | Engine | Lane | Status |
|---|---|---|---|---|
| P4A | Design foundation: tokens, fonts, contrast (L1), textures | Grok | C | merged #23 |
| P5E | App shell: offline/server-asleep banners, SW update chip | Grok | C | merged #22 (Lead: banner overlay fix) |
| P4D | Sound (Web Audio) + iOS haptics flag | Grok | C | merged #24 |
| P4B | Motion foundation + Tier-3 micro + moment queue | Grok | C | merged #40 |
| P4C | PR takeover + partner shockwave hook | Grok | **E** (moved: owner's Grok ~95% weekly; nothing pushed — start fresh from main) | merged #52 (push run fully green; PR-run e2e red only on the diagnosed Pixel 7 Floor flake in p1-demo/p1-flight, see Parked; P4C doesn't touch the Floor) |
| P5B | S14 completed | Grok | C | merged #38 |
| P5C | S16 Settings full | Grok | C | merged #42 |
| P4G | Playwright Phase 4 | Codex Sol | **C** (owner's Codex) | merged #53 (flaky secret-scan timeout re-run) |
| P4H | Wire partner-PR shockwave end to end + `mark_seen` RPC (closes H3 G4, L16) | Codex Astra | C | merged #54 (Lead review: seen_by made server-owned in the PR guard so stale owner tombstones still sync) |
| H5 | Deploy hardening: CSP per project (gen-headers), drop handler-less function configs, revoke default privileges (H3 G5–G7, L17) | Codex Astra | **E** (owner's Codex out of usage → friend's Codex, owner OK via friend 2026-11-02) | merged #59 (Lead approved contract change: EXECUTE grants on 2 pg_temp test helpers, needed by 0011's global revoke) |
| H6 | Floor stops blanking on live updates + MIN double-toast guard (flaky Pixel 7 e2e) | Codex Sol | E (lane C engines out) | merged #60 (CI green; local Pixel 7 repeat: 1/10 vs main 3/10 — remaining flake is the AuthGate race in Parked) |
| H7 | Accessibility fixes: H1's 13 `test.fixme` | Grok | E (lane C screens; Can's Claude welcome to review) | merged #61 (13 fixmes cleared + PR takeover e1RM contrast; settleMotion before axe) |
| H8 | Perf: lhci measures real screens, /settings CLS, LCP, Lighthouse blocking (L14) | Grok | E | merged #62 (lhci seed measures real screens; /settings CLS 0.799→0 with an inert form, no fake profile; LCP ~4 s stays report-only per L14) |
| H9 | AuthGate holds first paint until the first route is decided (last Pixel 7 p1 flake, first-launch Floor→install flash) | Codex Sol | C | merged #63 (e2e green 3/3 runs incl. Pixel 7 p1-demo/p1-flight) |
| H10 | Fresh device (iPhone home-screen app): signed-in user with a crew stuck on /crew/new ("You're already in."): gate re-checks after first pull | Codex Sol | C | merged #64 (pull-then-recheck on fresh device; already_in_crew recovers to /) |
| P5D | Delete account function + 30-day purge (L11) | Codex Astra | **C** (the owner's Codex took it: lane C idle, P5C needs it; the owner's Claude reviews + merges) | merged #32 |
| P4F | S1 install gate full + Floor install chip | Grok | **C** (the owner's Grok took it while idle; the owner's Claude reviews + merges) | merged #35 (Lead: kept "Continue in browser") |
| P4E | Duo moments: ring close, Bar tier-up, flame, shockwave | Grok (friend's Codex out of usage) | E | merged #46 |
| P5F | Recompute PRs after an edit + edit notices (L13) | Codex Astra | C (back from E) | merged #44 (+ Lead migration 0009, L15) |
| P5G | S6 fits 375 px (kg/reps overflow, reported by friend's Lead) | Codex Sol | C | merged #50 |
| P5A | S13 Progress full | Grok | **C** (the owner's Grok took it while idle; the owner's Claude reviews + merges) | merged #37 |

## Phase 6 hardening (pre-deploy part; G1 deploy + phone session need the owner)
| ID | What | Engine | Lane | Status |
|---|---|---|---|---|
| H1 | Accessibility pass (axe, 375 px/200%, target sizes) | Grok | **E** (moved: the owner's Grok at 90% weekly) | merged #51 |
| H2 | Lighthouse CI on the production build | Grok | **E** (moved: the owner's Grok at 90% weekly) | merged #47 (report-only per L14; Lead fixed the preview-ready check) |
| H3 | Security checklist audit (§4) + missing pgTAP | Grok | **E** (moved: the owner's Grok at 90% weekly) | merged #48 (gaps G1-G7 in Parked) |
| H4 | Device test checklist (docs/DEVICE-TEST.md) | Grok | C | merged #45 |

## Lane E status (friend's Claude, 2026-11-02 ~19:00)
H5 #59, H6 #60, H7 #61, H8 #62 merged on the friend's engines (owner's Codex out of usage). Open follow-ups for the next ticket round: (1) AuthGate first-run redirect race behind the remaining Pixel 7 p1 flake (lane C, auth) — see Parked; (2) LCP ~4 s vs 2 s budget: render delay behind the lazy data graph, needs a design call before the lighthouse job can block (L14).

## Lane E status (friend's Claude, 2026-11-02 ~06:45)
All lane E tickets merged: P3A #28, P3B #34, P3C #27, P3D #29, P3E #39, P3F #33, P3G #49, P3H #36, P4E #46, P4C #52, H1 #51, H2 #47, H3 #48 (P5A #37 merged by Can's Claude). P4G and P5F are lane C. Open follow-ups below, most urgent: the Floor-blanking bug behind the flaky Pixel 7 e2e, then H3's security gaps before G1.

## R2 · Redesign (owner request 2026-11-02, L19) — `docs/REDESIGN.md` + `docs/UX-AUDIT.md`
Order: **X1 → X2 → (X3 · X4 · X5 · X6 · X7 · X8 · X9 in parallel) → X10 → X11**. Every X-ticket stops after the PR is open + CI started; Leads review, watch CI, merge.

| ID | What | Engine | Lane | Status |
|---|---|---|---|---|
| X1 | Tokens, type, primitives (PlateBar, ListRow, SegmentedControl, ScreenHeader) | Codex Sol High | C | merged #65 (Lead review round 2: chunkier PlateBar, chalk primary) |
| X2 | App shell: tab bar Today/Train/Progress/Crew, headers, back | Codex Sol High | C | merged #66 (shell copy in src/app/shell/copy.ts → fold into copy.ts in X10) |
| X3 | Today (Floor rebuild, shared bar) | Codex or Grok | E | merged #68 (Lead screenshot review; e2e START helper fixed in round 2) |
| X4 | Train flow: 2 taps to first set, set list, dock, summary | Codex Sol High | C | merged #67 (Lead review: 4 UX changes + 3 e2e rounds; p5-session-375 Pixel 7 flaked once, passed on rerun) |
| X5 | Progress hub + exercise detail | Grok or Codex | E | merged #69 (Lead screenshot review: segments, e1RM hero, ⋯ sheet) |
| X6 | Day editor: compact rows + edit sheet | Grok | E | merged #71 (Lead screenshot review; round 2 fixed the week-strip axe label mismatch at source) |
| X7 | Crew centred on partner | Grok | E | merged #76 (Lead review on mock: round 2 hierarchy polish; Lead pushed feed-dot colour fix — Grok hit weekly limit) |
| X8 | Settings grouped sub-pages | Codex Sol High | C | merged #73 (Lead review round 2: section headers, switches; also fixed the midnight date bug in the ExerciseDetail test; theme radio → segmented in X11) |
| X9 | Onboarding: name/colour/target + explainer | Codex Sol High | C | merged #74 (Lead screenshot review, CI green first run) |
| X10 | Copy + date sweep | Grok | either | merged #77 (Lead review; carried to X11: date ranges use plain dates at both ends via src/core/formatDate.ts, delete label per activity type, legacy 'Athlete' name fallback, quick-log Save → per-action labels) |
| X11 | Visual regression + audit close-out | Codex Sol High | C | merged #78 — 66 WebKit baselines + carry-overs a–e. Backlog: pace axis shows "s/km" (should be min:sec per km) |

## R3 · Feel layer (friend request 2026-11-02, L20) — `docs/FEEL.md`
Order: **Y1 now** → Y2 + Y6 (after X3) → Y3 (after X4) → Y4 + Y7 (after Y3) → **Y5 (after X3-X7, before X11)**. Same review rule as R2, plus a GIF of the interaction.

| Ticket | What | Model | Lane | Status |
|---|---|---|---|---|
| Y1 | Feel kernel: `feel()`, synth sounds, iOS haptic, ScrubDial, CSS springs | Grok Build | E | merged #70 (iOS haptic on-device check still open: WebKit may ignore the switch trick) |
| Y2 | Muay Thai only: after-class 'Log class' card (2 taps), adjust, combos you remember, combo book | Grok Build | E | merged #75 (Lead ran it on mock: 2 taps → bar 1 of 3, combo book; Lead merged main for the Y6 copy/test conflict; one p7-shell Pixel 7 flake, passed on re-run) |
| Y3 | Load the bar: plate taps, dials, same again, swipe rows | Codex Sol High | E | merged #79 |
| Y4 | Rest ritual + full-screen rest | Codex Sol High (Grok out until ~8 Nov) | E | running |
| Y5 | Motion pass: tabs, list→detail, sheets, lockout, PR, shockwave | Codex Sol High | E | merged #80 (follow-up idea, not a ticket yet: AnimatedNumber for totals in session/stats/crew-feed/progress) |
| Y6 | Runs: dials, live pace, same as last, live run | Grok Build | E | merged #72 (Lead ran it at 375×812 on mock: wheel drag 5.0→5.6 km, live pace; round 2 layout polish, round 3 contrast) |
| Y7 | Voice log (experimental) | Codex Sol High (Grok out until ~8 Nov) | E | running |
| Y8 | Proof data: together links, photo bucket + RLS, offline upload (L21) | Codex Sol High | E | **waiting for lane C ack** (shared data contract) + friend's Codex |
| Y9 | Proof screens: together/photo prompt, Proof tab, viewer | Codex/Grok | E | queued (after Y8, Y2) |

**Midnight test bug (2026-11-03 00:45):** `ExerciseDetailScreen.test.tsx` used a UTC date while the screen labels Today in local time (red between local 00:00 and 01:00). Fixed on main by lane C in X8 (#73, profile timezone); lane E's duplicate fix was dropped in the merge.

**Engines (2026-11-03 00:20):** friend's Grok hit its weekly limit (resets 2026-11-08). Friend's Codex is back after 00:43. Remaining lane E work: Y3 (after X4), Y4, Y5, Y7, Y8 (needs lane C ack), Y9 → Codex, or wait for the Grok reset.

**Lane C:** X11 waits for Y5 (L20). **Order note for Can (friend's Claude, 2026-11-04):** X11 merged (#78) before Y5, against the R3 order. Nothing undone. Y5 moves screens, so it will refresh any X11 WebKit baselines it changes in its own PR; object here if lane C wants that handled differently. Y9 adds a 5th tab (Proof) to the X2 shell, and Y8 adds migration 0012 (L21). Ack/object here.

## Parked / follow-ups
- **Flaky e2e (seen twice, 2026-11-02, P3G #49 and H3 #48 PR runs):** `tests/e2e/p1-demo.spec.ts` + `p1-flight.spec.ts` on **Pixel 7** time out in `warmLazyRoutes` (`tests/e2e/helpers.ts:75`): the Floor `Weight` link is "detached from the DOM" while clicking, likely a Floor re-render (P3E/P4E duo moments, live data). Twin push runs pass. Fix: wait for the Floor to settle (e.g. `my-week` stable / moments idle) or navigate by URL in `warmLazyRoutes`. Until then: re-run failed jobs, don't merge on red. **Diagnosis (friend's Claude, 06:00):** `useRepoQuery` (`src/features/floor/useRepoQuery.ts`) builds a fresh store with `value = undefined` whenever its deps change; FloorScreen passes `crewTick` (P3E), so every crew delta pull blanks the Floor to its `aria-busy` shell and remounts the buttons (real UX flicker, and the detached `Weight` link in CI). Tried a keep-last-value fix: unit test proves it, and the detach failure stopped, but locally it produced a new p1-demo failure on Pixel 7 (MIN toast shown twice, strict-mode violation) that main does not show in 5/5 runs, so it was not pushed. Needs a proper ticket (Floor owner) that keeps the last value **and** guards the MIN double-tap/toast.
- **Flaky p1-demo / p1-flight on Pixel 7, new lead (friend's Claude, 2026-11-02 ~16:30):** with H6 applied, the failing run's page snapshot is the **/install** screen, not a blank Floor: AuthGate's first redirect waits on `repo.q.myCrew()` before deciding the install gate, so the Floor can paint, `reachFloor` returns, and the late redirect to /install detaches the `Weight` link. A quick fix (decide the install gate before the crew read) made it worse locally (3/10 fail, broke `SignInScreen.test.tsx`) and was not pushed. Needs a ticket on AuthGate's first-run ordering (lane C owns auth). Local Windows WebKit can't run these specs at all; judge on CI.
- **Axe color-contrast on PR takeover e1RM line (`takeover.css:36`)** made main's e2e flip red/green since P4H → folded into H7 as item 7.
- **H2 performance findings (L14):** LCP ~3.8 s on slow 4G (budget 2 s); `/settings` layout shift 0.799 (budget 0.05, a real bug); lhci measures `/install` for every URL until the mock gets an install-dismissed + signed-in seed. One perf ticket: fix seed + LCP + settings CLS, then make the `lighthouse` job blocking.
- **H1 accessibility findings (13, listed as `test.fixme` in `tests/e2e/p6-a11y.spec.ts` with file:line once H1 merges):** session steppers overflow at 375 px / 200% text on S5/S6/S8/S9 (`session.css:22-26`, same as the earlier lane C note) and S14 heading (`progress.css:18`); S6 tab order vs visual order (Warm-up wraps into RPE row, `LoggingCard.tsx:125-132`); RACK IT hold button aria-label doesn't contain the visible text (`LoggingCard.tsx:137`); set list scroll region not keyboard-focusable (`SetList.tsx:26`); prohibited `aria-label` on a span (S15 `DayEditorScreen.tsx:111`) and a pre (S16 `VaultExport.tsx:145`). Mostly lane C screens: one small UI fix ticket, then delete each fixme as it passes.
- **H3 security gaps:** G4 closed by P4H #54. G5 CSP, G6 handler-less functions, G7 default privileges → **H5** (owner's Codex, before G1 deploy). G1 `send_nudge`, G2 `settle_challenge`, G3 `save_push_subscription` → deferred to Phase 7, built with F24 push / F25 nudge / challenges (no open client write today).
- C4 (Phase 2): exercise-muscle contract + picker grouping (L7).
- Light-theme contrast fixes (DECISIONS L1) → Phase 4 visual ticket.
- Size budget: initial JS = entry + modulepreloads; the data layer (Dexie, zod, sync, adapters) is lazy-loaded in `App.tsx` (C5) → initial **100.5 / 170 kB**. Keep screens and backend libraries out of the static import graph.
- Dependabot #3 (setup-node v7): rebase requested; merge with human OK.
- Keep-alive must touch the **database**, not just the `health` function (R1 #9: only DB/API activity is documented to stop the free-tier pause) → at G1 point `HEALTH_URL` at a PostgREST read (e.g. `/rest/v1/exercises?select=id&limit=1` with the anon `apikey` header) or make `health` run `select 1`.
- Email: **no custom SMTP** (L6). At G1: invite the friend to the Supabase organization so built-in mail reaches him.
- Installed iOS app does **not** share Safari storage or open at `/join/<CODE>` (R1 #5) → B3 must show the code big with Copy/Paste/typing.
