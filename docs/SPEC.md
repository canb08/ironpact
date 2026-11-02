---
title: "SPOTTER - Build Prompt"
date: 2026-10-26
type: prompt
tags:
  - fitness
  - project
source: Claude workflow (research, design, 4 writers, errata critic)
status: seed
---
> Paste everything below the line into Claude Code (ultracode). [FRIEND]'s agent builds it; each of us gets the URL and our own export link.

---

## 0. What you are building and for whom

You are building **SPOTTER**, an installable, offline-first, dark "Iron & Chalk" gym PWA for a small crew of friends. Version 1 has two members, **the friend** and **[FRIEND]**, and must take a third member without schema changes.
It logs four kinds of training (lifting, martial arts, running, plus a MIN) and bodyweight. Each member sees the others' progress live on their phone: iPhone Safari PWA first, Android second.
The users need zero-friction logging. Logging must take almost no taps. Every commitment has a MIN that counts as done. The UI never guilt-trips anyone, and the app never asks to be maintained.
**Each user's own notes vault** (both the friend and [FRIEND] keep one, each run by their own AI agent) pulls that user's data, and only that user's, through a per-user, revocable, read-only export URL. The default format is a fixed line format; JSON and CSV are optional.
Everything runs on free tiers: Supabase, Cloudflare Pages and GitHub Actions. Nobody writes code by hand, and you build it end to end from this prompt. [FRIEND] does only the human steps in §8.

---

## 1. Ground rules for the building agent

### 1.1 Authority order inside this prompt
1. **This §1 decision register (§1.6)** wins over everything else, because it resolves contradictions explicitly.
2. If two sections still disagree: **§4 Architecture wins on technical matters**, **§3 Visual wins on look, feel, motion and copy**, and **§2 Product wins on features and rules**.
3. **§5, the export contract, is binding byte for byte.** Its golden fixtures are the acceptance test. Where §4 and §5 differ on export details, §5 wins.
4. The internal code name is **`ironpact`**: repo name, Dexie database name, package name and the export-token prefix `ipx_`. **Every user-facing string, including the manifest `name` and `short_name`, says `SPOTTER`.** Wherever §3 says "THE FLOOR" or §4 says "IRONPACT" in a user-visible place, write SPOTTER.

### 1.2 Non-negotiables
- **Never invent formula coefficients or platform facts.** The DOTS coefficients and bodyweight clamp must be copied from the OpenPowerlifting `opl-data` repository (the `coefficients` crate, DOTS module; find the exact file path, because the path in §2 is ⚠️). Put the URL and commit hash in a code comment, and unit-test against 3 published values from that source. If you cannot reach a primary source, **ship the DOTS badge disabled behind a flag and tell [FRIEND]**. Never guess. The same applies to every ⚠️ item in §2–§4: check it against MDN, caniuse, WebKit release notes or the vendor docs, record the finding and its source in `docs/PLATFORM-NOTES.md`, then implement the fallback that the spec names.
- **If a platform capability is missing, stop and ask; never fake it.** If an API that a feature depends on is unavailable or behaves differently on a real device, build the documented fallback. If no fallback is documented, stop that feature, write the question into the checkpoint report, and continue with other work. Examples: Wake Lock in an installed iOS PWA, `navigator.audioSession`, the iOS haptics checkbox trick, Web Share with files on iOS, Supabase's gateway accepting a non-JWT bearer, `web-push` on Deno. Do not stub a capability, label the stub "done", and move on.
- **Ask [FRIEND] only for the human steps** in §8: creating accounts, pasting keys, clicking dashboard toggles, running `supabase login`, and testing on a real phone. Everything else is yours. Ask for one batch of steps at a time, and give the exact screen path and the exact value to paste.
- **Secrets live in environment variables only.**
  - The browser gets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable) and `VITE_VAPID_PUBLIC_KEY`. Nothing else may carry the `VITE_` prefix.
  - The service-role or secret key, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` live only in Supabase Edge Function secrets. `SUPABASE_URL` and `SUPABASE_ANON_KEY` for keep-alive live only in GitHub Actions secrets.
  - `.env` is git-ignored, and `.env.example` lists every key with an empty value.
  - CI runs a secret scan (gitleaks or an equivalent grep for `sb_secret_`, `service_role`, `eyJhbGci` and `ipx_` in tracked files) and fails on a hit.
  - Never echo a secret in logs, commit messages or checkpoint reports.
- **No hardcoded people.** No names, surnames or emails in code, seed data, fixtures or copy. Test users are `alice@example.test` and `bob@example.test`. Display names come from `profiles.display_name`. `[FRIEND]` and `the friend` appear only in this prompt.
- **No server of your own.** Logic lives in Postgres (RLS, RPCs, triggers, `pg_cron`) or in Supabase Edge Functions. Cloudflare Pages serves static files only.
- **Commit per phase, and per green sub-step within a phase.** Use plain-English commit messages that name the phase, e.g. `P1: outbox replays on online/visibility, 20-set flight test green`. Tag the end of each phase `phase-N-done`. Never force-push `main`. Agents work on branches `pN/<area>` and merge to `main` only through the phase gate (§1.3 step 6).
- **Real devices beat emulators** for iOS claims. Playwright WebKit is not iOS Safari. Every "works on iPhone" claim in a checkpoint report either cites [FRIEND]'s on-device test or is marked ⚠️ unverified.

### 1.3 The multi-agent workflow (run this for every phase)
Use these roles. One agent may play several roles only where the table allows it.

| Role | Count | Owns | May not |
|---|---|---|---|
| **Lead / Planner** | 1 | the phase plan, file ownership map, merge order, checkpoint report | write feature code in the same phase it plans (it may fix merge conflicts) |
| **Builder: DB** | 1 | `supabase/migrations/*`, `supabase/seed.sql`, `supabase/tests/*`, RPCs, RLS, cron | touch `src/` |
| **Builder: Edge** | 1 | `supabase/functions/**` including `_shared/` | touch migrations (requests schema changes from Builder: DB) |
| **Builder: Data** | 1 | `src/data/*`, `src/core/*` | touch `src/features/*` UI |
| **Builder: UI** | 1–2 | `src/features/*`, `src/ui/*`, `src/router.tsx` | touch `src/data/*` (consumes its typed interface only) |
| **Builder: Platform** | 1 | `src/platform/*`, `src/sw.ts`, manifest, `public/_headers`, `.github/workflows/*` | — |
| **Adversarial Reviewer** | 1, fresh context each phase | review only | have written any code in this phase |
| **Tester** | 1 | `tests/**`, fixtures, Playwright, Lighthouse CI config | change product code (files bugs back to builders) |

**Per-phase loop:**
1. **Plan (Lead).** Write `docs/phases/PN-plan.md` containing:
   - the scope bullets copied from §6;
   - a file ownership map (every file has exactly one owning role);
   - the interfaces between areas, as TypeScript signatures and SQL function signatures, frozen before the build starts;
   - the risks, including every ⚠️ item this phase touches;
   - the definition of done copied verbatim.
2. **Parallel build (Builders).** Each builder works on its own branch against the frozen interfaces. Builder: Data provides a `VITE_BACKEND=mock` in-memory adapter behind the same interface on day one, so UI is never blocked on the backend. A builder that needs an interface change writes it into the plan file and asks the Lead, and does not just change it.
3. **Adversarial review (Reviewer, fresh context).** The reviewer reads the diff plus §2–§5 and **tries to break the phase**. It must at minimum try:
   - RLS bypass: insert with someone else's `user_id`; read a non-crewmate's data; read `export_tokens.token_hash`; read bodyweight while `show_bodyweight=false`.
   - Duplicate replay: the same outbox item sent twice, and a kill mid-flush.
   - Timezone: a set at 23:30 on Sun 25 Oct 2026 (the CEST→CET switch), and a session spanning midnight.
   - Export byte drift: `·` vs `.`, `×` vs `x`, a trailing newline, notes containing `·` or a newline.
   - Secrets: anything sensitive in `dist/`, the repo or CI logs.
   - Copy: banned words (§3) and red failure states.
   - Thumb zone: any primary workout action above the bottom 40%.
   - Reduced motion: confetti, shake or spin still present.
   The output is `docs/phases/PN-review.md`, a numbered list of findings, each with severity (blocker / major / minor), file, line, a reproduction, and the expected behaviour.
4. **Fix (Builders).** Every blocker and major is fixed or explicitly rejected with a reason the Reviewer accepts. Minors may roll forward, and are listed.
5. **Test (Tester).** Run the full suites: unit, pgTAP (or the Deno fallback against a throwaway local stack, **never production**), Playwright on `iPhone 15` (WebKit) and `Pixel 7` (Chromium), and Lighthouse CI on the preview build. Every DoD bullet maps to a test or a scripted manual check. Record results in `docs/phases/PN-test.md`.
6. **Gate (Lead).** Merge in this order: DB → Edge → Data → Platform → UI → Tests. Then rerun CI on `main`, deploy, run the phase demo script (§6) against the deployed URL, and tag the phase. Send [FRIEND] the **checkpoint report**:

```
SPOTTER · Phase N checkpoint
Deployed: <url> (commit <sha>)
Done: <DoD bullets, each ✅ with the test that proves it>
Not done / rolled forward: <list or "none">
⚠️ Unverified on real device: <list>
I need from you (≤10 min): <numbered human steps, exact screen paths> | "nothing"
Demo to try on your phone: <the phase demo script, 3–8 steps>
```

Do not start Phase N+1 until Phase N's gate is green **and** any human step it needs is confirmed done. You may plan the next phase while waiting.

### 1.4 Working conventions
- TypeScript `strict: true`. No `any` in `src/core` or `_shared`.
- `src/core` and `supabase/functions/_shared` are pure: no I/O, no React, no `Date.now()` inside (time is injected), with ≥95% line coverage.
- One formatter. `_shared/export-format.ts` is imported by the app (alias `@shared`) and by the `export` function. The in-app export preview and the server output must come from the same code.
- Every write goes through the outbox (§4). No component calls Supabase directly for user data.
- Every copy string lives in `src/ui/copy.ts` and is checked by a test against the banned-word list in §3.
- Pin exact dependency versions at scaffold; the majors are fixed by §4. Record the chosen exact versions in `docs/STACK.md`.
- `docs/SETUP.md` (= §8 verbatim, kept current), `docs/EXPORT.md` (= §5, plus whichever auth header actually works) and `docs/PLATFORM-NOTES.md` are deliverables. They are not optional.

### 1.5 Scope discipline
MVP features (F1–F19 in §2) ship in Phases 1–6. v1 features (F20–F31) ship in Phase 7. Stretch items ship only if [FRIEND] asks after Phase 7 and both phones pass the acceptance checklist (§9). Never pull eye-candy (motion, particles, sound, textures, 3D) into Phase 1 or 2.

### 1.6 Decision register (contradictions resolved)
This list is binding on every section.

| # | Topic | Conflict | Decision |
|---|---|---|---|
| D1 | Name | SPOTTER / THE FLOOR / IRONPACT | User-facing **SPOTTER**; internal code name `ironpact` (repo, Dexie DB, token prefix `ipx_`). |
| D2 | Bottom nav | Floor·Log·Crew·Progress vs Today·Log·Duo·You | **Floor · Log (raised molten centre) · Crew · Progress**; Settings sits behind the avatar. |
| D3 | Invite code | 6 chars vs 10-char Crockford base32 | **10 chars Crockford base32**, sha256-hashed, single use, 7 days. S3 shows it as **2 groups of 5 boxes**. Link `https://<app>/join/<CODE>` prefills it. |
| D4 | Sign-in | magic link vs OTP | **6-digit email code** (`signInWithOtp` + `verifyOtp`) is the primary method. A magic link is a browser-only fallback. |
| D5 | Credits per day | max 2 vs max 1 | **Max 2.0 credits per local day** (gym/run/martial session = 1, MIN = 0.5). Weekly target default 3, range 1–7. |
| D6 | Duo chain | The Bar (plates ±1) vs streak drop to the previous tier's lower bound, plus freezes | **The Bar from §2**: both FULL +1 plate, both ≥HELD no change, anyone REST −1 plate unless spotted; never more than −1 per week, never a reset. **Freeze tokens are not built.** `streak_tokens.kind='freeze'` stays in the schema, unused. |
| D7 | Tier names and colours | plate tiers vs flame tiers | Names from §2: **Iron 0–3 · Steel 4–7 · Titanium 8–15 · Obsidian 16+ plates**. The forge-flame outer colour maps in order: Iron `#B87333`, Steel `#9AA0A6`, Titanium `#7FA7C9`, Obsidian core `#1A1420` with a molten rim. The flame plate shows the **plate count**, labelled `PLATES`. Tier drop copy is "Down a tier. One week gets it back." |
| D8 | Spot | logging +1 beyond target vs "I got you" tap | Offered from **Sunday 12:00 crew time** when a partner is heading for REST **and** the spotter's week credits ≥ own target + 1. The spotter taps "I got you". There is 1 spot per member per calendar month, with no rollover. Recorded in `streak_tokens(kind='spot', covers_user_id)`. |
| D9 | Readiness scale | 0–2 per row, total ≤2 vs 1–3 per row, sum ≤4 | **Stored 1–3 per row** (`readiness jsonb`); MIN is suggested when the **sum is ≤5** (equivalent to §2's 0–2 total ≤2). |
| D10 | Progression nudge without RPE | nudge vs no nudge | **Nudge** if every working set reached its target reps and either max RPE ≤8 or no RPE was logged at all. No nudge after a gap of more than 14 days. |
| D11 | Push events | partner PR pushes vs PRs never push | **§2 §4 table wins**: partner PR push (on after opt-in), nudge, weekly recap, spot available, partner started session (off by default). Hype reactions never push. Cap 3 per recipient per day; quiet hours 22:00–08:00 in the recipient's tz. |
| D12 | Export details | §2 vs §4 (runs per session vs per day; RPE rule; note cap; in-day ordering) | **§5 is authoritative.** If §5 is silent, §4 (technical) wins: runs summed per day, martial arts summed per discipline per day, RPE = max over working sets, notes are distinct set notes joined with `; ` and capped at 120 characters, in-day order is Weight → lifts (by first `logged_at`) → martial arts → Run → MIN. |
| D13 | Vault export ownership | the docs say "the friend's vault" | **Symmetric.** Every user has their own tokens (max 3 active), their own format setting (`profiles.export_format in ('lines','json','csv') default 'lines'`, overridable per request with `?format=`) and a **Copy for my AI** button. A token only ever returns its own user's rows. |
| D14 | Ranges | RPE 6–10 vs 5–10; bodyweight 30–250 vs 30–300; display name 16 vs 20 | DB checks follow §4 (RPE 5–10 step 0.5, bodyweight 30–300, `display_name` 1–20). The UI offers RPE **6–10** and caps names at **16** characters. Out-of-range input shows "That's a world record. Check it." |
| D15 | Rest overlay position | top 60% vs bottom 55% glass sheet | **§3 wins**: a glass sheet covers the bottom 55%, with controls at 64px, and swipes down to a 56px pill. The set card stays visible above it. |
| D16 | Timer-zero vibration | `[200,100,200]` vs `[80,60,80,60,200]` | `[80,60,80,60,200]` (Android only). Set logged `[18]`, PR `[30,40,30,40,120]`. |
| D17 | Budgets | JS 200 vs 170 KB; fonts 180 vs 220 KB | CI fails above **170 KB** initial JS gzip and **220 KB** of fonts; aim for ≤180 KB of fonts and drop Anybody first. |
| D18 | Martial-arts list | two lists | BJJ, Muay Thai, Boxing, Kickboxing, Judo, Wrestling, MMA, Karate, plus free text up to 16 characters. |

---

## 2. Product spec

> This section covers **what** the app does. Look and feel is in §3, technical shape in §4 and the vault export format in §5. Where the three source design docs disagreed, the decision is stated inline as **Decision:**, using these rules: Product doc wins on features, Visual doc wins on look and feel, Architecture doc wins on technical matters.
>
> UI copy uses `{me}` and `{partner}` for display names read from `profiles.display_name`. No name, surname or email appears in code or seed data. "Partner" means any other crew member; every rule below holds for N members (soft cap 8).

### 2.0 Name and global decisions

- **Product name: SPOTTER.** It is used everywhere a user sees a name: wordmark, manifest `name` and `short_name`, the `<title>`, story cards and push titles.
  - **Decision:** The Visual doc's working title "THE FLOOR" and the Architecture doc's "IRONPACT" are retired as user-facing names.
  - `ironpact` stays as the repo name, the Dexie database name and the export token prefix (`ipx_`), because those are technical identifiers.
- **Bottom nav: Floor · Log · Crew · Progress.** Log is the raised centre button, in molten. Settings is reached from the avatar at the top right of Floor.
  - **Decision:** The Product doc's tab names win over the Visual doc's "Today · Log · Duo · You". The nav styling follows §3.
- **Voice:** follows §3's copy-voice rules. Every string in quotes in this section is final copy and is built as written.
- **Units:** kg and km only. There is no lb or mile toggle.
- **Time:** weeks run Monday 00:00 to Sunday 23:59:59 in the **crew timezone** (`crews.tz`, default `Europe/Amsterdam`). Personal display uses the device timezone. Each entry's day is its stored `local_date` (§4).

### 2.1 Core loop

**Open → tap START → readiness (1 tap or Skip) → S6 opens on the predicted exercise, prefilled from last time → LOG SET (1 tap) → rest timer runs by itself → repeat → hold RACK IT → summary card → partner sees it live.**

The weekly layer works like this:
- Every session adds credit to your own ring and to the co-op ring.
- When everyone hits their target, a plate loads onto **The Bar**, the shared chain.
- A bad week costs one plate. The bar never drops to zero in one step.

### 2.2 Credit, week and chain rules

This is the one rule set. Every screen, push, recap and server job uses these rules and nothing else.

| Rule | Value |
|---|---|
| Completed gym, martial-arts or run session with ≥1 non-warm-up entry | **1 credit** |
| MIN entry (or a session started from readiness "Do MIN") | **0.5 credit** for a MIN entry. A "Do MIN" *session* counts **1 credit** as a session and carries a MIN tag (Flow 6) |
| Max per local day | **2 credits** |
| Personal weekly target | **3** by default, editable 1–7 (`profiles.weekly_target`) |
| Week status | **FULL** ≥ target · **HELD** ≥ 0.5 and < target · **REST** = 0 |

- **Decision on the daily cap:** the Architecture doc's cap of 1.0 credit per day is overruled by the Product doc's 2. This is a feature rule.
  - Two sessions in one day count, because a double day is real training.
  - The cap stops a person farming credits with MINs: a 2-credit day can't be stretched further with extra MINs.
  - `core/credits.ts` implements exactly this table.
- **The Bar (duo chain, counted in plates; 1 plate = 1 week):**

| Week outcome (all members) | Bar change | Copy |
|---|---|---|
| Every member FULL | +1 plate | "CLOSED. Both of you. That's the job." (N>2: "CLOSED. All of you. That's the job.") |
| Every member at least HELD, at least one not FULL | no change | "Bar held." |
| Any member REST and not spotted | −1 plate (floor 0) | "Rest week. The bar will wait." |
| Any member REST, every REST member spotted | no change | "{partner} spotted you. Week saved." |

- **Tiers** by plate count:

  | Plates | Tier |
  |---|---|
  | 0 | Bare bar |
  | 1–3 | Bronze |
  | 4–7 | Iron |
  | 8–15 | Steel |
  | 16+ | Obsidian |

  - **Decision on mechanics:** the Product doc wins (−1 plate per bad week).
  - **Decision on tier names and colours:** the Visual doc wins (Bronze/Iron/Steel/Obsidian, colours in §3). The Product doc's "Iron/Steel/Titanium/Obsidian" naming is retired.
  - **Decision on the drop rule:** the Architecture doc's "drop to the lower bound of the previous tier" rule is retired. One bad week costs exactly one plate, and the tier follows from the new count.
  - **Decision on freezes:** the Architecture doc's auto-applied freezes are not used. Spots are the only cover, because HELD weeks already protect the bar. The `streak_tokens.kind` enum keeps `'freeze'` for later.
- **Personal "weeks on" count:** consecutive weeks at HELD or better, shown on your own ring card.
  - A REST week takes it down by 1. It never resets to zero in one step.
  - The current week is "in progress" and never changes the count before it ends.
- **Spots:**
  - Each member gets **1 spot per calendar month** (crew timezone). Unused spots don't roll over.
  - A spot can be offered from **Sunday 12:00** crew time, when a partner's credits for the week are 0.
  - To spot him, the spotter must log credits ≥ **own target + 1** that same week, then tap "I got you". If the spotter hasn't reached target + 1 yet, the card says "Log one past your target and you can spot him."
  - The cover is recorded as a `streak_tokens` row (`kind='spot'`, `covers_user_id`). Both members see "{spotter} spotted you."
- **Week close:**
  - Computed server-side **Monday 00:05** crew time. The client also computes it on open; if they disagree, the server result wins.
  - Edits to a closed week recompute that week only if its status changes. The Bar then shows "Bar adjusted after edit."

### 2.3 Feature list

**MVP** ships in Phase 1 and Phase 2 (§6) and must be excellent. **v1** is the next pass. **Stretch** comes only after v1 is solid on both phones. Acceptance criteria are written as Given / When / Then. Each feature's AC are the minimum test cases for §7.

#### MVP

**F1. Crew and invite (built for N members)**

Tables (§4): `crews`, `crew_members`, `crew_invites`.

- **AC1.1**
  - Given a signed-in user with no crew,
  - when he taps "Start a crew",
  - then `create_crew` runs, he becomes `role='owner'` and he gets accent Volt (hue ≈125).
- **AC1.2**
  - Given an owner on S12,
  - when he taps "Invite",
  - then `create_invite` returns a **10-character Crockford base32 code**, shown as two groups of 5 (`K7F2Q-9MXRA`), plus a link `https://<app>/join/<CODE>` valid **7 days**, single use. Any older unused invites are revoked.
  - **Decision:** the Architecture doc's 10-character hashed code beats the Product doc's 6-character code. This is a security matter.
- **AC1.3**
  - Given a valid code,
  - when a signed-in non-member calls `redeem_invite`,
  - then he becomes a member, the invite is marked used, and every member's Floor shows the new ring segments within 3 s (Realtime) or on next open.
- **AC1.4**
  - Given a used, expired or revoked code,
  - when it is redeemed,
  - then the user sees "Code's dead. Ask for a new one." and nothing changes.
- **AC1.5**
  - Given a crew of 2,
  - when a third member joins,
  - then no schema or code change is needed, the co-op ring has 3 × target segments and every duo rule in §2.2 applies to 3 members.
- **AC1.6**
  - Given a crew of 8,
  - when an invite is created,
  - then it is refused with "Crew's full (8)."
- **AC1.7**
  - Given user C in no shared crew,
  - when C queries any user-data table,
  - then C gets no rows from A or B (row-level security; pgTAP test in §7).

**F2. Install-first onboarding**

- **AC2.1**
  - Given iOS Safari with `display-mode: standalone` false,
  - when any route loads,
  - then S1 shows full screen with the animated Share → Add to Home Screen → open-from-icon guide.
- **AC2.2**
  - Given S1,
  - when the user taps "Skip",
  - then the app continues and a chip on Floor reads "Install to keep your data safe". Tapping the chip reopens S1.
- **AC2.3**
  - Given Android Chromium that has fired `beforeinstallprompt`,
  - when S1 shows,
  - then an "Install" button triggers the stored prompt.
- **AC2.4**
  - Given the app running standalone for the first time,
  - when onboarding finishes,
  - then `navigator.storage.persist()` is called once and its result is stored in `meta`.
- **AC2.5**
  - Given the first standalone launch,
  - when onboarding finishes,
  - then a single info card says "Timers can't ring while the phone is locked. Keep the screen on during rest." It is shown once and dismissed for good.

**F3. Thumb-zone logging UI**

- **AC3.1**
  - Given S6 on a 375×667 viewport,
  - when a Playwright test records the bounding box of every primary control,
  - then all of them sit in the bottom 40% of the viewport.
- **AC3.2** Target sizes:
  - LOG SET is a 72px full-width bar.
  - Undo, timer ±15 and Skip are ≥64px.
  - Every other target is ≥48px, with ≥8px gaps.
- **AC3.3** Steppers:
  - Given the kg stepper, when − or + is tapped, then the value changes by **±2.5 kg** (or `exercises.increment_kg`).
  - The reps stepper changes by ±1.
  - A long press repeats every 120 ms after a 400 ms hold.
- **AC3.4**
  - Given a stepper number,
  - when it is tapped,
  - then a numeric keypad sheet opens (`inputmode="decimal"` for kg, `numeric` for reps). It accepts 0.25 kg steps and validates per §2.7.

**F4. Same-as-last-time prefill and next-exercise guess**

- **AC4.1 (next-exercise guess)**
  - Given a new gym session,
  - when S6 opens,
  - then the first exercise is the first exercise of the user's most recent gym session.
  - When the user moves to the next exercise, the guess is the exercise that followed the current one in the most recent session where both appeared, in order.
  - If there is none, it is the user's most frequent exercise on this weekday over the last 8 weeks.
  - If there is none, the picker (S7) opens.
  - **Decision:** the Product doc's sequence rule wins over the Architecture doc's "most often followed" rule. This is a feature rule.
- **AC4.2 (prefill)**
  - Given an exercise with history,
  - when it opens,
  - then set *n* is prefilled with set *n* (kg, reps, RPE cleared) from the most recent non-deleted session containing that exercise. Sets past the last one copy the last set.
- **AC4.3**
  - Given an untouched prefilled row,
  - when LOG SET is tapped,
  - then the set is saved in exactly **1 tap**.

**F5. Progression nudge**

- **AC5.1** The nudge appears when both of these hold:
  - Given the last session of an exercise had every working set at reps ≥ `rep_target` (or ≥ the prefilled reps) **and** either a logged max RPE ≤ 8 **or** no RPE logged at all,
  - when the exercise opens,
  - then a molten chip "+2.5 → 82.5" shows above the stepper, with the sub-copy "All reps at RPE 8. Add 2.5." (or "All reps hit. Add 2.5." when no RPE was logged).
  - **Decision:** the Product doc wins. A missing RPE still nudges; the Architecture doc's "no RPE → no nudge" rule is retired.
- **AC5.2**
  - Given an exercise tagged lower-body compound (squat, deadlift, hip thrust, leg press) and Settings "Big jumps" on (off by default),
  - then the suggestion is +5 kg.
- **AC5.3**
  - Given the chip,
  - when it is tapped,
  - then every remaining working set's kg rises by the increment.
  - It is never applied automatically.
- **AC5.4**
  - Given more than 14 days since the last session of that exercise,
  - then no nudge shows.

**F6. Rest timer** (look per §3)

- **AC6.1** Start:
  - Given a set is logged, then the timer starts with `ends_at = now + rest`.
  - Rest defaults to 120 s for compounds and 90 s for isolation, editable per exercise and remembered.
- **AC6.2** Remaining time is always `ends_at − now`, never a counted-down number.
  - Given the app was backgrounded for 70 s of a 120 s rest, when it returns, then it shows 0:50 ± 1 s.
- **AC6.3** Controls: ±15 s and Skip.
  - Swiping down shrinks the overlay to a 56 px pill above the workout bar that keeps counting.
- **AC6.4** Wake lock:
  - Given an active session, then Wake Lock is requested on session start, on every timer start and on every `visibilitychange → visible`.
  - If it is unsupported or rejected, a muted, looping 1-second video runs as a fallback and a chip says "Screen may sleep".
- **AC6.5** Given the timer reaches 0, then all of these fire together:
  - one 300 ms full-screen molten flash (never more than 3 flashes per second);
  - the bell sound, if sound is on;
  - `navigator.vibrate([80,60,80,60,200])` where the API exists (Android only);
  - the text "Bar's loaded."
  - Then the overlay shrinks to a header chip counting "+0:12 over".
  - **Decision:** the Visual doc's haptic patterns beat the Architecture doc's `[200,100,200]`. This is feel.
- **AC6.6** `aria-live="polite"` announces only at 10 s and 0.
- **AC6.7** Logging the next set resets the timer.

**F7. PR moment and estimated 1RM**

- **e1RM (Epley):**
  - `kg × (1 + reps/30)` for reps 2–12;
  - equal to the weight at 1 rep;
  - not computed above 12 reps.
- **PR types**, highest tier fires per set:
  1. **e1RM** (highest estimated 1RM)
  2. **rep-max** (heaviest kg at that exact rep count, 1–12)
  3. **volume** (highest single-session Σ reps×kg for the exercise)
  4. For runs: **distance** (longest) and **pace** (fastest at a matching distance bucket, ±5%).
- **Decision:** `pr_type 'bw_low'` is never fired. The app celebrates effort, never body changes (§3 voice).
- **AC7.1**
  - Given an exercise with ≥1 earlier session,
  - when a working set beats a derived best,
  - then S9 plays (Flow 4) and a `pr_events` row is written through the outbox.
- **AC7.2**
  - Given the first-ever session of an exercise,
  - then no PR fires and a quiet toast says "Baseline set".
- **AC7.3** Warm-up sets never count toward a PR.
- **AC7.4**
  - Given one set that beats both e1RM and rep-max,
  - then only "e1RM PR" fires.
- **AC7.5** The PR check runs on local history, so it works offline. The server re-checks on sync.
  - If the server disagrees, the `pr_events` row is soft-deleted and the partner never sees it.

**F8. Undo / swipe away**

- **AC8.1**
  - Given a set was just logged,
  - then its row shows "Undo" (≥64px) for **8 s**.
  - Tapping it soft-deletes the set (`deleted_at`) and stops its timer.
- **AC8.2**
  - Given any set row,
  - when it is swiped left past 40% of its width,
  - then it is soft-deleted and a toast "Undone · Restore" shows for **5 s** in the thumb zone.
- **AC8.3**
  - Given a deleted set created a PR,
  - then the matching `pr_events` row is soft-deleted in the same outbox batch, PRs are re-derived, and the partner's feed card for that PR is removed on his next pull or Realtime event.

**F9. Offline-first** (mechanics in §4)

- **AC9.1** Every write goes to Dexie and the outbox first, with a client UUID. The UI updates in < 50 ms.
- **AC9.2** Each entry shows a sync state:
  - grey tick: saved on phone;
  - chalk tick: synced.
  - The header ring shows the outbox count.
- **AC9.3** The queue replays on app open, on `online`, on `visibilitychange → visible`, every 30 s while visible, and right after a write when online.
- **AC9.4 (flight-mode test)**
  - Given airplane mode,
  - when 20 sets are logged, the app is killed and it is reopened online,
  - then exactly 20 `sets` rows exist on the server and none is duplicated.
- **AC9.5**
  - Given a write that fails 4xx validation,
  - then it is marked dead, and Settings shows "1 entry couldn't sync" with Retry / Discard.
  - The queue keeps flowing.

**F10. Set-by-set logging**

- **AC10.1** Every set stores its own kg, reps, optional RPE and `is_warmup`.
  - The RPE pill row offers 6, 6.5 … 10.
  - The database also accepts 5–10 (§4).
- **AC10.2**
  - Given an exercise of `kind='bw_lift'`,
  - then the kg stepper edits **added** load. It defaults to 0, can go negative for assisted variations, and is labelled "BW +".

**F11. Workout mode**

- **AC11.1** START creates a `sessions` row and the header shows the session clock `mm:ss`, or `h:mm:ss` past an hour.
- **AC11.2** Finishing:
  - Holding RACK IT for **600 ms** while a ring fills sets `ended_at` and opens S10.
  - Releasing early cancels and shows "Hold to rack it."
- **AC11.3**
  - Given no set logged for **3 hours**,
  - then the session closes itself with `ended_at = last set + 5 min`.
- **AC11.4**
  - Given a session is open,
  - when START is tapped again,
  - then the app says "Finish or discard the open one" and gives two buttons.

**F12. Run, martial-arts, bodyweight and MIN logging** (S11)

- **AC12.1 Run:**
  - distance in km, 2 decimals, range 0.1–100;
  - duration via `mm:ss` / `h:mm:ss` wheels;
  - pace is computed and shown live as `5:19 /km`;
  - optional RPE and note.
- **AC12.2 Martial arts:**
  - Discipline preset chips: BJJ, Muay Thai, Boxing, Kickboxing, Judo, Wrestling, MMA, Karate, plus **Other**, which takes free text of up to 16 characters.
  - Minutes 1–480, optional rounds, RPE and note.
  - **Decision:** this list is the union of both docs.
- **AC12.3 Bodyweight:**
  - kg to 1 decimal, range 30–250.
  - Given an entry already exists today, when another is saved, then the earlier one is soft-deleted and replaced.
- **AC12.4 MIN:**
  - One tap on Floor's MIN button logs the default label "20m walk" (editable in Settings).
  - A long press opens a sheet with recent labels and free text (1–40 characters).
  - The whole thing takes ≤2 taps.
  - The toast reads "MIN day. Still counts. Chain's alive."

**F13. Readiness check**

- **AC13.1**
  - Given a gym session starts,
  - then S5 shows 3 rows (Sleep, Soreness, Energy) of 3 emoji each, plus "Skip".
  - Each row takes 1 tap. Values are stored 1–3 in `sessions.readiness` (§4).
- **AC13.2**
  - Given the total is ≤5 (the stored-scale equivalent of the Product doc's "≤2 on 0–2"),
  - then the suggestion reads "Running on fumes? MIN today. It counts the same." with **Do MIN** and **Full send**.
  - **Decision:** storage follows the Architecture doc's 1–3 scale; the threshold follows the Product doc.
- **AC13.3** **Do MIN** builds a session with:
  - the first 2 exercises of the last gym session;
  - 2 sets each;
  - kg at 90% of last time, rounded down to a loadable weight.
  - `sessions.mode = 'min'`.
- **AC13.4** Readiness never blocks, never uses a warning colour and is never exported or shown to the partner.

**F14. Weekly ring (personal and co-op) and The Bar**

- **AC14.1** Floor shows your ring plus the co-op ring of **Σ members' targets** segments.
  - Each member owns a contiguous arc, filled with their colour and pattern (§3).
  - A MIN fills a half-thickness segment.
- **AC14.2**
  - Given credits change (yours locally, or a partner's via Realtime),
  - then segments fill within 3 s, with the HEAVY spring.
- **AC14.3** The Bar strip shows the plate count, the tier name and a pending plate in ghost style once the week is already FULL for everyone.
- **AC14.4**
  - Given Sunday ≥12:00 crew time, a partner at 0 credits, an unused spot this month and the viewer at ≥ target + 1,
  - then a "Spot {partner}" card with "I got you" appears on Crew.
- **AC14.5**
  - Given Monday 00:05 crew time,
  - then the server closes the week per §2.2.
  - Every member's next open shows the result once: the Tier-1 ring close for +1, or a quiet fade otherwise.

**F15. Live crew feed and presence**

- **AC15.1**
  - Given both members are online,
  - when A logs a set,
  - then it appears in B's Crew feed in ≤3 s.
- **AC15.2**
  - Given A has an active session,
  - then B's Floor and Crew show the banner "{partner} is on the floor · Bench 3/5 · 14 min" with a pulsing dot in A's colour.
  - The banner disappears 2 min after A's last activity, or immediately when A finishes.
  - **Decision:** the copy follows the Visual doc's voice. Its fields are exercise, set number / planned sets, and minutes.
- **AC15.3**
  - Given a Realtime disconnect,
  - when the app becomes visible,
  - then the channel re-subscribes and a delta pull runs. The feed is correct even if Realtime never delivered anything.

**F16. Comeback mode**

- **AC16.1**
  - Given ≥5 days since the user's last credit,
  - then Floor replaces the rings with "Welcome back. You owe nothing. 20 minutes?" and two buttons: **20-min session** and **Just log MIN**.
- **AC16.2** No missed-day count, no red, no streak-loss animation.
- **AC16.3** The next credit restores the normal Floor.
- **AC16.4** The partner's view of this user just says "Last trained 6 d ago", in muted neutral text.

**F17. Per-user vault export (symmetric)**

Every member has their own notes vault and their own agent. The export is per user and identical in mechanism for everyone. Formats, rules and fixtures are in §5. This feature covers only the product behaviour.

- **AC17.1** Generating a token:
  - Given any user on S16 → "Vault export", when he taps "Generate token", then an `ipx_…` token is shown **once**, with Copy.
  - At most 3 tokens can be active per user, each with a label (default "My vault").
- **AC17.2** Revoking:
  - Given a token, when "Revoke" or "Revoke & regenerate" is tapped, then the old token returns 401 immediately.
- **AC17.3** Scope:
  - Given user A's token, when the export is called, then the response holds **only A's own entries**.
  - It never holds partner data, readiness, reactions or nudges. B's token holds only B's.
- **AC17.4** Format setting:
  - Given S16 → "Export format" with options **Lines (default) / JSON / CSV**, when it is changed, then `profiles.export_format` updates and the endpoint returns that format by default.
  - A `?format=lines|json|csv` query parameter overrides it per request.
- **AC17.5** Errors:
  - Given a wrong or revoked token, then 401 with an empty body.
  - More than 60 requests an hour → 429.
  - No entries → 200 with an empty body.
- **AC17.6** "Copy for my AI":
  - Given S16 → Vault export, when "Copy for my AI" is tapped, then the clipboard receives the text block in §2.5.
  - The token is **not** included; the block says where to paste it.
  - The toast reads "Copied. Paste it to your agent."
- **AC17.7** Preview:
  - Given S16 → Vault export, then a "Preview (last 7 days)" panel renders the user's own entries through the shared formatter (§4), in the chosen format.
  - It is the same code as the server, so the two can't drift.

**F18. Per-lift trend chart (basic)**

- **AC18.1** S14 shows:
  - a line of best e1RM per session over 12 weeks;
  - the 3 most recent sessions;
  - the PR list.
- **AC18.2**
  - Given "Show {partner}" is toggled on,
  - then his line overlays dashed in his colour, and **both lines are rebased to % of each person's own first value** in the window.
  - Raw kg stays on the owner's line only.
- **AC18.3**
  - Given fewer than 2 sessions,
  - then the empty state reads "Two sessions and the lines start drawing."

**F19. Visual system** — look per §3.

- **AC19.1** WCAG AA contrast is enforced by the token test.
- **AC19.2** `prefers-reduced-motion` or the in-app toggle removes shake, particles, spin, parallax, breath and 3D.
- **AC19.3** CLS ≤0.05 (§7 budget).
- **AC19.4** The Lighthouse installability check passes.

#### v1

| # | Feature | Acceptance criteria (G/W/T) |
|---|---|---|
| F20 | **Plate calculator + warm-up generator** | **G** a target kg **W** it opens **T** it shows per-side plates from the inventory (default bar 20 kg; plates 25/20/15/10/5/2.5/1.25, editable), with "PER SIDE: 25 + 10 + 2.5". An unloadable weight rounds down and shows "Closest: 81.25". **G** a working weight **W** "Warm-ups" is tapped **T** it inserts bar×10, 40%×5, 60%×3, 80%×1, each rounded down to a loadable weight, duplicates removed, all `is_warmup=true`, in 1 tap. |
| F21 | **Ghost row** | **G** a previous session with set *n* **W** set *n* is active **T** a 40%-opacity row shows "Last time: 5×80 @8". **G** the logged set has kg ≥ ghost kg and reps ≥ ghost reps, or e1RM > the ghost's **T** the row border turns gold and the toast reads "Ghost's behind you.", with no sound. Runs show a ghost pace from the last run in the same ±5% distance bucket. |
| F22 | **Rep-max table + PR wall** | **G** S14 **T** a 1RM–12RM matrix of actual best plus e1RM-derived value, with the date on tap. **G** Crew **T** a PR wall of each member's last 10 PRs, shown as **% over previous best**, never as raw kg. |
| F23 | **Hype reactions** | **G** a partner's set, session or PR **W** it is long-pressed **T** a picker of `fire`, `gorilla`, `skull`, `flex`, `light_weight` appears (chips: 🔥 🦍 💀 💪 "LIGHT WEIGHT"). Max **3 per sender per target**. **G** a received reaction **T** it shows as an overlay at the receiver's next rest-timer start, or on next app open, and is **never a push**. **Decision:** the Architecture doc's 5-value enum is used; the Product doc's cap of 3 applies. |
| F24 | **Web Push** | **G** a user **W** they tap Settings → "Turn on notifications", or the post-first-PR prompt "Want to know when {partner} PRs?" **T** permission is requested. On iOS this is offered only when standalone (16.4+); in an iOS browser tab the button reads "Install first to get notifications". Rules are in §2.6. |
| F25 | **Nudge** | **G** a partner **W** "Nudge" is tapped on Crew **T** the push "Gym's open. MIN counts." is sent. Limits: one per sender per recipient per day; nothing during the recipient's quiet hours (22:00–08:00 in his tz); if the sender's last 2 nudges were ignored (the recipient logged no credit within 24 h of each), sending is disabled with "Nudges paused till {partner} logs something." **Decision:** the Product doc's definition of "ignored" (no credit) beats the Architecture doc's "unseen". |
| F26 | **Muscle heatmap** | **G** a week of sets **T** front and back SVG regions shade by weekly sets per muscle (primary 1.0, secondary 0.5), in 5 steps: 0 · 1–4 · 5–9 · 10–14 · 15+. The duo view shows bodies side by side. Tapping a region opens "Chest · 9 sets this week · last hit Tue". Advisory only. |
| F27 | **Shorthand command bar** | **G** S7's search field **W** the user types `bench 80 5 5 5 @8` **T** a live preview shows 3 sets of 5×80 at RPE 8 before Confirm. It also parses `bench 80x5x3`, `run 5.2 27:40`, `bjj 60 @7`, `bw 78.4`, `min walk`, with fuzzy matching on names and aliases. iOS dictation works in this field. |
| F28 | **Story cards** | **G** S10 or S9 **W** Share is tapped **T** a 1080×1920 PNG is generated and passed to `navigator.share({files})` when supported, otherwise downloaded. Bodyweight never appears on a card. |
| F29 | **Weekly recap** | **G** Sunday 19:00 in **each recipient's own tz** **T** one push "Week's in. See the card." opens S17: Rings · PRs · The Bar · Roast (one line from a curated bank of 40 that never mocks a person). **Decision:** per-recipient tz (Architecture doc's delivery) instead of crew tz; for a same-city crew they are the same. |
| F30 | **Duels + 4-week seasons** | §2.8. Opt-in per person. Seasons start on a Monday; the final Season Card goes to a trophy archive. |
| F31 | **Temptation bundle** | **G** a pinned link (`profiles.gym_treat_url`) **W** a session is active **T** an "Unlocked" chip opens it. The chip is hidden otherwise. |

#### Stretch

These are not built until v1 passes §9 on both phones:
- 3D barbell on the plate calculator (lazy chunk, `frameloop="demand"`, DPR ≤1.5, SVG fallback).
- Monthly and yearly "Duo Wrapped".
- Train-together mode: a shared session clock via `together_id`, a merged feed, and a co-op segment drawn with a molten inner glow.
- Challenge stakes: text ≤80 characters with the partner as referee. No money moves in the app.
- Cross-modality training load with an acute:chronic advisory.
- Passkeys.
- In-app voice on Android.
- Recovery % per muscle (advisory only).
- One Lottie "plate crack" animation on PRs.

### 2.4 Screens

Every screen lists purpose, layout top to bottom, primary action, and these states:
- **Empty**
- **Loading**: local data renders first; skeleton blocks only where data isn't on the phone yet; never a full-screen spinner after first sync.
- **Offline**: a slim chalk banner "Saved on your phone. Syncs when you're back up." It is informational and never red.
- **Error**
- **Partner-offline**: the partner's last data shows with a muted "Updated 3 h ago" stamp, never "offline" in red.

**S1 Install Gate**
- **Purpose:** gets SPOTTER onto the home screen before any data exists.
- **Layout:** wordmark at the top → a looping 3-step animation (Share icon → "Add to Home Screen" → icon on the home grid) → one line "Installed apps keep your data. Browser tabs can lose it after 7 days."
- **Thumb zone:** "I installed it" (primary) and "Show me again". "Skip" in small text.
- **States:**
  - Android with a prompt: an "Install" button replaces the animation.
  - Unsupported browser (in-app WhatsApp or Instagram browsers, Firefox iOS): "Open this in Safari" (iOS) or "Open this in Chrome" (Android), with a Copy link button.
  - Already standalone: S1 never shows.
  - Offline: works fully (precached).

**S2 Sign In** (email code)
- **Decision:** the Architecture doc wins. Sign-in is a **6-digit email code** typed into the app, because on iOS a magic link opens Safari, whose storage is separate from the installed app. The email also carries a magic link as a browser-only fallback.
- **Layout:** wordmark → email field → "Send code" → after sending, six 56 px code boxes (paste fills all six) → "Lock in".
- **States:**
  - Loading: button shows "Sending…"; boxes show "Checking…".
  - Rate-limited: "Code delayed — try again in 60 s" with a live countdown. Never a silent failure.
  - Wrong code: "That code didn't match. Check the latest email."
  - Expired (10 min): "Code expired. Send a new one."
  - Offline: "You need signal once to sign in. After that, the gym basement is fine."

**S3 Join / Create Crew + Profile**
- **Layout:**
  - code boxes (10, in two groups of 5), prefilled when opened from `/join/<CODE>` → "Join"; secondary "Start a crew";
  - profile block on the same screen: display name (1–16 characters, first name or nickname; hint "No surnames"), colour chips (only free hues), weekly target stepper (default 3, range 1–7).
- **Primary:** "Lock in".
- **States:**
  - Dead code: "Code's dead. Ask for a new one."
  - Crew full: "Crew's full (8)."
  - Name taken in crew: "Someone here already goes by that."
  - Offline: "Joining needs signal."
- **After joining:** the route goes to Floor. If the inviter isn't online, Floor still shows his ring from the pull.

**S4 Floor (Home)**
- **Layout, top to bottom:**
  1. Install chip (if skipped).
  2. Presence banner (if a partner is live).
  3. Your ring + co-op ring, side by side, with a "weeks on" plate on yours.
  4. The Bar strip: forge flame, plate count, tier, pending ghost plate.
  5. "Last time" card: last session date, type, top set, duration.
  6. Partner's latest PR card, with the shockwave on first view (Flow 5).
  7. Thumb zone: **START** (72 px, molten) with **MIN** (72 px square) next to it.
- **States:**
  - Empty (no entries ever): rings at 0 and "Log your first set. Everything starts here." No fake stats.
  - Comeback (F16): the rings are replaced.
  - Crew of one: the co-op ring is replaced by "Crew of one. Send the code:" plus a code card and Share.
  - Partner-offline: his ring renders from the last pull with "Updated 3 h ago".
  - Offline: banner; rings still update from local data.
  - Server paused: "Server asleep — data safe on phone."
  - Open session exists: START reads "Resume session (14 min)".

**S5 Readiness** (sheet over S6)
- **Layout:** title "How's the tank?" → 3 rows of 3 emoji (Sleep 😵 😐 😴→ use the set in §3's icon spec; Soreness; Energy), each a 64 px target → suggestion line → bottom buttons.
- **States:**
  - Default: "Skip" and "Go".
  - Low score: "Do MIN" and "Full send".
  - Offline: same; nothing here needs the network.

**S6 Active Session (Log)**
- **Layout, top to bottom:**
  1. Header: session clock, sync dot / outbox count, "Unlocked" chip (v1).
  2. Exercise name (`--t-md`, tap to swap → S7).
  3. Nudge chip.
  4. Ghost row (v1).
  5. Logged sets list: `1  5 × 80  @8  ✓`, swipe left to delete, Undo for 8 s.
  6. Current-set kg and reps steppers in huge numbers.
  7. RPE pill row (optional, 6–10).
  8. Warm-up toggle chip.
  9. Thumb zone: "Next exercise" (48 px) and **RACK IT** (hold, knurled) above a 72 px **LOG SET**.
- **States:**
  - Empty (no exercise yet): S7 opens automatically.
  - Timer running: S8 overlay.
  - Storage full: a modal "Phone storage full — can't save. Free space and retry." This is the **only blocking error in the app**.
  - Offline: grey ticks on rows.
  - Partner live too: a small presence pill under the header, "{partner} · Squat 2/5".
  - Crash recovery: on reopen, "Resume session (14 min)?" with Resume and Discard (hold to confirm).

**S7 Exercise Picker / Command Bar** (sheet)
- **Layout:** search field (shorthand in v1) → recent 8 → all exercises grouped by primary muscle → "Create exercise" (name, export label ≤24 characters, kind, primary and secondary muscles, bodyweight flag, rep target, increment).
- **States:**
  - No match: "No match — create '{query}'".
  - Loading: local catalogue, instant.
  - Offline: create works (outbox).
  - Duplicate label: "You already have one called that."

**S8 Rest Timer Overlay**
- **Decision:** the Visual doc wins on placement. A glass sheet covers the bottom 55% above the 72 px LOG SET bar, which stays visible and tappable. The Product doc's "top 60%" is retired.
- **Layout:** ghost line "Last time: 5×80 @8" → 260 px draining ring with mono digits → −15 / +15 / Skip (64 px) → incoming hype overlay (v1).
- **States:**
  - Last 10 s: digits turn molten.
  - At 0: "Bar's loaded."
  - Minimised: a 56 px pill.
  - Over time: "+0:12 over".
  - Wake lock failed: "Screen may sleep" chip.

**S9 PR Moment**
- **Layout:** full-screen sequence per §3, with eyebrow "5-REP PR" / "e1RM PR" / "VOLUME PR" / "LONGEST RUN" / "FASTEST 5K" → number → "+2.5 KG" or "+1 REP" → "e1RM 108.3 KG" → "That's the strongest you've ever been on this."
- **Thumb zone:** "Back to work" (primary). "Share" sits beside it in v1.
- **States:**
  - Reduced motion: a static card with a 200 ms fade.
  - Two PRs at once: queued PR first, 400 ms gap, max one takeover per screen open; others become toasts.
  - The timer keeps running underneath.

**S10 Finish Summary**
- **Layout:**
  1. Duration · total tonnes (to 0.1 t) · working sets.
  2. PR badges (max 3 shown, "+2 more").
  3. Ring segment fill animation.
  4. One-line note (≤200 characters).
  5. Thumb zone: **Done**; Share (v1).
- **States:**
  - Week now FULL: "Week locked." with the ghost plate.
  - Every member FULL: a queued ring-close Tier-1.
  - Offline: "Saved on your phone." and Done works.
  - Zero working sets: the session is discarded with "Nothing logged — session dropped."

**S11 Quick Log sheets** (Run / Martial Arts / Weight / MIN)
- **Layout:** one sheet, large fields prefilled from the last entry of the same type → **Save** (72 px) at the bottom.
- **States:**
  - Validation: "That's a world record. Check it."
  - Weight replacing today's entry: "Replaces today's 78.6."
  - Offline: saves locally.

**S12 Crew**
- **Layout, per partner:**
  - avatar and initial chip in his colour → week ring → status ("Training now" / "Last trained 2 d ago", neutral);
  - live feed, newest first: sets grouped by session, sessions, runs, MINs, PR cards with a "NEW PR" stamp;
  - PR wall (v1).
- **Then:** "Together" block (combined sessions this week, combined tonnes, The Bar) → Spot card (when eligible) → duel and season cards (v1).
- **Thumb zone:** Hype (v1) and Nudge (v1, disabled with the reason when it can't be sent).
- **States:**
  - Crew of one: "Crew of one. Send the code:" with the code card and Share.
  - Partner-offline: "Updated 3 h ago".
  - Partner left: his card greys, The Bar and co-op ring show "Archived".
  - Loading after a long gap: skeleton feed rows until the pull returns.
  - Offline: cached feed plus banner.
- **Bodyweight** entries appear only if the partner has `show_bodyweight` on.

**S13 Progress**
- **Layout:** segmented control Lifts / Run / Martial arts / Body.
  - Lifts: exercises with 12-week sparklines → S14.
  - Run: distance per week, pace trend, PR list.
  - Martial arts: minutes per week per discipline.
  - Body: bodyweight with a 7-day moving average; heatmap (v1).
- **States:**
  - Empty: "Two sessions and the lines start drawing."
  - Partner overlay toggles: only relative (% rebased) values for the partner.

**S14 Exercise Detail**
- **Layout:** e1RM chart (F18) → rep-max table (v1) → history by session. Each set can be edited (tap) or deleted (swipe).
- **States:**
  - An edit that changes a PR: "PRs recalculated."
  - An edit that changes a closed week: "Bar adjusted after edit."

**S15 History / Day Editor**
- **Layout:** 14-day calendar strip with dots per entry type → the day's entries → tap to edit any field, including the date (the move keeps the entry's id).
- **States:**
  - Empty day: "Nothing logged. Rest counts too."
  - Delete a whole session: hold to confirm, 600 ms.

**S16 Settings**
- **Groups:**
  - **Profile:** name, colour, weekly target, default MIN label.
  - **Units:** kg, shown greyed, fixed.
  - **Training:** plate inventory and bar kg, default rest times, "Big jumps".
  - **Feel:** sound (off by default), haptics, reduce motion, battery saver, theme (Dark default / Light / System).
  - **Notifications:** per-type toggles from §2.6, quiet hours.
  - **Privacy:** share bodyweight (off), share DOTS (off), duels opt-in (off).
  - **Vault export (F17):**
    - token list (label, created, last used), Generate, Copy (only when just generated), Revoke, Revoke & regenerate;
    - format Lines / JSON / CSV;
    - "Copy for my AI";
    - Preview.
  - **Sync:** outbox status, dead items with Retry / Discard.
  - **Crew:** invite code, leave crew (hold to confirm).
  - **Account:** sign out, delete my account (hold to confirm, then type "DELETE").
- **States:**
  - Offline: token generation disabled with "Needs signal".
  - Push unsupported: "This phone can't do web push here. Install SPOTTER first (iPhone needs iOS 16.4+)."

**S17 Weekly Recap deck (v1)**
- **Layout:** 4 swipeable full-screen cards (Rings · PRs · The Bar · Roast), each with Share.
- **States:**
  - Partner had a REST week: his ring is grey and labelled "Rest week". He is never named in the roast.

### 2.5 "Copy for my AI" text (exact template)

The app fills in `{…}` and copies the block as plain text. The token is never included.

```
SPOTTER export for {display_name} — read-only, my own data only.
URL: {SUPABASE_URL}/functions/v1/export
Auth: header "Authorization: Bearer <MY_TOKEN>" (I'll paste the token separately; never put it in the URL or a log).
Optional query: ?since=YYYY-MM-DD (inclusive) · ?format=lines|json|csv (my default: {export_format}).
Default "lines" format, newest date first, one line per exercise per day:
- 2026-10-24 · Bench · 3×5×80kg · RPE 8 · felt strong
- 2026-10-24 · Bench · 1×5×80kg + 2×3×85kg · RPE 9
- 2026-10-24 · Pull-up · 3×8×BW
- 2026-10-24 · Run · 5.2km · 27:40
- 2026-10-24 · BJJ · 60m · RPE 7 · drilled guard
- 2026-10-24 · Weight · 78.4kg
- 2026-10-24 · MIN · 20m walk
Separators are " · " (U+00B7) and "×" (U+00D7). Sets read count×reps×kg.
200 + empty body = nothing new. 401 = token revoked. 429 = slow down (max 60/hour).
Re-pulling is safe: replace whole date blocks, don't append.
```

### 2.6 Notifications

**Global rules:**
- Everything is opt-in, and permission is requested only from a user tap.
- Max **3 pushes per recipient per local day**.
- **Quiet hours** default 22:00–08:00 in the recipient's tz, editable. Pushes due in quiet hours are **dropped, not queued**; the event shows in the app on next open.
- No push goes to someone who has already logged a credit that day, **except** a partner-PR push.
- Push payloads carry the copy only, with no training numbers.
- If push isn't installed or isn't allowed, every event below appears in the app on next open: a feed card, banner or overlay.

| Event | Push | Default | Copy (title "SPOTTER") | In-app fallback |
|---|---|---|---|---|
| Partner starts a session | Optional | **Off** | "{partner} is under the bar." | Presence banner |
| Partner PR | Yes | **On** after opt-in | "{partner} hit a PR. Go see." | Shockwave card (Flow 5) |
| Nudge from partner | Yes | On | "Gym's open. MIN counts." | Floor chip "{partner} nudged you" |
| Weekly recap (Sun 19:00 recipient tz) | Yes | On | "Week's in. See the card." | Recap deck on next open |
| Spot available (Sun 12:00 crew tz, partner at 0) | Yes | On | "{partner}'s week is light. You can spot him." | Spot card on Crew |
| Your own missed day or week | **Never** | — | — | — |
| Hype reaction | **Never** | — | — | Overlay at next rest timer / open |

- **Decision:** partner-PR and spot pushes are kept (Product doc, features). The Architecture doc's "PRs never push" is overruled. The Visual doc's spam ban still holds through the 3-per-day cap and quiet hours.
- **Banned:** streak-loss warnings, "you haven't trained in X days", countdowns, and anything using §3's banned words.

### 2.7 Validation (UI ranges; the database checks in §4 are wider safety nets)

| Field | UI range | Step | Out-of-range copy |
|---|---|---|---|
| Lift kg | 0–500 | 0.25 (stepper uses increment) | "That's a world record. Check it." |
| Added kg (bw_lift) | −100 to +200 | 0.25 | same |
| Reps | 1–100 | 1 | same |
| RPE | 6–10 | 0.5 | — |
| Run km | 0.1–100 | 0.01 | same |
| Run duration | 0:01–23:59:59 | 1 s | same |
| Martial minutes | 1–480 | 1 | same |
| Bodyweight | 30–250 | 0.1 | same |
| Display name | 1–16 chars | — | "Keep it to 16." |
| MIN label | 1–40 chars | — | "Keep it to 40." |
| Session note | ≤200 · set note ≤120 | — | counter shows |

### 2.8 Duo mechanics and fair comparison

**Principle:** the crew front page never shows raw strength side by side. Comparison is always **relative to each person's own past**, so a 60 kg bencher and a 120 kg bencher compete evenly.

- **Relative view (default on Crew, PR wall and charts):**
  - Shows the % change of best e1RM against **your own trailing 4-week baseline**.
  - The baseline is the mean of weekly best e1RM over the previous 4 complete weeks. It needs ≥2 sessions in that window; otherwise the label reads "Baseline building".
- **Raw numbers:**
  - One tap deep on the partner's S14 only.
  - Bodyweight is never shown to a partner unless that partner's `show_bodyweight` is on.
  - Bodyweight never appears on share cards.
- **Duels (v1):**
  - Proposed from Crew → "Duel".
  - Pick a lift both have logged in the last 4 weeks, or "Sessions", or "Km". Window: 1 or 4 weeks, starting on the next Monday.
  - Both must accept. A proposal unanswered for 48 h is cancelled quietly.
  - Baselines are frozen at start (`challenge_participants.baseline_value`).
  - Scoring:

    | Duel type | Score |
    |---|---|
    | Lift | % e1RM gain vs own frozen baseline |
    | Sessions | credits ÷ own target |
    | Km | % of own trailing 4-week weekly mean |

  - Higher score wins. A gap within 0.5 percentage points is a tie, and a tie gives both a co-op half-segment.
  - Win copy: "TAKEN." Loss copy: "Next one's yours. +2.1% is still up." There is never a "LOST" banner.
  - Settled by `settle_challenge` at window end + 5 min crew time.
- **Seasons (v1):**
  - 4 weeks, starting on a Monday, opt-in per person.
  - **Season score = Σ over weeks of min(credits ÷ own target, 1.5) × (1 + max(0, relative e1RM gain on the user's top 3 lifts by session count)).**
  - Raw kg never enters the score.
  - The final Season Card goes to the trophy archive. That archive is the only trophy shelf in the app.
- **DOTS badge (v1, secondary):**
  - Needs both members to opt in plus a bodyweight logged within 14 days.
  - DOTS = total × 500 ÷ (A + B·bw + C·bw² + D·bw³ + E·bw⁴), where total = best e1RM of squat + bench + deadlift. If any of the three is missing, there is no badge.
  - **The build agent must not write coefficients or the bodyweight clamp from memory.** It copies them from the OpenPowerlifting `opl-data` repository, `coefficients` crate, DOTS module (gitlab.com/openpowerlifting/opl-data ⚠️ the exact path is to be confirmed at build time), cites the source in a code comment, and unit-tests against 3 published values from that source. If the source can't be reached, the agent stops and asks (§1).
- **Hype, nudge and spot** are the only person-to-person actions:
  - Hype: F23.
  - Nudge: F25.
  - Spot: §2.2.
  - None of them can be sent to someone outside your crew (row-level security in §4).
- **Leaving:**
  - The co-op ring, The Bar and duels freeze and are archived. Personal data stays.
  - Rejoining the same crew with a new code restores history and the archived Bar.

### 2.9 Key flows

**Flow 1 — First run (invited member), under 60 s**
1. The inviter: Crew → Invite → Share. WhatsApp sends `https://<app>/join/K7F2QMXRA9` plus the code in text.
2. The invitee opens it in Safari. The `/join` page shows the code large and "Add to Home Screen, open it, enter this code." → S1 animation → Add to Home Screen (about 15 s).
3. He opens SPOTTER from the icon → S2: email → "Send code" → types the 6 digits from his mail app.
4. S3:
   - The code is prefilled if the `/join` page wrote it to the clipboard (with permission) or to `localStorage` before install ⚠️. The two storages may be separate on iOS, so the code boxes must also accept a paste or typing.
   - He sets a name, keeps or changes the colour, keeps target 3 → "Lock in".
5. Floor: his empty ring beside the inviter's.
   - The timers-and-lock-screen info card shows once.
   - A "Set up your vault export" chip points to S16 (dismissible).
6. Decisions made: install, email, name/colour, lock in.

**Flow 2 — Log a set in 1–2 taps**
1. Floor → START → S5 (1 tap per row, or Skip) → S6 opens on the predicted exercise with prefilled numbers.
2. Unchanged → LOG SET (1 tap). Changed → one stepper tap + LOG SET (2 taps).
3. The write goes to Dexie and the outbox in under 50 ms → the row stamps in (§3 "set logged" micro-motion) → toast "Locked in." → Undo for 8 s → S8 starts.
4. The PR check runs → S9 if a PR (Flow 4).
5. Presence updates to "Bench 2/5".

**Flow 3 — Rest timer**
1. `ends_at = now + rest`.
2. S8 shows the countdown. The last 3 s tick if sound is on.
3. At 0: flash + bell (if sound on) + vibrate (Android only) + "Bar's loaded."
4. The overlay shrinks to the header chip "+0:12 over".
5. LOG SET resets it. Skip ends it immediately.
6. If the app is backgrounded, it shows the correct remaining time on return. The app never claims it rang while locked.

**Flow 4 — PR moment**
1. The set is saved locally.
2. The PR check runs on local history.
3. S9 sequence per §3. Tapping skips to the final frame.
4. "Back to work" returns to S8, which was counting the whole time.
5. A `pr_events` row is written via the outbox. The server re-check on sync wins.

**Flow 5 — Partner sees it live**
1. Sync upserts the set → Realtime INSERT → the partner's Crew feed animates the row in, and his presence banner updates.
2. A PR row gets a molten "NEW PR" stamp.
3. Partner-PR push, if he opted in and it's outside his quiet hours.
4. On his next open, a 1.5 s dimmed **shockwave** card plays once: "{partner} · Bench · 85 kg × 5".
   - It records `pr_events.seen_by`.
   - It never interrupts an active session; it waits for S10 or the next Floor view.

**Flow 6 — MIN day**
- Path A:
  1. Floor → MIN (1 tap) → "20m walk" logged.
  2. A half segment fills (Tier 2).
  3. Toast "MIN day. Still counts. Chain's alive."
- Path B:
  1. Readiness low → Do MIN → the pre-built short session → finish.
  2. Credit 1 (it was a session), `mode='min'`, and the export adds the MIN line per §5.

**Flow 7 — Workout finish**
1. Hold RACK IT 600 ms → S10: duration, tonnes, sets, PRs, segment fill, one-line note → Done → Floor.
2. If this completes the personal target: "Week locked." plus the ghost plate.
3. If every member is now FULL: the ring-close Tier-1 plays now for this user, and on next open for the others.

**Flow 8 — Week close and recap (v1)**
1. Sunday 12:00 crew tz: spot eligibility check → spot push (§2.6).
2. Sunday 19:00 recipient tz: recap push → S17.
3. Monday 00:05 crew tz: server close → plates change, spots reconciled. The next open shows the result once, then "New week. Clean bar."

**Flow 9 — Wiring a vault (any member, symmetric)**
1. S16 → Vault export → "Generate token" → label "My vault" → token shown once → Copy.
2. He pastes the token into his own agent or secret store through a private path. It never goes in a group chat and is never sent to the partner.
3. Optionally changes "Export format" to JSON or CSV to suit his vault.
4. Taps "Copy for my AI" → pastes the block (§2.5) to his agent.
5. His agent pulls with `?since=` and replaces date blocks.
6. A lost or leaked token → Revoke & regenerate → repeat from step 2.

### 2.10 Edge cases

- **Timezones:**
  - Each entry stores `started_at` (UTC), an IANA `tz` and `local_date`.
  - Travel never moves a past entry.
  - Week boundaries are built in the zone itself, never by adding 168 hours.
  - **Required case:** a set at 23:30 on Sun 25 Oct 2026 (the 25-hour CEST→CET day) belongs to the week of Mon 19 Oct.
  - A session that crosses midnight stays on its start date.
- **Clock skew:** a client clock more than 10 min off server time is detected on pull, and the offset is applied to `client_updated_at`.
- **Offline conflicts:**
  - Last write wins per row on `client_updated_at` (server trigger).
  - The losing device gets a quiet toast "Updated on your other phone."
- **Duplicates:** impossible by construction (client UUID + upsert). The flight-mode test in F9 proves it.
- **Two devices, same user:** both stay in sync through the pull. An active session started on device A shows on device B as "Session open on another device", with Resume here or Leave it.
- **Deleting:**
  - Every delete is a soft delete.
  - A scheduled purge hard-deletes after 30 days.
  - Whole-session delete needs a hold-to-confirm.
  - "Delete my account" removes all the user's rows, revokes every export token and push subscription, and removes the user from crews. The remaining members' Bar is archived.
- **Edits to the past:**
  - Allowed at any date.
  - PRs, rings and The Bar are recomputed from source rows and never stored as authority.
  - A PR that disappears because of an edit is removed from the partner feed without a notification.
- **Export:**
  - Edited entries export their current values. Deleted ones are excluded.
  - A renamed exercise exports its current label; history follows `exercise_id`.
  - A token is never in a query string or a log.
- **Invites:** a code is single use and expires after 7 days. Creating a new code revokes the old one. Redeeming while already in that crew → "You're already in."
- **Free-tier pause:** if Supabase is paused, logging continues offline, the banner reads "Server asleep — data safe on phone", and the keep-alive job (§4) is mandatory.
- **iOS storage:**
  - Not installed → install chip persists.
  - Installed → persistent storage is requested.
  - Dexie is never treated as the backup.
- **Storage full:** the S6 modal is the only blocking error.
- **Platform capability missing** (Wake Lock, push, Web Share files, audio session): the feature degrades to its stated fallback and shows a chip. It never fakes the behaviour (§1 rule).
- **Crew grows to 3+:**
  - Rings, The Bar ("CLOSED. All of you."), spots and duels all use the N-member rules above.
  - Duels stay 1-v-1. A season ranks all opted-in members by season score.

## 3. Visual and interaction system: "IRON & CHALK"

This section covers the look, feel, motion, sound, copy and accessibility of **SPOTTER**. Feature behaviour lives in §2, technical implementation in §4, the export format in §5. Every value here is a build value unless marked ⚠️. A ⚠️ value must be checked on a real device or against MDN/caniuse at build time, never guessed.

### 3.0 Decisions taken in this section (the design docs disagreed)

| # | Conflict | Decision | Why |
|---|---|---|---|
| D1 | Name: SPOTTER (Product) / "THE FLOOR" (Visual) / `ironpact` (Arch, "rename freely") | **SPOTTER** everywhere: UI, manifest `name`/`short_name`, wordmark. The repo and package may stay `ironpact` until [FRIEND] renames them. | The Product doc picked it, and Arch said renaming is fine. |
| D2 | Bottom nav: "Floor · Log · Crew · Progress" (Product) / "Today · Log · Duo · You" (Visual) | **Floor · Log · Crew · Progress**, with Log as a raised molten centre button. Settings sits behind the avatar. | Screen structure belongs to the Product doc. |
| D3 | Fonts loaded from Google Fonts (Visual) / self-hosted `@fontsource-variable/*` (Arch) | **Self-host via `@fontsource-variable/*`** and precache with Workbox. No Google Fonts CDN at runtime. | Technical, so Arch wins. It also works offline in a basement. |
| D4 | Font budget ≤180 KB (Visual) / ≤220 KB, ≤4 woff2 (Arch) | **≤4 woff2 files, ≤220 KB total, latin subset.** If over budget, drop Anybody first. | Technical budget, so Arch wins. |
| D5 | Rest timer covers the top 60% (Product) / a glass sheet over the bottom 55% (Visual) | **A glass sheet covering the bottom 55% of the viewport, sitting directly above the workout bar.** The 72px LOG SET bar stays visible and tappable underneath. The set card above stays readable. | Look and feel, so Visual wins. Product's requirement that lower controls stay usable is kept. |
| D6 | Timer-zero flash: molten (Visual) / chalk (Arch) | **Molten**, one 300ms pulse. | Look, so Visual wins. |
| D7 | Timer-zero vibration: `[80,60,80,60,200]` (Visual) / `[200,100,200]` (Arch) | **`[80,60,80,60,200]`** | Interaction feel, so Visual wins. |
| D8 | Timer digit font: Big Shoulders 900 (Visual type scale) / JetBrains Mono (Product F6, Visual §9.5) | **JetBrains Mono 700, tabular-nums**, at `--t-mega` size. | Changing digits must not jitter. Big Shoulders 900 stays for the PR number. |
| D9 | PR takeover dim: 85% (Product) / `rgba(10,10,11,0.92)` (Visual) | **0.92** | Look, so Visual wins. |
| D10 | Tier names: Iron/Steel/Titanium/Obsidian by plates on The Bar (Product) / Bronze/Iron/Steel/Obsidian by weeks (Visual, Arch) | **One chain: The Bar (§2 F14). It is counted in plates, and the tiers are Product's.** Iron 0–3, Steel 4–7, Titanium 8–15, Obsidian 16+. Colours: Iron `#9AA0A6`, Steel `#7FA7C9`, Titanium `#C9CCD1` ⚠️ (new value, check contrast), Obsidian core `#1A1420` with a molten rim. Bronze `#B87333` is retired. | Features belong to Product; the colours carry over from Visual. |
| D11 | Hype reactions: 🔥 🦍 💀 (Product) / skulls and emoji fire banned (Visual §3.12) | **No emoji in the UI.** The four reactions are chalk stamps: **LIGHT WEIGHT · CLEAN · AGAIN · chalk handprint**. They map onto the §4 DB enum without changing it: `light_weight`→LIGHT WEIGHT, `flex`→CLEAN, `gorilla`→AGAIN, `fire`→chalk handprint. `skull` is never offered by the UI. Max 3 per set (§2 F23). | The skull and fire bans are look-and-feel rules, so Visual wins. The schema stays the Arch doc's. |
| D12 | Ghost row matched: "gold border" (Product) / one accent only (Visual) | **2px `--text` (chalk) border plus the copy "Ghost's behind you."** No gold and no sound. | A second accent is banned (§3.12 #8). |
| D13 | Heatmap steps: legend 0·4·8·12·16+ (Visual) / 0, 1–4, 5–9, 10–14, 15+ (Arch) | **0 · 1–4 · 5–9 · 10–14 · 15+** | The thresholds are a computation, so Arch wins. |
| D14 | Per-user colour field: `profiles.accent_slot` (Visual) / `profiles.color_hue` (Arch) | **`profiles.color_hue`.** Hue 125 renders the exact Volt hexes and hue 220 the exact Ice hexes. Other hues are generated (§3.2.2). | Schema, so Arch wins. |
| D15 | Offline banner copy: "Offline — logging to phone" (Product) / "Saved on your phone. Syncs when you're back up." (Visual) | **"Saved on your phone. Syncs when you're back up."** | Copy voice, so Visual wins. |
| D16 | Comeback copy: "Welcome back. MIN today?" (Product) / "Welcome back. You owe nothing. 20 minutes?" (Visual) | **Headline:** "Welcome back. You owe nothing." **Buttons:** "20-min session" and "Just log MIN". | Copy from Visual, buttons from Product F16. |
| D17 | MIN in the ring: "half a segment" (Product) / "half-thickness stroke" (Visual) | **A half-thickness stroke filling the whole segment arc.** It means 0.5 credit. | Same meaning; Visual decides how it looks. |

---

### 3.1 Brand concept

**One sentence:** a private training floor at 6 a.m., with black rubber flooring, knurled steel, chalk dust in the air and one orange work light over the platform.

| Material | UI mapping |
|---|---|
| Rubber floor (matte near-black) | App background `--bg`. Matte, with no gloss anywhere. |
| Machined steel | Card surfaces and edges. A thin brushed sheen on the **borders only**, never across a whole card face. |
| Chalk | All primary text and numbers (warm off-white), rough-edged PR stamps, the dust particles in Tier-1 moments. |
| Molten / forge heat | The **single** hot accent. It appears only where something is happening: the primary CTA, the live timer, PRs, The Bar's heat, a pending plate. |
| Knurling | A fine 45° hatch used as grip texture on the hold-to-confirm **RACK IT** button and the plate-calculator sleeve. |
| Stamped plate lettering | Headers and big numbers. Condensed and heavy, like the "20 KG" cast into a bumper plate. |

**Mood words:** heavy, quiet, confident, earned. It should feel like a gym, not an energy drink. Most screens are calm and dense with data. The theatrics are saved for four Tier-1 moments (§3.7.2), and they hit harder because everything else is restrained.

**Wordmark:** `SPOTTER` in Big Shoulders Display 900, `letter-spacing: -0.01em`, all caps. The second T has a notch cut into its crossbar like a barbell collar: a 2px gap in the bar at 62% of its width. It ships as an inline SVG path, not live text, so the notch survives font fallback.

**App icon** (`src/assets/icon.svg`, used by `@vite-pwa/assets-generator`; the sizes are in §4):
- The two Ts merged into a barbell silhouette, drawn in chalk `#F2F0EB` on `#0A0A0B`, with one molten `#FF4D00` collar.
- The maskable safe zone is the inner 80%.
- The 180px `apple-touch-icon` has an opaque background.

**Names:** display names always come from `profiles.display_name`. Neither "the friend" nor "[FRIEND]" appears anywhere in code, fixtures or copy files. Copy templates use `{name}` and `{partner}` tokens.

---

### 3.2 Colour tokens

All tokens are CSS custom properties on `:root`, authored in `oklch()`. **The hex values below are the source of truth.** At build time, `culori` converts hex to oklch into `src/ui/tokens.css`. The unit test `tokens.contrast.test.ts` asserts every pair in §3.2.4 and fails CI on any miss.

#### 3.2.1 Dark (primary, first-run default)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0A0A0B` | App background ("rubber"). `body` sets it explicitly. |
| `--surface-1` | `#121214` | Cards |
| `--surface-2` | `#1C1C1F` | Raised: sheets, the active card, input wells, the glass fallback |
| `--surface-3` | `#26262A` | Pressed state, segment tracks, heatmap base |
| `--line` | `#2E2E33` | 1px dividers, ring tracks, untrained heatmap strokes |
| `--line-steel-a` / `--line-steel-b` | `#3A3A40` → `#5A5A62` | Conic sheen stops on hero-card edges |
| `--text` | `#F2F0EB` | "Chalk": primary text and numbers |
| `--text-muted` | `#8A8A90` | Labels, secondary text, units, modality glyphs |
| `--text-faint` | `#5C5C63` | Placeholders and disabled only. Never real information. |
| `--molten` | `#FF4D00` | THE accent: primary CTA, live timer, PR, pending plate |
| `--molten-glow` | `#FF4D00` at 35% alpha | Bloom behind the PR number and the timer ring |
| `--on-molten` | `#0A0A0B` | Text on molten buttons (black on orange reads harder than white) |
| `--danger` | `#FF5A6E` | Destructive only (delete, revoke token, leave crew). Always with an icon **and** a label. |
| `--rest` | `#6B6B73` | "Rest week" state. Grey, **never red**. |
| `--tier-iron` | `#9AA0A6` | The Bar tier, 0–3 plates |
| `--tier-steel` | `#7FA7C9` | 4–7 plates |
| `--tier-titanium` | `#C9CCD1` ⚠️ | 8–15 plates |
| `--tier-obsidian` | `#1A1420` core with a `--molten` rim | 16+ plates |

Approximate contrast on `--surface-1`: chalk ≈ 17:1, muted ≈ 5.3:1, molten ≈ 5.6:1. All pass AA for text. The test recomputes these and the build trusts the test, not this table.

#### 3.2.2 Per-member colour ("your colour")

Each crew member owns one colour, stored as `profiles.color_hue` (D14). It is used everywhere that member's data appears: ring segments, chart lines, avatar rim, presence dot, feed rows, the story-card stripe, the heatmap ramp, and their half of the duel card.

| Slot | Name | `color_hue` | Dark hex | Light-mode ink | oklch (approx ⚠️, recomputed) |
|---|---|---|---|---|---|
| Crew creator default | **Volt** | 125 | `#C6FF00` | `#4A6B00` | `oklch(0.93 0.23 128)` |
| Second member default | **Ice** | 220 | `#00D1FF` | `#006A85` | `oklch(0.78 0.15 220)` |
| Third and later | generated | last hue + 100° | keep Ice's L/C, then reduce C until ≥3:1 on `--surface-1`; reject hues within 30° of molten (≈40°) by stepping +15° | L → 0.45 | computed |

- The colour picker in S3 and S16 shows only free hues, as large swatches with the member's initial.
- Changing your colour updates every surface live. No historical recolouring is stored.

**Redundant encoding is mandatory.** Colour is never the only signal:
- **Initial chip:** every member mark carries their initial in a 20px circle with a 1px `--line-steel-b` rim, Inter Tight 700, 11px, in their colour on `--surface-2`.
- **Chart lines:**
  - Member A: **solid** 2.5px with round markers.
  - Member B: **dashed** `6 4` with square markers.
  - Member C: **dotted** `1.5 4` with triangle markers.
  - Further members cycle these patterns with a 1px outline on the markers.
- **Ring segments:**
  - A: solid fill.
  - B: solid fill plus a 45° fine hatch overlay at 25% alpha (`repeating-linear-gradient(45deg, rgba(10,10,11,.25) 0 2px, transparent 2px 5px)` as an SVG `<pattern>`).
  - C: a dot pattern.

**Collision rules:**
- Volt reads as "success green", so **the app has no green status colour.** Success is a chalk check glyph plus copy.
- Molten and danger are kept apart by hue and by usage: danger appears only on destructive buttons, always with a trash or revoke icon.
- Plate colours (§3.9.6) are object colours, not UI status, and are allowed only inside the plate visual.

#### 3.2.3 Light fallback (usable, not the hero)

- **First-run default is Dark.** After that, Settings offers Dark / Light / System.
- CSS guard:
  ```css
  @media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { …light… } }
  :root[data-theme="light"] { …light… }
  ```
- On first run, write `data-theme="dark"` to `<html>` until the user changes it. The choice is stored in `localStorage` inside try/catch and mirrored to the profile.

| Token | Light |
|---|---|
| `--bg` | `#F4F2ED` (paper chalk) |
| `--surface-1` | `#FFFFFF` |
| `--surface-2` | `#ECEAE4` |
| `--surface-3` | `#E0DED7` |
| `--line` | `#D6D3CB` |
| `--text` | `#111113` |
| `--text-muted` | `#5A5A60` |
| `--molten` | `#C43A00` (≈5.3:1 on white) |
| `--on-molten` | `#FFFFFF` |
| Member colours | switch to their **ink** variants (§3.2.2) |
| Glow tokens | 15% alpha |
| Grain | 2% opacity |

#### 3.2.4 Contrast pairs asserted in `tokens.contrast.test.ts`

Both themes:
- `--text` / `--text-muted` / `--molten` on `--bg`, `--surface-1` and `--surface-2`: ≥4.5:1.
- `--on-molten` on `--molten`: ≥4.5:1.
- Each member colour (and its ink variant in light) on `--surface-1`: ≥3:1.
- `--danger` on `--surface-1`: ≥4.5:1.
- `--rest` on `--surface-1`: ≥3:1.
- Each tier colour on `--surface-1`: ≥3:1.

The test also asserts that every generated member hue is ≥30° from molten.

---

### 3.3 Typography

| Role | Family (fontsource package) | Weights / axes | Use |
|---|---|---|---|
| Display / huge numbers | **Big Shoulders Display** (`@fontsource-variable/big-shoulders-display`) ⚠️ (confirm the package name) | `wght` 700–900 | 900 for the PR number and stamps, 800 for big stats, 700 for headings. Headings are ALL CAPS with `letter-spacing: 0.02em`. |
| Flex numeral (optional) | **Anybody** (`@fontsource-variable/anybody`) | `wdth` 75–130, `wght` 800 | Only the "set logged" number flex: animate `wdth` 100 → 125 → 100. **First to be cut** if the budget breaks; the fallback is a Big Shoulders scale pulse of 1 → 1.06 → 1. |
| UI / body | **Inter Tight** (`@fontsource-variable/inter-tight`) | 400, 500, 600, 700 | 14–17px body, sentence case |
| Numeric / timers / data | **JetBrains Mono** (`@fontsource-variable/jetbrains-mono`) | 500, 700 | `font-variant-numeric: tabular-nums` everywhere numbers change: timer, set rows, charts, export preview |

**Loading rules:**
- latin subset only, `font-display: swap`.
- `<link rel="preload" as="font" type="font/woff2" crossorigin>` for Big Shoulders Display and Inter Tight.
- All four files are precached (D3, D4).
- Fallback stacks:
  - display: `"Big Shoulders Display", "Arial Narrow", sans-serif`
  - body: `"Inter Tight", system-ui, sans-serif`
  - mono: `"JetBrains Mono", ui-monospace, monospace`
- Use `size-adjust`/`ascent-override` on the fallback `@font-face` so the font swap stays under the §7 CLS budget.

**Banned fonts:** Bebas Neue, Anton, Oswald, Impact, and any distressed, grunge or stencil font.

**Type scale** (rem on a 16px root; respect user font scaling; display sizes use `clamp()`):

| Token | Size / line height | Family · weight | Use |
|---|---|---|---|
| `--t-mega` | `clamp(96px, 28vw, 160px)` / 0.85 | Big Shoulders 900 (PR); JetBrains Mono 700 (timer, D8) | PR takeover number, rest-timer digits |
| `--t-hero` | 64px / 0.9 | Big Shoulders 900 | Current set weight and reps on S6 |
| `--t-xl` | 44px / 0.95 | Big Shoulders 800 | Stat cards (week tonnes, ring centre "4/6", duel `+4.2%`) |
| `--t-lg` | 28px / 1.0 | Big Shoulders 700, caps | Screen titles |
| `--t-md` | 20px / 1.2 | Inter Tight 600 | Card titles, exercise names |
| `--t-body` | 16px / 1.45 | Inter Tight 400/500 | Body |
| `--t-sm` | 14px / 1.4 | Inter Tight 500 | Labels |
| `--t-xs` | 12px / 1.3 | Inter Tight 600, caps, `+0.08em` | Eyebrows ("THIS WEEK", "LIVE", "5-REP PR") |
| `--t-mono` | 15–18px | JetBrains Mono 500/700 | Set rows `3×5×80`, timer sub-labels, export preview, token display |

- **Units** ("kg", "km", "m", "min") are set at **45% of the number's size** in Inter Tight 600 `--text-muted`, baseline-aligned, with a 0.08em gap. The numbers are the heroes and the units are footnotes.
- **Number changes** animate with `@number-flow/react`. Under reduced motion they jump instantly.

---

### 3.4 Iconography

- **Base set:** `lucide-react`, 24px, stroke 2 (1.75 at ≥32px), `currentColor`, square line caps. No fills, except the active nav icon, which gets a 100% fill of `--text`.
- **Custom glyph set:** 10 inline SVGs on the same 24px grid and stroke, in `src/ui/glyphs/`:
  - barbell
  - plate
  - kettlebell
  - belt (martial arts)
  - running shoe
  - scale (bodyweight)
  - **MIN** (a chevron in a circle)
  - forge flame (The Bar only, §3.9.2)
  - chalk handprint (hype)
  - stopwatch
- **Modality glyphs** are always `--text-muted`. Modality is never colour-coded, because colour is reserved for **people**.
- **Sync glyphs:**
  - Grey tick (`--text-faint`): saved on the phone.
  - Chalk tick (`--text`): synced.
  - The header sync dot is a 6px circle: chalk when the outbox is empty; muted with an outbox count (`3`) in `--t-xs` mono when items are pending.
- Every icon-only button has an `aria-label` and a hit area of at least 48px, even when the glyph is 24px.

---

### 3.5 Spacing, radius, elevation, layout

**Spacing (4px base):** `--s-1` 4 · `--s-2` 8 · `--s-3` 12 · `--s-4` 16 · `--s-5` 24 · `--s-6` 32 · `--s-7` 48 · `--s-8` 64.
- Screen gutter 16px; card padding 16px (20px on hero cards); gap between cards 12px.
- No horizontal page scroll at 320px width.

**Radius ("machined"):** `--r-sm` 6 (chips, inputs) · `--r-md` 12 (buttons) · `--r-lg` 20 (cards) · `--r-xl` 28 (sheets, top corners only) · `--r-full` (avatars, dots, ring caps). No pill-shaped cards.

**Elevation without drop shadows** (shadows disappear on black). Height is shown by:
1. a lighter surface step: `surface-1` → `surface-2` → `surface-3`;
2. a 1px top inner highlight, `box-shadow: inset 0 1px 0 rgba(255,255,255,0.06)`;
3. the brushed-steel border, on **hero cards only**: a masked `::before` with a 1px `conic-gradient(from 210deg, var(--line-steel-a), var(--line-steel-b), var(--line-steel-a))`.

Sheets get the one real shadow: `0 -24px 48px rgba(0,0,0,0.6)`.

**Thumb-zone layout (applies to every workout screen):**
- Everything interactive lives in the **bottom 40%** of the viewport.
- The top 60% is read-only display: big numbers, the ghost row, partner presence, the session clock.
- The **primary action bar** is 72px tall and full width (gutter 16px), sitting 16px above the bottom nav or `env(safe-area-inset-bottom)`.
- Nothing in a workout needs a reach to the top corners. Exception: the exercise name (tap to swap) sits at the top, but it is duplicated by "Next exercise" in the thumb zone.

**Bottom nav (D2):**
- 64px plus the safe area, glass (§3.6), 4 tabs: **Floor · Log · Crew · Progress**.
- **Log** is a raised 64px molten circle, offset −16px above the bar, with a barbell glyph in `--on-molten`.
- The other tabs: 24px icon plus a `--t-xs` label. Active = `--text` with the filled icon; inactive = `--text-muted`.
- During an active session the nav slides down (UI spring) and the **workout bar** takes its place: LOG SET (72px), with "Next exercise" and **RACK IT** (hold) as a 56px row directly above it.

**Safe areas:** use `viewport-fit=cover` and `apple-mobile-web-app-status-bar-style: black-translucent` (§4). The header gets `padding-top: env(safe-area-inset-top)`.

---

### 3.6 Textures and their performance limits

| Texture | Spec | Hard limit |
|---|---|---|
| **Grain** | SVG `feTurbulence` (`baseFrequency 0.85`, `numOctaves 2`, `stitchTiles="stitch"`), **baked once at build time** into a 256×256 PNG tile (≤12 KB). Applied as `body::before { opacity: .04; mix-blend-mode: overlay; pointer-events: none; position: fixed; inset: 0 }`. | **Never animated.** One grain layer in the whole app. Off when Settings → "Battery saver" is on. 2% in light mode. |
| **Brushed steel** | 1px conic border (§3.5) | Hero cards only (ring card, The Bar card, duel card, PR card, story card). Max 4 on screen at once. |
| **Chalk edge** | Pre-made SVG mask with a rough-edge path (≤2 KB) on PR stamps, hype stamps and the plate-count plate | Static |
| **Knurl hatch** | `repeating-linear-gradient(45deg, rgba(242,240,235,.08) 0 1px, transparent 1px 4px)` crossed with the same at −45deg | RACK IT button and plate-calc bar sleeve only |
| **Glass** | `backdrop-filter: blur(16px) saturate(140%)` over `rgba(18,18,20,0.72)` | Bottom nav and rest-timer sheet only. **Never more than 2 blurred layers at once.** Without `@supports (backdrop-filter: blur(1px))` → solid `--surface-2`. With Battery saver → solid. |
| **Glow** | Radial gradient of `--molten-glow` to transparent, **baked as a gradient**, never a live `filter: blur()` | Live timer ring, PR number, pending plate, Obsidian rim |

- **Battery saver** (Settings toggle, default off) turns off grain, glass, the 3D plate route and the flame breath.
- **Animation rule:** only `transform` and `opacity` are animated, plus `font-variation-settings` for the one flex moment. Budgets are in §7.

---

### 3.7 Motion language

**Libraries:**
- `motion` (npm, formerly Framer Motion) for springs, gestures and layout.
- CSS transitions for simple fades.
- The View Transitions API (`document.startViewTransition`, feature-detected; the fallback is an instant swap) for exercise card → S14 detail morphs and tab changes.

#### 3.7.1 Tokens

| Token | Value | Use |
|---|---|---|
| `--d-instant` | 90ms | Press feedback (scale 0.97, `--surface-3`) |
| `--d-fast` | 160ms | Toggles, chips, RPE pills |
| `--d-base` | 240ms | Sheets, card expand, toasts |
| `--d-slow` | 420ms | Screen transitions, tier cross-fade (400ms) |
| `--d-hero` | 1200–1800ms | Tier-1 moments |
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Default CSS easing |
| Spring **UI** | stiffness 400, damping 30 | Sheets, cards, nav, swipe snap |
| Spring **SLAM** | stiffness 600, damping 18 (visible overshoot) | PR number, "set logged" stamp |
| Spring **HEAVY** | stiffness 220, damping 26, mass 1.4 | Plates sliding onto The Bar or the plate calc, ring segments filling |

Export these as `src/ui/motion.ts`, for example `export const SLAM = { type: 'spring', stiffness: 600, damping: 18 }`. No component writes its own spring numbers.

#### 3.7.2 Moment hierarchy

The big animation is rationed, and that rationing is what keeps it impressive.

| Tier | Moments | Treatment |
|---|---|---|
| **Tier 1: takeover** (full screen; sound if on; Android haptic) | ① **PR** (§3.9.4) · ② **Co-op ring closes**: every crew member hit target (§3.9.1) · ③ **Season or duel win** (§3.9.3) · ④ **The Bar tier-up** (Iron→Steel→Titanium→Obsidian) | A 1.2–1.8s choreographed sequence. **Max one Tier-1 per screen open.** If two trigger together, queue them with a 400ms gap, PR first. A queued Tier-1 that doesn't fit in this open plays on the next open. |
| **Tier 2: card-level** | Partner's PR shockwave (next app open), own segment filled, MIN logged, comeback day, plate added at week close | 600–900ms. The card pulses (scale 1 → 1.02 → 1, UI spring), the ring segment fills with the HEAVY spring, and a chalk puff of ≤20 particles fires. No full-screen dim. |
| **Tier 3: micro** | Set logged, undo, timer tick, number change, stepper press | **Set logged:** the card compresses scale 0.96 → 1 with SLAM plus a 4px vertical "plate drop" shake (one cycle: 0 → 4px → 0, 160ms); the weight number flexes `wdth` 100 → 125 → 100 over 240ms; "clank" plays if sound is on; Android `[18]`. |
| **Never animated** | The Bar losing a plate, tier drop, rest week, lost duel | A quiet 400ms cross-fade to the new state. No shake, no red, no sound. |

**Gestures:**
- **Swipe a set row left** (§2 F8): the row follows the finger. Past 40% of its width it snaps away with the UI spring and a 5s toast "Undone · Restore" appears in the thumb zone. Below 40% it springs back.
- **Swipe a sheet down:** closes it, or minimises it for the timer (§3.9.5).
- **Long-press:**
  - 450ms on the MIN button opens the label picker.
  - 450ms on a partner's set or PR opens the hype stamp tray.
  - Steppers auto-repeat every 120ms after a 400ms hold.
- **Hold-to-confirm** (RACK IT and delete-session):
  - 600ms for RACK IT. The knurled button fills left to right with `--molten` while a 2px ring traces its border.
  - Releasing early springs it back with no action.
  - At completion: Tier-3 shake, then navigate to S10.
  - Delete-session uses a 1200ms hold in `--danger` with the trash icon and the label "Hold to delete session".

#### 3.7.3 Reduced motion

Triggered by `prefers-reduced-motion: reduce` **or** Settings → "Reduce motion" (`profiles.reduce_motion`).
- **Removed:** confetti and canvas particles, shake, spin, parallax, flame breath, 3D, `wdth` flex, View Transitions morphs.
- **Kept:** opacity fades of ≤200ms and instant state changes.
- Tier-1 becomes a **static card** (same content, final frame) faded in over 200ms.
- Number tickers jump.
- E2E checks that no `<canvas>` exists during a PR under reduced motion (§7).

---

### 3.8 Sound and haptics

**Sound:**
- A Web Audio API synth with no audio files (≈0 KB) in `src/platform/audio.ts`.
- **Off by default** (`profiles.sound_on = false`). There is a toggle in S16 and a speaker toggle on the rest-timer sheet.
- The `AudioContext` is created and resumed on the **first user tap of each launch**.
- If `navigator.audioSession` exists, set `navigator.audioSession.type = "playback"` ⚠️ (check on device whether it plays through the iOS silent switch; if it doesn't, nothing changes).
- If audio cannot play, nothing breaks and nothing is shown.

| Cue | Synthesis | Length |
|---|---|---|
| Set logged, "clank" | 2 detuned sines at 110 Hz and 165 Hz, gain envelope 0 → 0.5 in 5ms → 0 in 170ms, plus a 40ms white-noise burst through a bandpass at 2.5 kHz (Q 1.2) | 180ms |
| Timer 3-2-1 | 880 Hz sine ticks at T−3, T−2, T−1 | 3 × 60ms |
| Timer zero bell | Two-tone 660 → 990 Hz, played 3× at 300ms spacing | ~900ms |
| PR riser | Noise through a bandpass sweeping 400 Hz → 4 kHz over 900ms, into a 55 Hz sine impact (200ms decay) | 1.1s |
| Ring close | Ascending power chord: root, fifth, octave (A2 110 Hz → E3 165 Hz → A3 220 Hz), 180ms per note, overlapping tails | 700ms |
| Plate on/off (plate calc) | A clank at 60% gain with a 120ms decay | 120ms |

**Haptics** (`src/platform/haptics.ts`):
- **Android:** `navigator.vibrate` when `'vibrate' in navigator`.

  | Event | Pattern |
  |---|---|
  | Set logged | `[18]` |
  | Timer zero | `[80,60,80,60,200]` (D7) |
  | PR | `[30,40,30,40,120]` |

  Gated by Settings → Haptics (default on).
- **iOS:** there is no Vibration API.
  - An optional enhancement sits behind the feature flag `iosHapticsTrick` (default **off**): the hidden `<input type="checkbox" switch>` label-click technique (as used by the `ios-haptics` package) ⚠️.
  - One tester reports Apple patched it in iOS 26.5; that is unconfirmed. Treat it as a bonus if it works and assume it doesn't.
  - If it can't be confirmed on [FRIEND]'s or the friend's iPhone, leave it off and say so in the Phase report (§6).
- **Every haptic has a visual twin, and no haptic carries meaning on its own.** On iPhone, timer zero is a full-screen molten flash plus sound (if on) plus "Bar's loaded."

---

### 3.9 Hero components (build specs)

Each component lives in `src/ui/` or `src/features/*/` and gets a Storybook-free **`/dev/gallery` route**. That route is behind `import.meta.env.DEV` and is stripped from production. It renders every state listed below, so the reviewer agent can screenshot them.

#### 3.9.1 Co-op ring, "The Week" (S4 Floor)

**Anatomy:**
- A hero card (20px radius, steel edge) holding a 220px SVG ring: stroke 18px, track `--line`, round caps per segment.
- **Segment count** = Σ each member's `weekly_target`. For two members at 3, that's 6.
- Segments are separated by 6° gaps, start at 12 o'clock and run clockwise.
- Each member owns a **contiguous arc**. With two members, A's arc runs from 12 o'clock clockwise and B's from 12 o'clock counter-clockwise, so both climb toward 6 o'clock and meet. With N > 2, arcs go in join order, clockwise.
- **Centre:**
  - The eyebrow "THIS WEEK" (`--t-xs` muted).
  - The count "4/6" (`--t-xl` Big Shoulders 800; half credits show as "3.5/6").
  - "Resets Mon" (`--t-sm` muted).
- **Below the ring:** one 48px row per member: a 3px left bar in their colour, the initial chip, the name, and "2/3 · 1 MIN" in mono.
- **Personal ring:** sits beside the co-op ring on S4. It is the same component at 140px with stroke 14 and your segments only.

**Segment fill states:**

| State | Look |
|---|---|
| Empty | Track only |
| MIN (0.5 credit) | **Half-thickness stroke (9px), centred, filling the whole segment arc**, in the owner's colour (D17) |
| Full (1 credit) | Full 18px stroke, owner's colour, owner's pattern (§3.2.2) |
| Trained together (stretch train-together mode) | Full stroke plus a baked molten inner glow |
| Over target | Credits beyond target show as a 2px chalk outer tick per extra credit, outside the ring. The ring never overflows. |

**Animations:**
- **Own segment fills** (Tier 2): the stroke dash animates with HEAVY over about 700ms, plus a ≤20-particle chalk puff at the segment end.
- **Partner logs while the card is visible:** his segment fills live (Tier 2).
- **Close event** (Tier 1, every member FULL), about 1.6s:
  1. Segments flash chalk in sequence, with a 40ms stagger.
  2. The ring spins one full turn with HEAVY.
  3. A molten glow blooms behind it.
  4. The centre becomes **"CLOSED"** (Big Shoulders 900).
  5. The ring-close chord plays.
  6. ≤60 chalk particles fall.
  7. Copy below: "CLOSED. Both of you. That's the job." With N > 2: "CLOSED. All of you. That's the job."

  Each member sees it once on their next open. It is tracked locally, and keyed by week start plus `crew_id`.
- **Reduced motion:** a static "CLOSED" card with a 200ms fade.

**Accessible name:** "Week: 4 of 6 sessions. {nameA} 2 of 3, {nameB} 2 of 3, 1 MIN."

**Comeback state** (§2 F16): both rings are replaced by a card reading "Welcome back. You owe nothing.", with two 64px buttons: **20-min session** (molten) and **Just log MIN** (`--surface-2`). No count of days, no red, no loss animation.

#### 3.9.2 The Bar strip and forge flame

**Anatomy:**
- A full-width hero card, 96px tall.
- **Left:** a side-on SVG barbell with loaded plates. One plate per earned plate, drawn as identical chalk-edged steel discs, max 16 drawn; past 16, "+N" in mono.
- **Right:** the **forge flame** with the plate-count plate:
  - A 64px SVG teardrop built from 3 stacked baked gradients: an inner chalk-hot core `#F2F0EB`, a molten mid `#FF4D00`, and the tier colour outside (D10).
  - It sits on a small chalk-edged steel plate showing the plate count `12` (Big Shoulders 900) and the label "PLATES".
  - Tier name eyebrow: "TITANIUM".
- **Spot token:** a small chalk ⧫ beside the plate with "1 spot left", or "Spot used" in muted once used. It resets on the 1st of the calendar month (§2 F14).
- **Pending plate:** after Flow 7's "Week locked.", the next plate is drawn as a ghost (40% opacity, dashed molten outline) until the server closes the week at Monday 00:05 crew time.

**States and copy:**

| State | Look | Copy |
|---|---|---|
| Plate added (week close) | Tier 2: the plate slides on with HEAVY, plus a clank if sound is on | "New week. Clean bar." |
| Bar held | No motion; a chalk "HELD" stamp for 2s | "Bar held." |
| Plate lost | The plate fades out over 400ms. No shake, no red. | "Rest week. The bar will wait." |
| Tier up | Tier 1: the flame's outer gradient cross-fades to the new tier, the plate stamps with SLAM, ≤60 particles | "Steel now. Heavier than last month." (template: "{Tier} now. Heavier than last month.") |
| Tier down | Quiet 400ms cross-fade | "Down a tier. One week gets it back." |
| Spotted | A chalk ⧫ moves from the spotter's side to yours | "{partner} spotted you. Week saved." |
| Edited past week | No animation | "Bar adjusted after edit" (`--t-sm` muted, shown once) |

- **Flame breath:** a CSS `transform: scale(1 → 1.03)` loop over 4s, `animation-play-state: paused` when offscreen (IntersectionObserver) and under reduced motion or Battery saver.
- **Obsidian (16+):** near-black core `#1A1420` with a molten rim and a slow rim shimmer (8s opacity 0.6 → 1). The shimmer is static under reduced motion.
- **Spot offer** (Sunday from 12:00 crew time, partner heading for REST):
  - A card in the thumb zone of S12: "{partner}'s week is light. You can spot him." with a molten **I got you** button (64px).
  - The button is enabled only once your credits reach ≥ target + 1, per §2 F14. Before that, the muted label reads "Log 1 more to spot him."
  - Use a neutral pronoun template if the profile has none: "You can spot {partner}."

#### 3.9.3 Lift-duel card (v1, §2 F30)

**Anatomy:**
- A full-width hero card split vertically by a 2px molten seam.
- "VS" is stamped on the seam in Big Shoulders 900 at 14px, inside a 28px chalk-edged circle.
- **Each half:**
  - The initial chip and name in the owner's colour.
  - The lift name (`--t-md`).
  - The headline **`+4.2%`** (`--t-xl`): the e1RM % change against that person's own trailing 4-week baseline. **Never raw kg.**
  - Below, in muted mono: "e1RM 102.5 → 106.8", shown **only on your own half**. The partner's half shows "e1RM hidden" unless he opted in (§2 §6).
- **Bottom:** a 6px progress bar across the full width. A's colour fills from the left, B's from the right, and they meet at the score ratio.
- Eyebrow: "4 DAYS LEFT".
- **DOTS badge:** a small secondary mono badge, shown only when both members opted in and both have a bodyweight within 14 days.

**States:**
- **Baseline building:** the half shows "Baseline building" in muted where the % would be.
- **Tie:** both halves stamp "EVEN" and each ring gets a co-op half-segment (§2).
- **Win** (Tier 1, 1.4s):
  1. The winner's half expands to 100% width with the UI spring.
  2. The seam bursts into ≤8 molten sparks and ≤60 chalk particles.
  3. A chalk-edged stamp **"TAKEN."** slams in with SLAM.
- **The other half** shows "Next one's yours. +2.1% is still up." in muted (the number is his real improvement). Never a "LOST" banner and never a grey-out.
- **Reduced motion:** static final layout with a 200ms fade.

#### 3.9.4 PR takeover (S9, §2 F7, Flow 4)

The sequence totals about 1.6s. **Tapping anywhere skips to the final frame.** The timer keeps running underneath.

| Time | Event |
|---|---|
| 0–150ms | The screen dims to `rgba(10,10,11,0.92)` (D9). The grain stays visible. |
| 150–450ms | The new number (e.g. `85`) slams in from scale 1.6 → 1 with **SLAM**, at `--t-mega` Big Shoulders 900 chalk, with the baked molten bloom behind it. A 2px camera shake (one cycle) lands on impact. |
| 450–800ms | "+2.5 KG" in molten ticks up with NumberFlow underneath ("+1 REP" for a rep PR at the same weight). The eyebrow shows the PR type. |
| 800–1200ms | "e1RM 108.3 KG" fades in, mono and muted. Then the chalk-dust burst: `canvas-confetti` with ≤120 particles, off-white custom shapes, gravity 0.4, 8 molten sparks, all done by 1.2s. |
| Final frame | Two 64px buttons in the thumb zone: **Back to work** (primary, molten) and **Share** (`--surface-2`, v1, opens §3.9.8). The PR riser sound plays (if on) and the Android `[30,40,30,40,120]` haptic fires. |

- **Eyebrows:** "5-REP PR", "e1RM PR", "VOLUME PR", "LONGEST RUN", "FASTEST 5K". Distance buckets ±5% use the bucket's rounded label, e.g. "FASTEST 10K".
- **Only the highest tier fires per set** (e1RM > rep-max > volume, §2 F7).
- **Sub-line:** "That's the strongest you've ever been on this."
- **Stamp text:** "NEW 5-REP PR." This is the one place an exclamation mark may appear in a stamp variant: "NEW PR!". Default: no exclamation mark.
- **First-ever session:** no takeover; a quiet toast "Baseline set."
- **Reduced motion:** a static card with the number, delta, eyebrow and e1RM, faded in over 200ms. No canvas, no shake.

**Partner's PR shockwave** (Tier 2, Flow 5):
- Plays on his **next app open**, once (`pr_events.seen_by`).
- A 1.5s dimmed card: "{name} · Bench · 85 kg × 5" with a chalk "NEW PR" stamp. His feed card for that PR pulses molten once.
- It never interrupts an active set or the timer; if he's in a session it waits until RACK IT.

#### 3.9.5 Rest timer (S8, §2 F6, Flow 3)

**Anatomy (D5):**
- A glass sheet (`--r-xl` top corners) covering the bottom 55% of the viewport, directly above the workout bar. LOG SET stays tappable below it.
- **Top of the sheet:**
  - The ghost row "Last time: 3×5×80 @8" (mono, muted).
  - Hype stamps land here (§3.9.10).
  - A 48px speaker toggle sits right.
- **Centre:** a 260px ring countdown, stroke 14px `--molten`, draining counter-clockwise, over a `--line` track, with the baked `--molten-glow` behind.
- **Digits:** "1:42" at `--t-mega` in **JetBrains Mono 700 tabular-nums** (D8), chalk.
- **Controls** (bottom of the sheet, each 64px tall, 8px gaps): **−15s** · **+15s** · **Skip** (primary, molten).
- **Minimise:** swipe the sheet down to a 56px pill above the workout bar, still counting ("1:42" mono plus a 2px progress underline).

**Behaviour:**
- It starts automatically when a set is logged.
- Duration: the exercise default (120s compound, 90s isolation, remembered per exercise, §2 F6).
- The countdown is computed from the stored `endsAt` (epoch ms) and re-derived on `visibilitychange`.
- **Last 10s:** the ring brightens (opacity 0.85 → 1) and the digits cross-fade chalk → molten over 160ms. Ticks at T−3/T−2/T−1 if sound is on.
- **At 0:**
  - One full-screen molten flash: a 300ms single pulse, opacity 0 → 0.35 → 0, never strobing (§3.11).
  - The bell plays (if on) and Android vibrates `[80,60,80,60,200]`.
  - The digits are replaced by **"Bar's loaded."** for 1.2s.
  - Then the sheet shrinks into a header chip counting up "+0:12 over" in mono, muted.
- **Logging the next set** resets the timer.
- **Wake Lock:** requested on session start, on every timer start and on every `visibilitychange → visible`.
  - If it fails or is unsupported: a muted chip "Screen may sleep" plus the silent looping-video fallback (§4).
  - Never sniff the user agent.
- **Once per install,** in onboarding: "Timers can't ring while the phone is locked. Keep the screen on, and the app keeps it awake."
- **Accessibility:** `aria-live="polite"` region announcing only "10 seconds" and "Rest over. Bar's loaded."

#### 3.9.6 Plate visual and calculator (v1, §2 F20)

- **2D default (always available):** a side-on SVG barbell. The 20 kg bar is drawn in steel with the knurl hatch on the sleeve. Plates stack outward per side in competition colours, the one place object colours are allowed:

  | Plate | Colour |
  |---|---|
  | 25 | red `#D7263D` |
  | 20 | blue `#2F6BFF` |
  | 15 | yellow `#F2C200` |
  | 10 | green `#2FA84F` |
  | 5 | white `#E8E8E8` |
  | 2.5 | black/steel `#2A2A2E` with a `#5A5A62` rim |
  | 1.25 | chrome gradient `#C9CCD1` → `#8A8A90` |

  Plate heights are proportional (25/20 full height, 15 at 85%, 10 at 70%, 5 at 50%, 2.5 at 38%, 1.25 at 30%).
- **Labels:** each plate shows its kg in Big Shoulders 800 in a contrasting ink (`#0A0A0B` on yellow and white, `#F2F0EB` on the others).
- **Readout:** "PER SIDE: 25 + 10 + 2.5" in mono above the bar.
- **Impossible weights:** round down to the nearest loadable weight and show "Closest: 82.5 kg" in muted.
- **Changing the target weight:** plates slide on and off with HEAVY, a 40ms stagger, and a small clank per plate (if sound is on).
- **Warm-up generator output:** stacked mini-bars, one per warm-up set, labelled "BAR×10 · 40%×5 · 60%×3 · 80%×1" with the computed kg. One 64px **Insert warm-ups** button.
- **3D upgrade (stretch, lazy chunk):**
  - `three` + `@react-three/fiber` + `drei`, a brushed-steel PBR bar, `frameloop="demand"`, DPR ≤ 1.5.
  - Skipped under reduced motion, Battery saver, or a low GPU tier (detect with `drei`'s `PerformanceMonitor` or a WebGL renderer string check; never the user agent).
  - The 2D SVG is always the fallback.

#### 3.9.7 Muscle heatmap (v1, §2 F26)

- **Bodies:** a stylised, **flat**, geometric front and back pair, about 16 regions per side, from one inline SVG with region `id`s matching the `muscle_t` enum (§4). Never anatomical or medical-looking.
- **Fill:** weekly sets per muscle (primary 1.0, secondary 0.5) mapped to a 5-step ramp **in the owner's colour** over `--surface-3`, with alpha 10% / 30% / 55% / 80% / 100% for **0 · 1–4 · 5–9 · 10–14 · 15+** (D13). At 0 the region shows only a `--line` stroke.
- **Duo view:** the two bodies side by side, each in its owner's colour with the initial chip. A segmented control flips Front and Back for both at once.
- **Tap a region** to open a sheet: "Chest · 9 sets this week · last hit Tue". An optional recovery % (stretch) appears as a muted small number, labelled "advisory".
- **Legend:** five swatches labelled "0 · 1–4 · 5–9 · 10–14 · 15+ sets".
- **Accessibility:** a hidden table lists muscle → sets.

#### 3.9.8 Story / share card (v1, §2 F28)

- **Render:** 1080×1920 PNG via canvas (or `html-to-image` on a hidden DOM node). Fonts must be loaded first (`document.fonts.ready`).
- **Share:** the Web Share API Level 2 with files, feature-detected via `navigator.canShare({files})` ⚠️ (check on iOS). The fallback is a download.
- **Layout, top to bottom:**
  1. A grain-textured `--bg` background.
  2. A 12px stripe in the owner's colour down the left edge.
  3. The eyebrow "SAT 24 OCT · PUSH".
  4. The hero number (top set or PR) at 280px Big Shoulders 900.
  5. 3 stat tiles: tonnes, sets, duration.
  6. PR stamps (max 3).
  7. At the bottom, the duo strip: both initial chips, a mini co-op ring, and the forge flame with its plate count.
  8. A tiny SPOTTER wordmark.
- **Weekly recap variant:** both rings, each person's best % gain, and one roast line from the copy bank (§3.10.3).
- **Never on a share card:** bodyweight or raw partner kg.

#### 3.9.9 Logging card and steppers (S6, §2 F3/F4/F5/F10)

**Anatomy (top to bottom):**
- **Header:** the session clock (mono, "14:32") and the sync dot.
- **Exercise name** in `--t-md`. Tap it to swap (opens S7).
- **Progression nudge chip:** molten outline, `--t-sm`, reading "+2.5 → 82.5". Tap applies it; it is never automatic. A long-press tooltip reads "All reps at RPE 8. Add 2.5."
- **Ghost row (v1):** 40% opacity, mono "Set 3 · 5×80 @8".
- **Logged sets list:** rows 56px, mono "1 · 5×80 · @8", with a grey or chalk sync tick.
  - Warm-up rows show a muted "W" chip.
  - A row that matched or beat its ghost gets a 2px chalk border plus the transient copy "Ghost's behind you." (D12).
  - After a row is logged, "Undo" shows on it for 8s.
- **Steppers:**
  - Two stacked rows: kg, then reps.
  - Each has a centre number at `--t-hero` (64px Big Shoulders 900) with the unit at 45% muted.
  - 64×64 **−** and **+** buttons sit on either side (±2.5 kg, ±1 rep; long-press repeats).
  - Tapping the number opens a numeric keypad sheet with 3×4 keys at 64px each, a "." key, and "Done".
- **RPE pill row:** 6, 6.5 … 10. Each pill is 48px, horizontally scrollable, and optional; the selected pill is chalk on `--surface-3`.
- **Workout bar:** LOG SET (72px, molten, `--on-molten` text "LOG SET").

**Validation:** an out-of-range value shows "That's a world record. Check it." in muted under the field, and LOG SET stays enabled after a second tap confirms. The ranges are in §2 §8.

#### 3.9.10 Crew feed, presence and hype

- **Presence banner** (S4 top, S12 top), a 48px row:
  - A pulsing dot (8px, the partner's colour; opacity 1 → 0.4 over 1.6s, static under reduced motion).
  - The copy "{partner} is on the floor · Bench 3/5 · 14 min".
  - It disappears 2 minutes after his last activity or when he finishes.
- **Feed rows:** a 3px left bar in his colour, the modality glyph, mono summary, and a relative time ("2 min").
  - New rows animate in (y 12 → 0, opacity 0 → 1, UI spring).
  - A PR row gets a molten "NEW PR" chalk-edged stamp.
- **Neutral status lines:** "Training now" / "Last trained 2 d ago". Muted, never coloured.
- **Hype tray** (v1): long-press a feed set or PR to open a 4-stamp tray: LIGHT WEIGHT · CLEAN · AGAIN · chalk handprint (D11). Each stamp is a 64px target. Max 3 per set; spent stamps are dimmed.
- **Receiving hype:** the stamp lands at the recipient's **next rest-timer start**, on the timer sheet's top strip. It stamps with SLAM, holds 1.5s, then fades. If no session happens, it shows on the next app open. It is never a push.

#### 3.9.11 Settings → Vault export (S16; symmetric per user; contract in §5)

Every member sees this identically. **Each person exports only their own data.** The copy says so twice: in the section eyebrow and under the token.

**Anatomy:**
- Eyebrow "VAULT EXPORT · YOUR DATA ONLY".
- **Format selector:** a segmented control **Lines** (default) · **JSON** · **CSV**, stored per user (§4/§5).
- **Token states:**
  - None yet: a molten **Generate token** button (64px).
  - Just generated: the token is shown **once** in a mono well (`ipx_…`, wrapped, never truncated), with **Copy** (`--surface-2`). A chalk warning line reads "Shown once. Paste it into your vault agent now."
  - Afterwards: a row with the label, "Created 24 Oct", "Last used 2 h ago", and **Revoke & regenerate** in `--danger` with the revoke icon (1200ms hold).
- **URL shape:** shown in mono as `https://<ref>.supabase.co/functions/v1/export?since=YYYY-MM-DD`, with a Copy button. The token is never part of this string (§5).
- **Live preview:** the first 5 lines of your own export in the selected format, mono, `--surface-2` well, rendered by the same shared formatter as the server (§4).
- **Copy for my AI** (optional, `--surface-2`, 56px): copies a short paste-ready text block (template in §5) explaining the URL, the header auth, the `since` parameter, the chosen format, and the "replace a whole date block" dedupe rule. It **never includes the token**: it says "token: paste it from where you saved it". Toast: "Copied. Paste it to your agent."
- **Errors:** "Token revoked. Old links stop working now." and, from the preview fetch, "Export didn't load. Your data's safe. Try again."

---

### 3.10 Copy voice

**Rules:**
- Short, dry, confident. Present tense.
- Sentence case in the UI; caps only for stamps and eyebrows.
- No exclamation marks except the optional PR stamp variant.
- Hype is about the **effort**, never the body.
- Nothing guilt-trips, and **MIN days get real celebration**.
- `{name}` / `{partner}` are template tokens; no name is hardcoded.
- All strings live in `src/ui/copy.ts` as one object, so the reviewer agent can grep the banned list (§3.12) against a single file.

#### 3.10.1 String bank (use exactly)

| # | Context | String |
|---|---|---|
| 1 | Set logged toast | "Locked in." |
| 2 | Rest timer zero | "Bar's loaded." |
| 3 | Progression nudge (tooltip) | "All reps at RPE 8. Add 2.5." |
| 4 | Nudge chip | "+2.5 → 82.5" |
| 5 | Ghost beaten | "Ghost's behind you." |
| 6 | PR stamp | "NEW 5-REP PR." |
| 7 | PR sub-line | "That's the strongest you've ever been on this." |
| 8 | First-ever session | "Baseline set." |
| 9 | MIN logged | "MIN day. Still counts. Chain's alive." |
| 10 | MIN quick toast | "MIN counts." |
| 11 | Readiness → MIN | "Running on fumes? MIN today. It counts the same." |
| 12 | Readiness buttons | "Do MIN" · "Full send" · "Skip" |
| 13 | Comeback | "Welcome back. You owe nothing." |
| 14 | Comeback buttons | "20-min session" · "Just log MIN" |
| 15 | Ring closed | "CLOSED. Both of you. That's the job." |
| 16 | Week target hit (Flow 7) | "Week locked." |
| 17 | Plate added | "New week. Clean bar." |
| 18 | Bar held | "Bar held." |
| 19 | Rest week | "Rest week. The bar will wait." |
| 20 | Tier up | "{Tier} now. Heavier than last month." |
| 21 | Tier down | "Down a tier. One week gets it back." |
| 22 | Spotted | "{partner} spotted you. Week saved." |
| 23 | Spot offer | "{partner}'s week is light. You can spot him." |
| 24 | Spot button | "I got you" |
| 25 | Partner live | "{partner} is on the floor · Bench 3/5 · 14 min" |
| 26 | Nudge (templated) | "Gym's open. MIN counts." |
| 27 | Hype stamps | "LIGHT WEIGHT" · "CLEAN" · "AGAIN" · chalk handprint |
| 28 | Duel won | "TAKEN." |
| 29 | Duel lost | "Next one's yours. +2.1% is still up." |
| 30 | Duel tie | "EVEN." |
| 31 | Empty Floor | "Log your first set. Everything starts here." |
| 32 | Empty Progress | "Two sessions and the lines start drawing." |
| 33 | Empty Crew | "Crew of one. Send the code:" |
| 34 | Offline banner | "Saved on your phone. Syncs when you're back up." |
| 35 | Server paused | "Server asleep — data safe on phone." |
| 36 | Finish button | "Hold to rack it." |
| 37 | Resume after crash | "Resume session (14 min)?" |
| 38 | Second session blocked | "Finish or discard the open one." |
| 39 | Out of range | "That's a world record. Check it." |
| 40 | Storage full (only blocking error) | "Phone storage full — can't save. Free space and retry." |
| 41 | Dead invite | "Code's dead. Ask for a new one." |
| 42 | OTP rate-limited | "Code delayed — try again in 60 s." (with a live countdown) |
| 43 | Install chip | "Install to keep your data safe." |
| 44 | Magic link opened in Safari | "Now open SPOTTER from your home screen." |
| 45 | Wake Lock failed | "Screen may sleep." |
| 46 | Edit changed a closed week | "Bar adjusted after edit." |
| 47 | Sync dead item | "1 entry couldn't sync." · "Retry" · "Discard" |
| 48 | Undo toast | "Undone · Restore" |
| 49 | Edited on another phone | "Updated from your other phone." |
| 50 | Export token shown | "Shown once. Paste it into your vault agent now." |
| 51 | Copy for my AI | "Copied. Paste it to your agent." |
| 52 | Push opt-in after first PR | "Want to know when {partner} PRs?" |
| 53 | Push: partner PR | "{partner} hit a PR. Go see." |
| 54 | Push: partner started (opt-in) | "{partner} is under the bar." |
| 55 | Push: weekly recap | "Week's in. See the card." |
| 56 | Baseline building (duel/comparison) | "Baseline building." |
| 57 | Readiness eyebrow | "QUICK CHECK" |
| 58 | Lock-in (S3 primary) | "Lock in" |

**Notes on specific strings:**
- **#42:** the Product doc says "Link delayed". The copy is "Code" because login is a 6-digit code (§4).
- **#47:** "couldn't" is allowed: it describes the system, not him.
- **#53–#55:** push copy sits here for voice consistency; whether each push is sent is decided in §2 §4.

#### 3.10.2 Readiness rows (S5)

- Three rows (Sleep · Soreness · Energy), each with 3 tap targets of 64px.
- They show **chalk glyph faces**, not colour emoji: a low / mid / high line glyph drawn in the custom set.
- Scored 0–2 per §2 F13. The decision to use glyphs follows D11 (no emoji in the UI).

#### 3.10.3 Weekly recap roast bank (v1, §2 F29)

- 40 lines, curated, in `src/features/recap/roasts.ts`.
- Each line roasts **the situation or the numbers, never a person's body or worth**. Lines may use `{a}`, `{b}`, `{tonnes}` and `{km}`.
- Examples (the agent writes the remaining 34 in the same voice; the reviewer checks them against §3.12):
  1. "You moved 11.4 tonnes. He ran further. Call it even."
  2. "Three sessions each. The bar is getting heavy to carry."
  3. "A MIN and a PR in one week. Range."
  4. "{km} km between you. The couch filed a complaint."
  5. "The ghost lost twice this week. It's thinking about retiring."
  6. "Rest week for one of you. The bar noticed. The bar doesn't care."

---

### 3.11 Accessibility and one-hand use

- **Contrast:** text ≥4.5:1; large numbers (≥24px) and UI controls ≥3:1. Enforced by §3.2.4.
- **Tap targets:**
  - ≥48×48px everywhere.
  - **≥64px** for LOG SET, Undo, timer −15/+15/Skip, PR buttons, steppers, keypad keys, readiness targets and hype stamps.
  - The primary bar is 72px.
  - At least 8px gap between targets.
- **One hand:**
  - All workout actions sit in the bottom 40% (Playwright asserts that every tap in E2E flow 1 lands there, §7).
  - Number entry uses big ±steppers plus tap-to-type.
  - No action requires reaching the top corners. Back is a swipe-down on sheets, plus a 48px close button at the sheet's bottom-left.
- **Reduced motion:** §3.7.3.
- **Flashing:** never more than 3 flashes per second. Timer zero and PR are single pulses. Nothing strobes, ever.
- **Screen readers:**
  - Semantic `<button>` and `<a>` elements.
  - `aria-label` on every icon button.
  - Ring cards expose text (§3.9.1).
  - Charts (recharts) get a visually hidden `<table>` of the same data.
  - The timer uses `aria-live="polite"` at 10s and 0 only.
  - Toasts use `role="status"`; the storage-full modal uses `role="alertdialog"` with focus trapped.
- **Focus:** a 2px `--text` outline with 2px offset on `:focus-visible`. Never removed.
- **Text scaling:** layouts survive 200% text size. Display sizes use `clamp()`. Set rows wrap rather than truncate. The S6 steppers stack under 340px of effective width.
- **Colour independence:** initials, line patterns, ring hatching and heatmap labels per member (§3.2.2).
- **Language:** `<html lang="en">`. Dates use `Intl.DateTimeFormat('en-GB')` ("Sat 24 Oct"). Weights always use a dot decimal in the UI, matching the export (§5).
- **Layout shift:** ≤0.05 (Arch budget, §7). Reserve space for the presence banner (it slides over content, it doesn't push it) and for async numbers (skeletons of fixed height, `--surface-2`, no shimmer).

---

### 3.12 Anti-pattern list (hard bans; the reviewer agent fails any build that contains one)

1. Skulls, lightning bolts, cartoon fire or emoji fire, colour emoji in the UI chrome. The forge flame on The Bar is the only flame.
2. "BEAST MODE", "NO EXCUSES", "NO PAIN NO GAIN", or any guilt or shame copy.
3. **Banned words** in `copy.ts` and push copy: "beast", "no excuses", "grind", "crush it", "failed", "missed", "lazy", "you broke your streak", "don't give up". CI greps `src/ui/copy.ts` and `supabase/functions/**` for them (case-insensitive) and fails on a hit.
4. Red "failed" or "missed" states. Missed weeks are **grey rest**. `--danger` appears only on destructive buttons with an icon.
5. Any chain that resets to zero in one step. The Bar loses at most one plate per week (§2 F14).
6. Raw-kg leaderboards or raw strength side by side on the Crew front page. Duels use % of each person's own baseline; raw numbers sit one tap deep, on your own data only, unless he opts in.
7. Showing the partner's bodyweight by default, or ever on a share card.
8. Confetti or particles on regular sets. Particles are for Tier 1 (≤120) and Tier 2 puffs (≤20) only.
9. More than one accent colour in the UI chrome, rainbow gradients, neon glows everywhere, or a gold "success" colour.
10. Stock photos, shredded models, anatomical muscle renders.
11. Fake numbers in empty states.
12. Sound on by default.
13. Badge or trophy clutter. The trophy wall holds season cards only.
14. Animated grain, more than 2 blur layers, or 3D running anywhere except the lazy plate-calc route.
15. Push spam, countdowns, or "you haven't trained in X days". Quiet hours are 22:00–08:00 in the recipient's timezone. Push rules are in §2 §4.
16. Energy-drink voice. If a line would fit on a pre-workout tub, cut it.
17. Hardcoded names, emails or surnames anywhere in UI, code, fixtures or seeds.
18. Showing one member's export token, export URL preview or export data to another member. Export UI is self-only (§3.9.11, §5).
19. A UI that asks either user to maintain anything (manual sync buttons as the only path, "clean up your data" prompts). Sync is automatic (§4); the only manual control is retry/discard on a dead outbox item.

---

### 3.13 Verify on device at build time (⚠️ register for this section)

Each item is reported in the Phase report (§6) as "confirmed / not available / fallback active". None may be faked.

| Item | What to check | If it fails |
|---|---|---|
| iOS haptics checkbox-switch trick | Does a tap produce a tick on current iOS (possibly patched in 26.5)? | Leave the flag off |
| Wake Lock in an installed iOS PWA | Was it broken before 18.4 (WebKit 254545)? Does it work now? | Video fallback plus the "Screen may sleep." chip |
| `navigator.audioSession.type = "playback"` | Does it beat the silent switch? | Sound stays optional; the visual flash carries the cue |
| Web Share with files on iOS | `navigator.canShare({files})` | Download fallback |
| oklch conversion | Do the values match the hex sources within ΔE < 1 after `culori`? | Fix the conversion; hex wins |
| `--tier-titanium` `#C9CCD1` | ≥3:1 on `--surface-1`, and distinct from Iron and Steel at a glance | Adjust L only and record the new hex in `tokens.css` and this table |
| `@fontsource-variable/big-shoulders-display` | Package name and axes | Use the static `@fontsource/big-shoulders-display` 700/800/900 within the 4-file budget |

The section came out at about 5,300 words, inside the 4,500–5,500 target. It lists 58 copy strings and records 17 decisions where the three design docs disagreed. It assumes Sections 2, 4, 5, 6 and 7 exist and points to them by number instead of repeating them. Nothing was written to disk.

## 4. Architecture

This section governs every technical question. §2 defines what each feature does and §3 defines how it looks. Where this section names a table, column, endpoint or limit, every other section follows it. Items marked ⚠️ must be checked against MDN, caniuse or the vendor's docs at build time. Never guess them. If a ⚠️ item fails, take the fallback written next to it. If none is written, stop and ask [FRIEND] (§1).

### 4.0 Decisions that resolve the three design docs

The design docs disagree in places. These rulings are final. Log each one in `docs/DECISIONS.md` on the first commit.

| # | Conflict | Decision | Why |
|---|---|---|---|
| D1 | Name: SPOTTER / THE FLOOR / IRONPACT | Product name **SPOTTER**. Repo, Dexie DB and code namespace: `spotter`. Manifest `name` and `short_name`: `SPOTTER`. | The name is a product decision, and the Architecture doc said "rename freely". |
| D2 | Invite table `invites` vs `crew_invites` | `crew_invites` | Architecture wins on schema. |
| D3 | Invite code: 6 characters vs 10 Crockford base32 | **10 characters, Crockford base32**, shown and typed as `XXXXX-XXXXX` in two groups of 5 boxes. This overrides any "6 boxes" wording elsewhere. | 50 bits of entropy. The code is the only gate into a crew. |
| D4 | User colour on `crew_members.color_hue` vs `profiles.color_hue` vs `accent_slot` | `profiles.color_hue`. The pattern slot (A solid, B dashed, C dotted) comes from `crew_members.joined_at` order inside the crew. | One source of truth. The slot follows join order. |
| D5 | Export: run lines per session vs per day | **Per day.** Runs are merged per `local_date`. Martial arts are merged per discipline per day. | "One line per exercise per day" applies to every modality. Architecture wins. |
| D6 | Export RPE: heaviest set vs max | **Max RPE across working sets.** | Architecture. It is also deterministic for the merged run and martial lines. |
| D7 | Export notes and their cap | Distinct set or entry notes in chronological order, joined `; `. The session note is appended to the **first lift line of that session**. Cap is 120 characters. | Merges Product rule 5 into the Architecture cap. |
| D8 | Export line order within a date | Weight → lifts (by first `logged_at` ascending) → martial arts → Run → MIN. Dates run newest first. | Architecture. |
| D9 | `local_date` of a set: "at logging" vs "session start" | `sessions.local_date` = the user-tz date when the session **started**. Child rows (`sets`, `cardio_entries`, `martial_entries`, `min_entries`) **inherit** it, and a trigger enforces this. Standalone rows (`bodyweight_entries`) use the user-tz date at logging. | A session that runs past midnight stays on one day. Architecture's "computed on the client" still holds. |
| D10 | Validation ranges | Product ranges apply in Zod **and** in DB `check`s: kg −250…500 (negative values only on `bw_lift`), reps 1–100, RPE 6–10 in 0.5 steps, run 0.1–100 km, martial arts 1–480 min, bodyweight 30–250 kg, display name 1–16 characters. | These are feature rules, so Product wins. |
| D11 | Credits per day: max 1.0 vs max 2.0 | **Max 2.0 per local day**, as in §2. | Feature rule, so Product wins. |
| D12 | Streak and tokens | Use §2's **The Bar** (±1 plate) and **spots only**. `streak_tokens.kind` = `'spot'`. There are no freezes. Architecture's tier-drop rule is superseded. | Feature rule, so Product wins. |
| D13 | Readiness scale: 1–3 with sum ≤4 vs 0–2 with sum ≤2 | Each row is 0–2. A total ≤2 suggests MIN. Stored as `readiness = {sleep,soreness,energy}` with each value 0–2. | Feature rule, so Product wins. |
| D14 | Progression nudge without RPE | When RPE is missing and every working set reached target reps, **nudge anyway**, as §2 F5 says. | Feature rule, so Product wins. |
| D15 | Pushes | Push events follow the §2 §4 table: partner PR, nudge, weekly recap, spot available, and partner start (opt-in, off by default). Max 3 per recipient per day. Quiet hours 22:00–08:00 in the recipient's tz. | Feature rule, so Product wins. Architecture's "PRs never push" is superseded. |
| D16 | Reaction emoji | `emoji in ('fire','gorilla','skull')`, rendered as 🔥 🦍 💀. | Product. |
| D17 | Fonts | Self-host through `@fontsource-variable/*` and precache them. No Google Fonts CDN at runtime. | Offline in the basement wins. |
| D18 | Budgets: JS 200 vs 170 KB, CLS 0.1 vs 0.05, fonts 180 vs 220 KB | JS ≤170 KB, CLS ≤0.05, fonts ≤220 KB. If fonts run over, drop Anybody first, as §3 says. | Architecture wins on technical matters. |
| D19 | Haptic patterns | §3's patterns: set `[18]`, timer zero `[80,60,80,60,200]`, PR `[30,40,30,40,120]`. | Interaction feel, so Visual wins. |
| D20 | Export tokens | Prefix `spx_`. **Symmetric:** every user, [FRIEND] included, has their own tokens and pulls only their own data. Per-user format setting: `lines` (default), `json` or `csv`. | The correction that each user has a vault. |
| D21 | Week close and The Bar storage | New derived table `crew_weeks`, written only by the `week-close` function and recomputable from source rows at any time. | §2 needs a server-authoritative week close. Raw rows stay the truth. |
| D22 | Listing export tokens: view vs RPC | RPC `list_export_tokens()`. There is no view. | A PG15 view runs with its owner's rights and could leak the hash. |

### 4.1 Stack

Pin **exact** versions at scaffold time. Check each one with `npm view <pkg> version`. If the current stable major differs from this table, use the current stable major and record it in `docs/DECISIONS.md`. Never downgrade to match the table.

| Layer | Package(s) | Expected major | Notes |
|---|---|---|---|
| Build | `vite`, `@vitejs/plugin-react` | 7.x (8.x may be current ⚠️) | |
| UI | `react`, `react-dom`, `typescript` | 19, 5.x | `strict: true`, `noUncheckedIndexedAccess: true` |
| Routing | `react-router` | 7.x | SPA data mode. No SSR. |
| Styling | `tailwindcss`, `@tailwindcss/vite` | 4.x | Tokens are CSS custom properties in `oklch()` (§3) |
| Motion | `motion` | ⚠️ The Architecture doc said 14.x. Use whatever is current, last checked at 12.x. | Springs from §3 |
| Numbers | `@number-flow/react` | 0.x ⚠️ | |
| Charts | `recharts` | 3.x | Lazy on Progress |
| Celebration | `canvas-confetti` | 1.9.x | Lazy, Tier-1 only |
| 3D (stretch) | `three`, `@react-three/fiber`, `@react-three/drei` | current / 9.x / 10.x ⚠️ | Plate-calc route only, lazy |
| Local DB | `dexie`, `dexie-react-hooks` | 4.x | |
| UI state | `zustand` | 5.x | Ephemeral UI only. Data lives in Dexie. |
| Validation | `zod` | 4.x | Shared between outbox and forms |
| Dates/tz | `date-fns`, `@date-fns/tz` | 4.x | `TZDate` for every week boundary |
| IDs | `uuid` | current | `v4` = `crypto.randomUUID()`. `v5` for bodyweight ids (§4.6). |
| PWA | `vite-plugin-pwa` (`strategies: 'injectManifest'`), `workbox-precaching`, `workbox-routing`, `workbox-strategies` | ⚠️ vite-plugin-pwa 1.x (the Architecture doc said 2.x), Workbox 7.x | |
| Icons | `@vite-pwa/assets-generator`, `lucide-react` | current | |
| Fonts | `@fontsource-variable/big-shoulders` ⚠️ (the package may be named `big-shoulders-display`; use whichever exists with an `opsz` axis), `@fontsource-variable/inter-tight`, `@fontsource-variable/jetbrains-mono`, optional `@fontsource-variable/anybody` | current | Latin subset only |
| Backend | Supabase (Postgres 15+, Auth, Realtime, Edge Functions on Deno, `pg_cron`, `pg_net`, Vault), `@supabase/supabase-js` | 2.x | Free tier |
| Push sender | `npm:web-push` in Deno | 3.6.x ⚠️ Deno compatibility. Fallback `jsr:@negrel/webpush`. | |
| Tests | `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `fake-indexeddb`, pgTAP via `supabase test db`, `@lhci/cli` | current | |
| Hosting | Cloudflare Pages | — | Static `dist/` |

**Rule:** we run no server of our own. Logic lives in Postgres (RLS, RPCs, triggers, `pg_cron`) or in Edge Functions.

### 4.2 Repo tree

```
spotter/
├─ index.html
├─ src/
│  ├─ main.tsx  App.tsx  router.tsx  sw.ts            # sw.ts = hand-written service worker
│  ├─ core/        # PURE: no React, no I/O, tz passed explicitly; ≥95% line coverage
│  │  e1rm.ts volume.ts weeks.ts credits.ts bar.ts prs.ts progression.ts prefill.ts
│  │  ghost.ts warmup.ts plates.ts shorthand.ts readiness.ts duel.ts season.ts dots.ts
│  │  heatmap.ts comeback.ts validate.ts (zod schemas, shared with outbox)
│  ├─ data/
│  │  db.ts outbox.ts sync.ts pull.ts realtime.ts supabase.ts ids.ts clock.ts
│  │  adapter.ts (interface)  adapter.supabase.ts  adapter.mock.ts (VITE_BACKEND=mock)
│  ├─ features/
│  │  onboarding/ auth/ crew/ floor/ log/ session/ timer/ quicklog/ crew-feed/
│  │  progress/ prs/ challenges/ plate-calc/ settings/ export/ recap/ share/
│  ├─ platform/    # feature-detected device APIs, each with a no-op fallback
│  │  wakeLock.ts audio.ts haptics.ts push.ts install.ts share.ts storage.ts
│  ├─ ui/          # tokens.css Button Ring BigNumber Stepper Sheet Toast Chip HoldButton
│  └─ assets/      # body-front.svg body-back.svg icon.svg grain-256.png keepawake.mp4
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/  0001_schema.sql 0002_rls.sql 0003_rpc.sql 0004_realtime.sql 0005_cron.sql
│  ├─ seed.sql     # ~60 global exercises + exercise_muscles
│  ├─ tests/       # pgTAP: rls.test.sql invites.test.sql export_tokens.test.sql
│  └─ functions/
│     ├─ _shared/  export-format.ts e1rm.ts crockford.ts   # dependency-free TS, explicit .ts imports
│     ├─ export/index.ts  push-dispatch/index.ts  weekly-recap/index.ts
│     ├─ week-close/index.ts  delete-account/index.ts  health/index.ts
├─ tests/unit/  tests/e2e/  tests/fixtures/export/
├─ public/_headers  public/icons/*
├─ .github/workflows/ci.yml  keepalive.yml  .github/dependabot.yml
├─ docs/SETUP.md (= §8 verbatim)  docs/EXPORT.md (= §5 verbatim)  docs/DECISIONS.md
├─ heartbeat.txt  .env.example  lighthouserc.json
```

`src` imports `supabase/functions/_shared/*.ts` through the Vite alias `@shared`, with `allowImportingTsExtensions: true`. **One formatter** then serves the in-app export preview and the server export.

`.env.example` holds names only: `VITE_SUPABASE_URL=`, `VITE_SUPABASE_ANON_KEY=`, `VITE_VAPID_PUBLIC_KEY=`, `VITE_BACKEND=supabase`. Server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `DISPATCH_SECRET`) live only in `supabase secrets` and never in a `VITE_*` variable.

### 4.3 Data model (`0001_schema.sql`)

**Common columns.** Each table marked `/* +common */` literally includes this block:

```sql
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_date        date not null,              -- see D9
  client_updated_at timestamptz not null,
  updated_at        timestamptz not null default now(),
  received_at       timestamptz not null default now(),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now()
  -- indexes: (user_id, local_date desc), (updated_at)
```

```sql
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net;

create type public.muscle_t as enum ('chest','front_delts','side_delts','rear_delts','biceps',
  'triceps','forearms','lats','upper_back','traps','lower_back','abs','obliques','glutes',
  'quads','hamstrings','adductors','calves');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 16 and display_name !~ '·'),
  initial text not null check (char_length(initial) = 1),
  color_hue smallint not null check (color_hue between 0 and 359),   -- Volt≈125, Ice≈220
  tz text not null default 'Europe/Amsterdam',
  weekly_target smallint not null default 3 check (weekly_target between 1 and 7),
  show_bodyweight boolean not null default false,
  share_dots boolean not null default false,
  sound_on boolean not null default false,
  haptics_on boolean not null default true,
  reduce_motion boolean not null default false,
  battery_saver boolean not null default false,
  big_jumps boolean not null default false,
  theme text not null default 'dark' check (theme in ('dark','light','system')),
  quiet_start time not null default '22:00', quiet_end time not null default '08:00',
  notify jsonb not null default
    '{"partner_start":false,"partner_pr":true,"nudge":true,"recap":true,"spot":true}',
  min_default_label text not null default '20m walk' check (char_length(min_default_label) between 1 and 40),
  gym_treat_url text check (gym_treat_url ~ '^https://'),
  bar_kg numeric(5,2) not null default 20,
  plates_kg numeric[] not null default '{25,20,15,10,5,2.5,1.25}',
  export_format text not null default 'lines' check (export_format in ('lines','json','csv')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.crews (
  id uuid primary key, name text not null check (char_length(name) between 1 and 24),
  tz text not null default 'Europe/Amsterdam', max_members smallint not null default 8,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now());

create table public.crew_members (
  crew_id uuid not null references public.crews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','member')),
  joined_at timestamptz not null default now(), left_at timestamptz,
  primary key (crew_id, user_id));
create index on public.crew_members(user_id);

create table public.crew_invites (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews(id) on delete cascade,
  code_hash text not null unique,                       -- sha256 hex of the normalised code
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users(id), used_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now());

create table public.exercises (
  id uuid primary key, owner_id uuid references auth.users(id),   -- null = global seed
  name text not null check (char_length(name) between 1 and 40),
  export_label text not null check (char_length(export_label) between 1 and 24 and export_label !~ '·'),
  aliases text[] not null default '{}',
  kind text not null check (kind in ('lift','bw_lift','run','martial')),
  category text not null default 'compound' check (category in ('compound','isolation')),
  lower_body boolean not null default false,          -- drives F5 big jumps
  equipment text, increment_kg numeric(4,2) not null default 2.5,
  rep_target smallint not null default 5 check (rep_target between 1 and 100),
  client_updated_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, created_at timestamptz not null default now());
create unique index exercises_label_uq on public.exercises
  (coalesce(owner_id,'00000000-0000-0000-0000-000000000000'::uuid), lower(export_label))
  where deleted_at is null;

create table public.exercise_muscles (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  muscle public.muscle_t not null, weight numeric(2,1) not null check (weight in (1.0, 0.5)),
  primary key (exercise_id, muscle));

create table public.exercise_prefs (id uuid primary key, exercise_id uuid not null references public.exercises(id),
  rest_s smallint not null check (rest_s between 15 and 600) /* +common */, unique (user_id, exercise_id));

create table public.sessions (
  id uuid primary key,
  kind text not null check (kind in ('gym','run','martial','min')),
  mode text not null default 'full' check (mode in ('full','min')),
  started_at timestamptz not null, ended_at timestamptz, tz text not null,
  readiness jsonb check (readiness is null or (
    (readiness->>'sleep')::int between 0 and 2 and (readiness->>'soreness')::int between 0 and 2
    and (readiness->>'energy')::int between 0 and 2)),
  together_id uuid, note text check (char_length(note) <= 200)
  /* +common */);

create table public.sets (
  id uuid primary key, session_id uuid not null references public.sessions(id),
  exercise_id uuid not null references public.exercises(id),
  set_index smallint not null check (set_index >= 1),
  reps smallint not null check (reps between 1 and 100),
  weight_kg numeric(6,2) not null check (weight_kg between -250 and 500),  -- bw_lift: ADDED load
  rpe numeric(3,1) check (rpe between 6 and 10 and rpe * 2 = trunc(rpe * 2)),
  is_warmup boolean not null default false,
  note text check (char_length(note) <= 120), logged_at timestamptz not null
  /* +common */);
create index on public.sets(user_id, exercise_id, logged_at desc);

create table public.cardio_entries (
  id uuid primary key, session_id uuid not null references public.sessions(id),
  activity text not null default 'Run' check (activity = 'Run'),
  distance_m integer not null check (distance_m between 100 and 100000),
  duration_s integer not null check (duration_s between 1 and 86400),
  rpe numeric(3,1) check (rpe between 6 and 10 and rpe*2 = trunc(rpe*2)),
  note text check (char_length(note) <= 120), logged_at timestamptz not null /* +common */);

create table public.martial_entries (
  id uuid primary key, session_id uuid not null references public.sessions(id),
  discipline text not null check (char_length(discipline) between 1 and 16 and discipline !~ '·'),
  duration_min smallint not null check (duration_min between 1 and 480),
  rounds smallint check (rounds between 1 and 99),
  rpe numeric(3,1) check (rpe between 6 and 10 and rpe*2 = trunc(rpe*2)),
  note text check (char_length(note) <= 120), logged_at timestamptz not null /* +common */);

create table public.bodyweight_entries (
  id uuid primary key,                                  -- uuidv5(user_id:local_date), see §4.6
  weight_kg numeric(4,1) not null check (weight_kg between 30 and 250),
  measured_at timestamptz not null /* +common */);
create index on public.bodyweight_entries(user_id, measured_at desc);

create table public.min_entries (
  id uuid primary key, session_id uuid not null references public.sessions(id),
  description text not null check (char_length(description) between 1 and 40),
  duration_min smallint check (duration_min between 1 and 480), logged_at timestamptz not null /* +common */);

create table public.goals (id uuid primary key,
  kind text not null check (kind in ('weekly_sessions','e1rm','bodyweight','run_distance')),
  exercise_id uuid references public.exercises(id), target_value numeric not null, unit text not null,
  starts_on date not null, ends_on date, achieved_at timestamptz /* +common */);

create table public.pr_events (id uuid primary key, exercise_id uuid references public.exercises(id),
  source_id uuid not null, pr_type text not null check (pr_type in ('e1rm','rep_max','volume','distance','pace')),
  reps smallint, value numeric not null, previous_value numeric, pct_over_previous numeric,
  seen_by uuid[] not null default '{}' /* +common */);

create table public.reactions (id uuid primary key, crew_id uuid not null references public.crews(id),
  to_user uuid not null references auth.users(id),
  target_type text not null check (target_type in ('set','session','pr_event')), target_id uuid not null,
  emoji text not null check (emoji in ('fire','gorilla','skull')), seen_at timestamptz /* +common, user_id = from_user */,
  unique (user_id, target_id, emoji));

create table public.nudges (id uuid primary key, crew_id uuid not null references public.crews(id),
  from_user uuid not null references auth.users(id), to_user uuid not null references auth.users(id),
  template_key text not null default 'gym_open', sent_on date not null, seen_at timestamptz,
  acted_on boolean, created_at timestamptz not null default now(), unique (from_user, to_user, sent_on));

create table public.streak_tokens (id uuid primary key, crew_id uuid not null references public.crews(id),
  kind text not null check (kind = 'spot'), week_start date not null, covers_user_id uuid not null
  /* +common */, unique (crew_id, user_id, kind, week_start));

create table public.crew_weeks (crew_id uuid not null references public.crews(id), week_start date not null,
  statuses jsonb not null,            -- {"<user_id>":{"credits":3.5,"target":3,"status":"FULL|HELD|REST","spotted_by":null}}
  plate_delta smallint not null check (plate_delta between -1 and 1), plates_after integer not null check (plates_after >= 0),
  adjusted_after_edit boolean not null default false, computed_at timestamptz not null default now(),
  primary key (crew_id, week_start));

create table public.challenges (id uuid primary key, crew_id uuid not null references public.crews(id),
  created_by uuid not null references auth.users(id),
  kind text not null check (kind in ('e1rm_pct','sessions','run_km','season')), exercise_id uuid,
  starts_on date not null check (extract(isodow from starts_on) = 1), ends_on date not null,
  stake_text text check (char_length(stake_text) <= 80),
  status text not null check (status in ('proposed','active','settled','cancelled')),
  winner_user_id uuid, settled_at timestamptz, updated_at timestamptz not null default now(),
  created_at timestamptz not null default now());
create table public.challenge_participants (challenge_id uuid references public.challenges(id) on delete cascade,
  user_id uuid references auth.users(id), accepted_at timestamptz, baseline_value numeric,
  final_value numeric, score numeric, primary key (challenge_id, user_id));

create table public.push_subscriptions (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade, endpoint text not null unique,
  p256dh text not null, auth text not null, ua text, created_at timestamptz not null default now(),
  last_ok_at timestamptz, fail_count smallint not null default 0);

create table public.push_log (user_id uuid not null references auth.users(id) on delete cascade,
  sent_on date not null, count smallint not null default 0, primary key (user_id, sent_on));

create table public.export_tokens (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique, label text not null default 'My vault' check (char_length(label) <= 32),
  created_at timestamptz not null default now(), revoked_at timestamptz, last_used_at timestamptz,
  window_start timestamptz not null default now(), window_count integer not null default 0);
```

**Triggers.** These apply to every table with `client_updated_at`.

- `set_updated_at` runs BEFORE UPDATE: `NEW.updated_at := now(); NEW.received_at := now();`.
- `lww_guard` runs BEFORE UPDATE: `if NEW.client_updated_at < OLD.client_updated_at then return OLD; end if;`. The older write is silently dropped. If both values are equal, the write that arrives later wins, because `received_at` breaks the tie.
- `enforce_owner` runs BEFORE INSERT OR UPDATE on `sets`, `cardio_entries`, `martial_entries` and `min_entries`. It loads the parent session and raises `'owner_mismatch'` if `session.user_id <> NEW.user_id`. It then sets `NEW.local_date := session.local_date`, which enforces D9.
- `enforce_bw_negative` runs on `sets`. It raises an error if `NEW.weight_kg < 0` and the exercise's `kind <> 'bw_lift'`.
- `cascade_pr_delete` runs AFTER UPDATE OF `deleted_at` on `sets` and `cardio_entries`. It soft-deletes the `pr_events` rows whose `source_id = NEW.id`. The client also does this in the same outbox batch, and the trigger is the safety net.

**Seed.** `seed.sql` holds about 60 global exercises with `export_label`, `kind`, `category`, `lower_body` and muscles at weight 1.0 or 0.5. It must include at least Bench, Incline Bench, OHP, Squat, Front Squat, Deadlift, RDL, Hip Thrust, Leg Press, Row, Pull-up, Chin-up, Dip, Lat Pulldown, Curl, Triceps Pushdown, Lateral Raise, Leg Curl, Leg Extension, Calf Raise and Plank, plus the aliases used by the shorthand parser. Examples: `bench`, `bp` → Bench; `ohp`, `press` → OHP; `dl` → Deadlift.

### 4.4 Security rules (`0002_rls.sql`, `0003_rpc.sql`)

```sql
create function public.is_crewmate(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.crew_members a join public.crew_members b using (crew_id)
    where a.user_id = (select auth.uid()) and b.user_id = target
      and a.left_at is null and b.left_at is null);
$$;
create function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.crew_members where crew_id = c
    and user_id = (select auth.uid()) and left_at is null);
$$;

-- Every public table: RLS on.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop; end $$;

-- Owner-writes, crew-reads group. There is NO delete policy: soft delete only.
do $$ declare t text; begin
  foreach t in array array['sessions','sets','cardio_entries','martial_entries','min_entries',
                           'goals','pr_events','exercise_prefs'] loop
    execute format($f$create policy %1$s_sel on public.%1$I for select to authenticated
      using (user_id = (select auth.uid()) or public.is_crewmate(user_id))$f$, t);
    execute format($f$create policy %1$s_ins on public.%1$I for insert to authenticated
      with check (user_id = (select auth.uid()))$f$, t);
    execute format($f$create policy %1$s_upd on public.%1$I for update to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$f$, t);
  end loop; end $$;

create policy bw_sel on public.bodyweight_entries for select to authenticated using (
  user_id = (select auth.uid()) or (public.is_crewmate(user_id)
    and (select p.show_bodyweight from public.profiles p where p.id = user_id)));
create policy bw_ins on public.bodyweight_entries for insert to authenticated with check (user_id = (select auth.uid()));
create policy bw_upd on public.bodyweight_entries for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy prof_sel on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_crewmate(id));
create policy prof_ins on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy prof_upd on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy ex_sel on public.exercises for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()) or public.is_crewmate(owner_id));
create policy ex_ins on public.exercises for insert to authenticated with check (owner_id = (select auth.uid()));
create policy ex_upd on public.exercises for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy exm_sel on public.exercise_muscles for select to authenticated using (true);
create policy exm_ins on public.exercise_muscles for insert to authenticated with check (exists
  (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())));

create policy crews_sel on public.crews for select to authenticated using (public.is_member(id));
create policy cm_sel on public.crew_members for select to authenticated using (public.is_member(crew_id));
-- crews/crew_members: no insert/update/delete policies → RPC only.
-- crew_invites, export_tokens, push_log: NO client policies at all → RPC/service role only.

create policy cw_sel on public.crew_weeks for select to authenticated using (public.is_member(crew_id));
create policy st_sel on public.streak_tokens for select to authenticated using (public.is_member(crew_id));

create policy rx_sel on public.reactions for select to authenticated
  using (user_id = (select auth.uid()) or to_user = (select auth.uid()));
create policy rx_ins on public.reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_crewmate(to_user) and public.is_member(crew_id));
create policy rx_upd on public.reactions for update to authenticated    -- receiver marks seen via mark_seen RPC only
  using (false);
create policy nd_sel on public.nudges for select to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));

create policy ch_sel on public.challenges for select to authenticated using (public.is_member(crew_id));
create policy ch_ins on public.challenges for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_member(crew_id) and status = 'proposed');
create policy cp_sel on public.challenge_participants for select to authenticated using (exists
  (select 1 from public.challenges c where c.id = challenge_id and public.is_member(c.crew_id)));
create policy cp_ins on public.challenge_participants for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy ps_all on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));  -- hard delete OK
```

**RPCs.** Every RPC is `security definer`, uses `set search_path = ''` and begins with `if auth.uid() is null then raise exception 'unauthenticated'; end if;`. Revoke `execute` from `anon` on all of them.

| RPC | Behaviour |
|---|---|
| `create_crew(name text, tz text)` → `uuid` | Raises if the caller is already in an active crew. Inserts `crews` plus an owner `crew_members` row. |
| `create_invite(crew_id uuid)` → `text` | Owner only. Revokes the crew's older unused invites. Generates 10 Crockford base32 characters (alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`) from `extensions.gen_random_bytes(7)`. Stores `encode(extensions.digest(code,'sha256'),'hex')`. Returns `XXXXX-XXXXX`. |
| `redeem_invite(code text)` → `uuid` | Normalises the code: uppercase, strip `-` and spaces, `O→0`, `I→1`, `L→1`. Hashes it and looks it up. Raises `code_dead` if the code is not found, expired, used or revoked. Raises `crew_full` at `max_members`. Inserts the member, or sets `left_at = null` for a rejoin, which restores history. Marks the invite used. Allows 10 failed attempts per user per hour, then raises `slow_down`. |
| `leave_crew(crew_id)` | Sets `left_at = now()`. Personal rows stay. The client freezes and archives the co-op views. |
| `send_nudge(to_user uuid)` | Requires `is_crewmate`. Allows one per sender→recipient per local day in the **recipient's** tz. Refuses inside the recipient's quiet hours. Refuses if the sender's last 2 nudges to that person have `acted_on = false`. Sending re-enables once the recipient logs a credit. Calls `push-dispatch` through `pg_net`. |
| `spend_spot(covers_user_id uuid, week_start date)` | The caller must have credits ≥ target + 1 in that week. Allows one per caller per calendar month in crew tz. Inserts a `streak_tokens` row. |
| `mark_seen(kind text, ids uuid[])` | `kind in ('reaction','nudge','pr_event')`. It sets `seen_at`, or appends to `seen_by`, only on rows addressed to the caller. |
| `create_export_token(label text)` → `text` | Max 3 active per user, else raises `token_limit`. Returns `spx_` + base64url(32 random bytes), shown once. Stores the sha256 hex. |
| `revoke_export_token(id uuid)` | Own rows only. Sets `revoked_at = now()` and takes effect immediately. |
| `list_export_tokens()` → `table(id, label, created_at, last_used_at, revoked_at)` | Own rows only. **Never returns `token_hash`.** |
| `settle_challenge(id uuid)` | A member may call it after `ends_on`. It computes scores in SQL from the frozen baselines and sets the winner, or a tie. |
| `server_now()` → `timestamptz` | Used by the client to measure clock skew (§4.6). |
| `delete_my_account()` | Soft-deletes nothing. It revokes the caller's tokens and calls the `delete-account` function, which hard-deletes every row of the user with the service role, then runs `auth.admin.deleteUser`. |

### 4.5 Realtime (`0004_realtime.sql`)

```sql
alter publication supabase_realtime add table public.sessions, public.sets, public.cardio_entries,
  public.martial_entries, public.min_entries, public.bodyweight_entries, public.pr_events,
  public.reactions, public.nudges, public.challenges, public.crew_weeks, public.profiles;

create policy crew_topic_read on realtime.messages for select to authenticated using (
  realtime.messages.extension in ('broadcast','presence') and exists (
    select 1 from public.crew_members m where m.user_id = (select auth.uid()) and m.left_at is null
      and (select realtime.topic()) = 'crew:' || m.crew_id::text));
create policy crew_topic_write on realtime.messages for insert to authenticated with check (
  realtime.messages.extension in ('broadcast','presence') and exists (
    select 1 from public.crew_members m where m.user_id = (select auth.uid()) and m.left_at is null
      and (select realtime.topic()) = 'crew:' || m.crew_id::text));
```

- **Postgres Changes:** subscribe with one channel per table and no filter. RLS limits delivery to rows the user may read. Each payload is upserted into Dexie through the same code path as the pull (§4.6). A partner's set must appear on the other phone within **3 s** while both are online.
- **Private channel `crew:{crew_id}`**, created with `{ config: { private: true } }`:
  - **Presence:** `track({user_id, session_id, kind, exercise_label, set_no, started_at, last_active_at})`. Call it on session start and on every logged set. Untrack on finish. Clients hide a presence entry whose `last_active_at` is more than **120 s** old. The banner reads `"[name] is training · Bench · set 3 · 14 min"`.
  - **Broadcast:** `{type:'hype', emoji, target_id, from}`. The receiver queues it and shows it at their **next rest-timer start**, or on next app open. The durable `reactions` row syncs separately.
- **Reconnect:** on `visibilitychange → visible`, resubscribe any channel whose state is not `joined`, then run a delta pull. Realtime only makes things faster. Correctness comes from the pull.
- ⚠️ Confirm the free-tier Realtime quotas in the dashboard (about 200 concurrent connections and 2M messages a month were last seen). Two to eight users are far below them.

### 4.6 Offline-first

**Dexie schema (`spotter`, version 1)**

```ts
db.version(1).stores({
  profiles: 'id', crews: 'id', crew_members: '[crew_id+user_id], user_id',
  exercises: 'id, owner_id, export_label, updated_at', exercise_muscles: '[exercise_id+muscle], exercise_id',
  exercise_prefs: 'id, [user_id+exercise_id]',
  sessions: 'id, [user_id+local_date], [user_id+started_at], kind, updated_at',
  sets: 'id, session_id, [user_id+exercise_id+logged_at], [user_id+local_date], updated_at',
  cardio_entries: 'id, session_id, [user_id+local_date], updated_at',
  martial_entries: 'id, session_id, [user_id+local_date], updated_at',
  min_entries: 'id, session_id, [user_id+local_date], updated_at',
  bodyweight_entries: 'id, [user_id+local_date], [user_id+measured_at], updated_at',
  goals: 'id, user_id', pr_events: 'id, user_id, source_id, exercise_id, updated_at',
  reactions: 'id, to_user, target_id, updated_at', nudges: 'id, to_user, sent_on',
  streak_tokens: 'id, crew_id, week_start', crew_weeks: '[crew_id+week_start]',
  challenges: 'id, crew_id, status', challenge_participants: '[challenge_id+user_id]',
  outbox: '++seq, [table+row_id], status, created_at',   // status: 'pending' | 'dead'
  meta: 'key'          // last_pulled_at:<table>, my_user_id, crew_id, clock_offset_ms, active_session_id
});
```

**IDs.** Every row gets `crypto.randomUUID()`, with one exception. Bodyweight rows use `uuidv5(user_id + ':' + local_date, NS_BODYWEIGHT)`, where `NS_BODYWEIGHT` is a fixed constant in `ids.ts`. Two weigh-ins on the same day then upsert the same row, and the later one replaces the earlier (§2 F12). No unique-index conflict can happen offline.

**Write path.** Every mutation goes through `data/adapter.ts`.

1. Build the row. `client_updated_at = new Date(Date.now() + clock_offset_ms)`. `local_date` is computed with `TZDate` in `profile.tz`; child rows copy the session's value.
2. Validate with the Zod schema in `core/validate.ts`. The schema mirrors the DB checks exactly. Out-of-range input never reaches the outbox; the UI shows "That's a world record. Check it."
3. In **one** Dexie `rw` transaction, upsert the mirror row and write an outbox entry. If a `pending` entry already exists for the same `[table+row_id]`, replace its payload (coalescing), so 5 edits produce 1 upsert.
4. liveQuery re-renders. Budget: tap to "set logged" visual ≤100 ms, local write ≤50 ms. A grey tick means "on phone". A chalk tick means "synced", once no pending outbox row exists for that `row_id`.
5. If Dexie throws `QuotaExceededError`, show the only blocking modal in the app: "Phone storage full — can't save. Free space and retry."

**Flush (`sync.ts`).**

- Triggers: app start, `online`, `visibilitychange → visible`, every 30 s while visible, and right after a write when `navigator.onLine`.
- A single-flight lock (a module-level promise) prevents overlapping flushes.
- First, call `server_now()` once per launch. If `|server − client| > 600 000 ms`, store `clock_offset_ms`. Every later `client_updated_at` applies the offset.
- Order by table priority: `profiles`, `exercises`, `exercise_muscles`, `exercise_prefs` → `sessions` → `sets`, `cardio_entries`, `martial_entries`, `min_entries`, `bodyweight_entries` → `pr_events` → `reactions` → `goals`, `challenges`. Within a table, order by `seq`.
- Batches of ≤100: `supabase.from(t).upsert(rows, { onConflict: 'id', ignoreDuplicates: false })`. On success, delete those outbox entries.
- Network or 5xx error: back off 2, 4, 8, 16, 32, then 60 s.
- 4xx error (check, owner or RLS violation): mark the entry `dead`, store `last_error` and continue. Settings shows "1 entry couldn't sync" with **Retry** and **Discard**. A dead entry never blocks the queue.
- If the server is paused or unreachable for more than 3 attempts in a row, show the chalk banner "Server asleep — data safe on phone".
- iOS has no Background Sync, so nothing relies on it.

**Pull (`pull.ts`).**

- For each table: `select * where updated_at > last_pulled_at − 5 s order by updated_at, id limit 1000`, looping until a page is shorter than 1000.
- Upsert each row into Dexie **unless** a pending outbox entry exists for that row, in which case the local row is kept.
- Then set `last_pulled_at` to the max `updated_at` seen.
- Soft-deleted rows arrive with `deleted_at` set. Every query hides them.

**Conflicts.**

- Last write wins per row on `client_updated_at`, enforced by `lww_guard`, with `received_at` breaking ties.
- When a pull overwrites a row the user edited on this device within the last 10 min, show the quiet toast "Updated from your other device".
- Undo is a `deleted_at` write through the outbox. The PR events tied to that set are soft-deleted in the same batch.
- Derived values (PRs, rings, The Bar, streaks) are always recomputed from rows and never synced as authority. The exception is `crew_weeks`, which is server-written and wins over the client's provisional value.

**Storage.**

- Call `navigator.storage.persist()` after the first launch in standalone mode.
- iOS wipes script storage after 7 days of non-use **in Safari tabs**. Home-screen web apps are exempt ⚠️, so installing is onboarding step 1.
- Dexie is never the backup. The server is canonical, and each user's export is an off-site copy.
- **Crash recovery:** `meta.active_session_id` survives a kill. On reopen, show "Resume session (14 min)?".
- **Auto-close:** a session with no set for 3 h gets `ended_at = last set + 5 min` on next open.
- Starting a second session while one is open shows "Finish or discard the open one".

### 4.7 PWA, service worker, device APIs

**Manifest** (in `vite.config.ts`):

```json
{ "id": "/", "name": "SPOTTER", "short_name": "SPOTTER", "start_url": "/?src=pwa", "scope": "/",
  "display": "standalone", "orientation": "portrait", "background_color": "#0A0A0B", "theme_color": "#0A0A0B",
  "icons": [{"src":"/icons/192.png","sizes":"192x192","type":"image/png"},
            {"src":"/icons/512.png","sizes":"512x512","type":"image/png"},
            {"src":"/icons/512-maskable.png","sizes":"512x512","type":"image/png","purpose":"maskable"}],
  "shortcuts": [{"name":"Start session","url":"/log?start=1"},{"name":"Log MIN","url":"/?min=1"}] }
```

- `index.html` includes `<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">` with an opaque background, `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` and `viewport-fit=cover`.
- CSS uses `env(safe-area-inset-*)`.
- Install detection: `matchMedia('(display-mode: standalone)').matches || navigator.standalone === true`.
- Android: capture `beforeinstallprompt` and show the button described in §2 F2.

**`sw.ts`** (injectManifest):

- `precacheAndRoute(self.__WB_MANIFEST)` covers the shell, the fonts, `grain-256.png` and `keepawake.mp4`.
- Lazy route chunks use `StaleWhileRevalidate`.
- A `NetworkOnly` route matches `/^https:\/\/[a-z0-9]+\.supabase\.co\//`, so **API, Realtime and export responses are never cached**.
- SPA fallback: `createHandlerBoundToURL('/index.html')`.
- `push` handler: `event.waitUntil(self.registration.showNotification(title, {body, icon:'/icons/192.png', badge:'/icons/badge-72.png', tag, data:{url}}))`. **It must show a notification for every push.** Safari revokes a subscription that receives pushes it doesn't display ⚠️.
- `notificationclick`: focus an existing client and `navigate(data.url)`, or call `clients.openWindow(data.url)`.
- Updates: `registerType: 'prompt'`. The chip "New version — tap to reload" is suppressed while `meta.active_session_id` is set.

**`public/_headers`:**

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), geolocation=(), microphone=()
  X-Content-Type-Options: nosniff
/sw.js
  Cache-Control: no-cache
```

⚠️ `'unsafe-inline'` for styles is there because some libraries inject `<style>` tags. Remove it if the build passes without it.

**Wake Lock (`platform/wakeLock.ts`):**

```ts
let sentinel: WakeLockSentinel | null = null;
export async function keepAwake(): Promise<'native' | 'video' | 'none'> {
  if ('wakeLock' in navigator) {
    try { sentinel = await navigator.wakeLock.request('screen');
          sentinel.addEventListener('release', () => { sentinel = null; }); return 'native'; }
    catch { /* NotAllowedError: low power mode, not visible, etc. */ }
  }
  return startVideoFallback();      // muted, playsinline, loop <video src=keepawake.mp4>, 1×1px
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && hasActiveSession()) void keepAwake();
});
```

- Call it on session start (inside the START tap handler, so the video fallback has a user gesture), on every rest-timer start and on every `visibilitychange → visible`. Release the sentinel and pause the video on finish.
- If the result is `'none'`, show the muted chip "Screen may sleep".
- iOS caveats ⚠️:
  - Wake Lock shipped in Safari 16.4, but it did not work in home-screen web apps until iOS 18.4 (WebKit bug 254545).
  - The OS releases the lock whenever the page is hidden, which is why it must be re-requested.
  - Low Power Mode may reject the request.
  - **Feature-detect only and never sniff the UA.**

**Rest timer.**

- Store `endsAt` (epoch ms) in zustand and in `meta`. Display `max(0, endsAt − now)`, re-derived every animation frame and on visibility.
- **A JS timer cannot fire while the phone is locked or the app is in the background, on iOS or on Android.** No web API schedules a local notification; Notification Triggers was abandoned. Onboarding says so once: "Keep the screen on during rest — SPOTTER keeps it awake for you."
- At 0, all of these fire together:
  - One full-screen molten flash, a single 300 ms pulse.
  - Web Audio cues per §3 §8, only if `sound_on`. The `AudioContext` is created or resumed on the first tap of each launch. Set `navigator.audioSession.type = 'playback'` if it exists ⚠️, so the cue may play through the silent switch.
  - `navigator.vibrate?.([80,60,80,60,200])` if `haptics_on`. Android only; iOS has no Vibration API.
- iOS checkbox-switch haptics sit behind the flag `VITE_IOS_HAPTICS=off`, default off ⚠️ (possibly patched). They never carry meaning on their own.

**Web Push.**

- The agent generates VAPID keys with `npx web-push generate-vapid-keys` and stores them as secrets.
- `platform/push.ts` shows the enable button only when `'PushManager' in window && 'serviceWorker' in navigator`. On iOS it also requires standalone mode, because iOS 16.4+ allows Web Push only for home-screen web apps.
- Permission is requested only inside a tap handler: Settings → Notifications, or the post-first-PR prompt "Want to know when [name] PRs?".
- `subscribe({ userVisibleOnly: true, applicationServerKey })` → upsert into `push_subscriptions`.
- Senders: Database Webhooks (`pg_net`) on `pr_events` insert, `nudges` insert and `sessions` insert (kind ≠ min), plus `pg_cron` for the recap and the spot window. All of them POST to `push-dispatch` with the header `X-Dispatch-Secret`. The function is deployed `--no-verify-jwt` and checks that secret. The secret is stored in Supabase Vault.
- `push-dispatch` sends only if all of these hold:
  - the recipient's `notify.<type>` is true;
  - it is not quiet hours in the recipient's tz (drop, don't queue);
  - `push_log.count < 3` for the recipient's local day;
  - for any type except `partner_pr`, the recipient has not logged a credit today.
- Then it sends to each endpoint and increments `push_log`. A 404 or 410 deletes the subscription. Any other failure increments `fail_count`, and the subscription is deleted at ≥5.
- Payloads carry only the title, a body from the §2 §4 copy table, `tag` and `url`. No training numbers beyond a short message.
- Declarative Web Push is out of scope.

**Auth.**

- `signInWithOtp({ email, options: { shouldCreateUser: true } })` then `verifyOtp({ email, token, type: 'email' })` with the **6-digit code typed into the installed app**. On iOS a magic link opens Safari, whose storage is separate from the home-screen app.
- The email template must contain `{{ .Token }}`. That is a human step (§8). OTP expiry is 600 s.
- Rate-limit errors show "Link delayed — try again in 60 s" with a countdown.
- No email is ever stored outside `auth.users`. `profiles` has no email column.

**Scheduled jobs (`0005_cron.sql`, `pg_cron`; each `net.http_post` reads its secret from Vault).**

| Job | Schedule (UTC) | Action |
|---|---|---|
| `week-close` | `5 * * * 1` and `5 22,23 * * 0` | For every crew whose local time is Monday 00:05–00:59 and whose last week has no `crew_weeks` row: compute statuses (FULL/HELD/REST), apply spots, set the plate delta (+1 both FULL, 0 all ≥HELD, −1 anyone REST and not spotted, floor 0), insert the row. |
| `weekly-recap` | `0 * * * 0,1` | Users whose local time is Sunday 19:xx and who had no recap this week. |
| `spot-window` | `0 * * * 0` | Sunday 12:xx crew time: a partner who is heading for REST triggers the `spot` push to crewmates. |
| `purge` | `30 3 * * *` | Hard-delete rows with `deleted_at < now() − 30 days`. |
| `edit-recheck` | trigger on update of a row with `local_date` in a closed week | Recompute that week. If the status changed, update `crew_weeks` with `adjusted_after_edit = true`; the client shows "Bar adjusted after edit". |

`health` returns `200 {"ok":true,"t":"<iso>"}` and runs one `select 1`. `keepalive.yml` calls it on `0 6 */2 * *`, and on `0 6 1 * *` it commits `heartbeat.txt` ⚠️ (GitHub disables cron workflows after 60 days with no repo activity).

---

## 5. Export contract (each user's vault)

**Every user has their own vault and their own export.** the friend's laptop agent and [FRIEND]'s agent pull the same way: one authenticated `GET` with the user's own token, returning **only that user's rows**. Partner data, readiness scores, reactions, nudges and presence are never exported. The token, not the request, decides whose data is returned. The default format is the line format below. Each user can switch their own export to JSON or CSV in Settings → Vault export.

### 5.1 Endpoint

```
GET https://<project-ref>.supabase.co/functions/v1/export[?since=YYYY-MM-DD][&format=lines|json|csv]
Authorization: Bearer spx_<43 base64url chars>
```

- **Fallback header** ⚠️: if the Supabase gateway rejects a non-JWT bearer even with `--no-verify-jwt`, the function also accepts `X-Export-Token: spx_…`. The build agent tests both and records the working one in `docs/EXPORT.md` and in the "Copy for my AI" text. **The token never goes in a query string**, and the function rejects `?token=` with 400.
- `since`: optional and inclusive. It must match `^\d{4}-\d{2}-\d{2}$` and be a real date, else **400** `bad since`. It filters on `local_date`.
- `format`: optional per-request override. Without it, `profiles.export_format` applies (default `lines`). Any other value returns 400.
- Methods: `GET` and `HEAD` only. Anything else returns 405. No CORS headers are sent; it is a machine endpoint.

**Function steps (`supabase/functions/export/index.ts`):**

1. Read the token from `Authorization: Bearer` or `X-Export-Token`. If it is missing or doesn't match `^spx_[A-Za-z0-9_-]{43}$`, wait 200 ms and return **401** with an empty body.
2. Compute `sha256hex(token)` and select from `export_tokens` where `token_hash = $1 and revoked_at is null`, using the service-role client. If there is no row, wait a constant 200 ms and return 401 with an empty body.
3. Rate limit, atomically (a fixed 1-hour window that starts at the first request):

   ```sql
   update public.export_tokens set
     window_start = case when window_start < now() - interval '1 hour' then now() else window_start end,
     window_count = case when window_start < now() - interval '1 hour' then 1 else window_count + 1 end
   where id = $1 returning window_count, window_start;
   ```

   `window_count > 60` → **429** with `Retry-After: <seconds until window_start + 1h>`.
4. `user_id` comes **only** from the token row. Query that user's rows with `deleted_at is null`: `sessions`, `sets` with `exercises`, `cardio_entries`, `martial_entries`, `min_entries`, `bodyweight_entries`, filtered by `local_date >= since` when given. Soft-deleted exercises still export under their current `export_label`.
5. Format with `_shared/export-format.ts`, which is the same module the app uses for the Settings preview.
6. Set `last_used_at = now()`. Respond.

**Response headers:** `Content-Type` per format · `Cache-Control: private, no-cache` · `ETag: "<sha256hex(body)>"` · `X-Content-Type-Options: nosniff`. A matching `If-None-Match` returns **304** with no body.

**Status codes:**

| Code | When |
|---|---|
| 200 | Success. An empty result is still 200 with an empty body (`lines`/`csv` = header only for CSV, `json` = `entries: []`). |
| 304 | ETag match |
| 400 | Bad `since` or `format`, or a token in the query |
| 401 | Missing, bad or revoked token |
| 405 | Wrong method |
| 429 | Over 60 requests per hour |
| 500 | Body `export failed`, nothing else |

The function never logs the token or the request headers.

### 5.2 Token lifecycle

- Settings → **Vault export** → **Generate**. This calls `create_export_token(label)` and shows the token **once** in a mono field with **Copy**. Copy writes it with `navigator.clipboard.writeText`, and the field is replaced by `spx_••••` after the sheet closes.
- The list shows label, created, last used and status for up to 3 active tokens.
- **Revoke & regenerate:** revokes the old token immediately, then creates a new one and shows it once.
- **Revoke** alone takes effect on the very next request, which returns 401.
- `delete_my_account()` revokes everything.
- Tokens are per user. A user can never see, create or revoke another user's token, and the UI text says: "This token reads only your data. Never send it to anyone — not even your crew."

### 5.3 Default format: lines (`text/plain; charset=utf-8`)

**Grammar:**

```
- YYYY-MM-DD · Weight · <kg1>kg
- YYYY-MM-DD · <Label> · <GROUPS> [· RPE <r>] [· <note>]            lift / bw_lift
- YYYY-MM-DD · <Discipline> · <min>m [· RPE <r>] [· <note>]          martial arts
- YYYY-MM-DD · Run · <km>km · <time> [· RPE <r>] [· <note>]
- YYYY-MM-DD · MIN · <description>
```

**Bytes:**

- The separator is exactly ` · ` (U+0020 U+00B7 U+0020).
- Groups use `×` (U+00D7), never the letter `x`. Groups are joined with ` + `.
- Every line starts with `- ` and ends with `\n` (LF). That includes the last line, and there is no extra blank line after it.
- UTF-8 without BOM. No header line and no summary.

**Rules:**

1. **Date (D9):** each row's stored `local_date`. A session that starts at 23:30 and runs to 00:40 exports on its start date. Weight uses its own logging date.
2. **One line per exercise per date.** All non-deleted, `is_warmup = false` sets of one `exercise_id` on one `local_date`, across sessions, merge into one line. Set order is by `(session.started_at, set_index)`. If a date has only warm-up sets for an exercise, that exercise has no line.
3. **Collapse:** walk the ordered sets. Consecutive sets with identical `(reps, weight_kg)` form a run. A run renders as `N×R×W`. Non-consecutive repeats stay separate runs, so the order of the day is preserved. Example: 80×5, 85×3, 80×5 → `1×5×80kg + 1×3×85kg + 1×5×80kg`.
4. **Weight token W:**
   - `lift`: `<kg>kg`.
   - `bw_lift`: `BW` when added load is 0, `BW+<kg>kg` when positive, `BW-<kg>kg` when negative (assisted).
   - kg format: dot decimal, at most 2 decimals, trailing zeros and a trailing dot removed: `80`, `82.5`, `81.25`, `1.25`.
5. **RPE (D6):** the max RPE across the line's working sets, or across the runs/sessions merged into a run or martial line. Written as an integer or with `.5` (`RPE 8`, `RPE 8.5`). Omitted if none was logged.
6. **Note (D7):**
   - Collect the distinct non-empty notes of the line's rows in chronological order (set notes, entry notes). For lifts, append the session's `note` to the **first lift line of that session** (by first `logged_at`).
   - Join with `; `.
   - Sanitise: `·` → `-`, `\r` and `\n` → space, collapse whitespace runs to one space, trim, and cut to 120 code points with no ellipsis, trimming again after the cut.
   - Omitted if empty.
7. **Run:** all non-deleted `cardio_entries` of the date merge into one line.
   - km = Σ`distance_m` ÷ 1000, rounded half-up to 2 decimals, trailing zeros trimmed (`5.2km`, `21.1km`, `10km`).
   - Time = Σ`duration_s`, written `M:SS` under 3600 s (`27:40`) and `H:MM:SS` from 3600 s (`1:45:00`).
8. **Martial arts:** one line per discipline per date, with the label equal to the discipline text (`BJJ`, `Muay Thai`, or free text ≤16). Minutes are summed and written as an integer with `m`, followed by the max RPE and the merged notes.
9. **Weight:** the latest `measured_at` of the date, always 1 decimal: `78.4kg`, `78.0kg`. Only the owner's export ever contains it, whatever `show_bodyweight` is set to.
10. **MIN:**
    - One line per `min_entries` row: `- DATE · MIN · <description>`, with the description sanitised as in rule 6.
    - A gym session with `mode = 'min'` (readiness "Do MIN") exports its normal lift lines **plus** `- DATE · MIN · session`.
11. **Labels:** the current `exercises.export_label` (≤24 characters, `·` already forbidden by a check). Renames apply retroactively because history follows `exercise_id`.
12. **Order (D8):** dates descending. Within a date:
    1. Weight.
    2. Lift lines by the `logged_at` of their first working set, ascending.
    3. Martial lines by first `logged_at`, ascending.
    4. Run.
    5. MIN lines by `logged_at`, ascending; a `mode='min'` session's MIN line uses the session's `started_at`.
13. **Content:** edited rows export their current values and deleted rows are excluded. The API is stateless and idempotent. The vault side replaces a whole date block on each pull, so re-pulling never duplicates.

**Example lines** (each one is produced by the fixture in §5.6 or by a unit test in §7.1):

```
- 2026-10-25 · Squat · 2×5×100kg + 1×3×105kg + 2×5×100kg · RPE 9 · belt on
- 2026-10-24 · Weight · 78.4kg
- 2026-10-24 · Bench · 3×5×80kg · RPE 8 · felt strong
- 2026-10-24 · Pull-up · 3×8×BW
- 2026-10-24 · Dip · 3×10×BW+10kg
- 2026-10-24 · BJJ · 60m · RPE 7 · drilled guard
- 2026-10-24 · Run · 5.2km · 27:40 · RPE 6 · easy
- 2026-10-23 · Bench · 1×5×80kg + 2×3×85kg · RPE 9 · last rep - slow
- 2026-10-22 · MIN · 20m walk
- 2026-10-21 · Run · 5.5km · 28:20 · RPE 7 · am; pm
- 2026-10-20 · Weight · 78.0kg
- 2026-10-20 · Bench · 2×5×82.5kg + 1×5×81.25kg
- 2026-10-20 · Pull-up · 3×6×BW-15kg
- 2026-10-20 · Run · 21.1km · 1:45:00
- 2026-10-19 · Bench · 2×5×72.5kg
- 2026-10-19 · MIN · session
- 2026-10-18 · Muay Thai · 90m · RPE 8.5
- 2026-10-18 · Dip · 2×10×BW + 1×8×BW+5kg
```

### 5.4 JSON format (`application/json; charset=utf-8`)

```json
{ "format": "spotter.export.v1", "tz": "Europe/Amsterdam", "since": "2026-10-21",
  "entries": [
    { "date": "2026-10-24", "type": "lift", "label": "Bench",
      "groups": [{ "n": 3, "reps": 5, "kg": 80, "bw": false }], "rpe": 8, "note": "felt strong",
      "line": "- 2026-10-24 · Bench · 3×5×80kg · RPE 8 · felt strong" },
    { "date": "2026-10-24", "type": "run", "label": "Run", "km": 5.2, "duration_s": 1660,
      "rpe": 6, "note": "easy", "line": "- 2026-10-24 · Run · 5.2km · 27:40 · RPE 6 · easy" },
    { "date": "2026-10-24", "type": "martial", "label": "BJJ", "minutes": 60, "rpe": 7,
      "note": "drilled guard", "line": "- 2026-10-24 · BJJ · 60m · RPE 7 · drilled guard" },
    { "date": "2026-10-24", "type": "weight", "label": "Weight", "kg": 78.4, "line": "- 2026-10-24 · Weight · 78.4kg" },
    { "date": "2026-10-22", "type": "min", "label": "MIN", "description": "20m walk", "line": "- 2026-10-22 · MIN · 20m walk" }
  ] }
```

- `entries` has exactly the order and grouping of the lines format, one object per line. `line` is byte-identical to the lines output.
- For `bw_lift` groups, `bw: true` and `kg` is the **added** load (0, positive or negative).
- Missing optional values are `null`, never omitted.
- `since` is `null` when not given. `tz` is the user's `profiles.tz`.

### 5.5 CSV format (`text/csv; charset=utf-8`)

- RFC 4180 quoting, LF line endings, UTF-8 without BOM.
- The header row is always present: `date,type,label,value,duration,rpe,note`.
- Rows follow the same order as the lines format:
  - `value`: the `GROUPS` string for lifts, km for runs (`5.2`), minutes for martial arts, kg for weight (`78.4`), the description for MIN.
  - `duration`: `27:40` for runs, else empty.
  - `rpe`: a number or empty.

```
date,type,label,value,duration,rpe,note
2026-10-24,lift,Bench,3×5×80kg,,8,felt strong
2026-10-24,run,Run,5.2,27:40,6,easy
2026-10-23,lift,Bench,1×5×80kg + 2×3×85kg,,9,last rep - slow
```

### 5.6 Golden fixture (acceptance test for the contract)

`tests/fixtures/export/basic.json` is the input. Common fields are omitted where the loader fills them: `client_updated_at = updated_at = logged_at`, and `deleted_at` is null unless shown. `me` = `u1` and `partner` = `u2`. Fixture ids are short strings; the loader accepts them.

```json
{ "user_id": "u1", "tz": "Europe/Amsterdam",
  "exercises": [
    {"id":"bench","export_label":"Bench","kind":"lift"}, {"id":"squat","export_label":"Squat","kind":"lift"},
    {"id":"pullup","export_label":"Pull-up","kind":"bw_lift"}, {"id":"dip","export_label":"Dip","kind":"bw_lift"}],
  "sessions": [
    {"id":"s1","user_id":"u1","kind":"gym","mode":"full","started_at":"2026-10-24T08:00:00Z","local_date":"2026-10-24","note":"felt strong"},
    {"id":"s2","user_id":"u1","kind":"run","started_at":"2026-10-24T15:00:00Z","local_date":"2026-10-24"},
    {"id":"s3","user_id":"u1","kind":"martial","started_at":"2026-10-24T18:00:00Z","local_date":"2026-10-24"},
    {"id":"s4","user_id":"u1","kind":"gym","mode":"full","started_at":"2026-10-25T21:30:00Z","local_date":"2026-10-25"},
    {"id":"s5","user_id":"u1","kind":"gym","mode":"full","started_at":"2026-10-23T16:00:00Z","local_date":"2026-10-23"},
    {"id":"s6","user_id":"u1","kind":"min","mode":"min","started_at":"2026-10-22T17:00:00Z","local_date":"2026-10-22"},
    {"id":"s7","user_id":"u1","kind":"run","started_at":"2026-10-21T06:00:00Z","local_date":"2026-10-21"},
    {"id":"s8","user_id":"u1","kind":"run","started_at":"2026-10-21T17:00:00Z","local_date":"2026-10-21"},
    {"id":"s9","user_id":"u1","kind":"gym","mode":"full","started_at":"2026-10-20T16:00:00Z","local_date":"2026-10-20"},
    {"id":"s10","user_id":"u1","kind":"run","started_at":"2026-10-20T08:00:00Z","local_date":"2026-10-20"},
    {"id":"s11","user_id":"u1","kind":"gym","mode":"min","started_at":"2026-10-19T17:00:00Z","local_date":"2026-10-19"},
    {"id":"p1","user_id":"u2","kind":"gym","mode":"full","started_at":"2026-10-24T09:00:00Z","local_date":"2026-10-24"}],
  "sets": [
    {"id":"a0","session_id":"s1","exercise_id":"bench","set_index":1,"reps":10,"weight_kg":20,"is_warmup":true,"logged_at":"2026-10-24T08:05:00Z"},
    {"id":"a1","session_id":"s1","exercise_id":"bench","set_index":2,"reps":5,"weight_kg":80,"rpe":7.5,"logged_at":"2026-10-24T08:10:00Z"},
    {"id":"a2","session_id":"s1","exercise_id":"bench","set_index":3,"reps":5,"weight_kg":80,"rpe":8,"logged_at":"2026-10-24T08:14:00Z"},
    {"id":"a3","session_id":"s1","exercise_id":"bench","set_index":4,"reps":5,"weight_kg":80,"rpe":8,"logged_at":"2026-10-24T08:18:00Z"},
    {"id":"a4","session_id":"s1","exercise_id":"bench","set_index":5,"reps":1,"weight_kg":85,"logged_at":"2026-10-24T08:22:00Z","deleted_at":"2026-10-24T08:23:00Z"},
    {"id":"a5","session_id":"s1","exercise_id":"pullup","set_index":6,"reps":8,"weight_kg":0,"logged_at":"2026-10-24T08:30:00Z"},
    {"id":"a6","session_id":"s1","exercise_id":"pullup","set_index":7,"reps":8,"weight_kg":0,"logged_at":"2026-10-24T08:33:00Z"},
    {"id":"a7","session_id":"s1","exercise_id":"pullup","set_index":8,"reps":8,"weight_kg":0,"logged_at":"2026-10-24T08:36:00Z"},
    {"id":"a8","session_id":"s1","exercise_id":"dip","set_index":9,"reps":10,"weight_kg":10,"logged_at":"2026-10-24T08:42:00Z"},
    {"id":"a9","session_id":"s1","exercise_id":"dip","set_index":10,"reps":10,"weight_kg":10,"logged_at":"2026-10-24T08:45:00Z"},
    {"id":"a10","session_id":"s1","exercise_id":"dip","set_index":11,"reps":10,"weight_kg":10,"logged_at":"2026-10-24T08:48:00Z"},
    {"id":"b1","session_id":"s4","exercise_id":"squat","set_index":1,"reps":5,"weight_kg":100,"rpe":8,"logged_at":"2026-10-25T21:35:00Z"},
    {"id":"b2","session_id":"s4","exercise_id":"squat","set_index":2,"reps":5,"weight_kg":100,"logged_at":"2026-10-25T21:40:00Z"},
    {"id":"b3","session_id":"s4","exercise_id":"squat","set_index":3,"reps":3,"weight_kg":105,"rpe":9,"note":"belt on","logged_at":"2026-10-25T21:46:00Z"},
    {"id":"b4","session_id":"s4","exercise_id":"squat","set_index":4,"reps":5,"weight_kg":100,"rpe":8.5,"logged_at":"2026-10-25T22:50:00Z"},
    {"id":"b5","session_id":"s4","exercise_id":"squat","set_index":5,"reps":5,"weight_kg":100,"logged_at":"2026-10-25T23:10:00Z"},
    {"id":"c1","session_id":"s5","exercise_id":"bench","set_index":1,"reps":5,"weight_kg":80,"rpe":8,"logged_at":"2026-10-23T16:05:00Z"},
    {"id":"c2","session_id":"s5","exercise_id":"bench","set_index":2,"reps":3,"weight_kg":85,"rpe":9,"note":"last rep · \n slow","logged_at":"2026-10-23T16:10:00Z"},
    {"id":"c3","session_id":"s5","exercise_id":"bench","set_index":3,"reps":3,"weight_kg":85,"rpe":9,"note":"last rep · \n slow","logged_at":"2026-10-23T16:15:00Z"},
    {"id":"d1","session_id":"s9","exercise_id":"bench","set_index":1,"reps":5,"weight_kg":82.5,"logged_at":"2026-10-20T16:05:00Z"},
    {"id":"d2","session_id":"s9","exercise_id":"bench","set_index":2,"reps":5,"weight_kg":82.5,"logged_at":"2026-10-20T16:09:00Z"},
    {"id":"d3","session_id":"s9","exercise_id":"bench","set_index":3,"reps":5,"weight_kg":81.25,"logged_at":"2026-10-20T16:13:00Z"},
    {"id":"d4","session_id":"s9","exercise_id":"pullup","set_index":4,"reps":6,"weight_kg":-15,"logged_at":"2026-10-20T16:20:00Z"},
    {"id":"d5","session_id":"s9","exercise_id":"pullup","set_index":5,"reps":6,"weight_kg":-15,"logged_at":"2026-10-20T16:23:00Z"},
    {"id":"d6","session_id":"s9","exercise_id":"pullup","set_index":6,"reps":6,"weight_kg":-15,"logged_at":"2026-10-20T16:26:00Z"},
    {"id":"e0","session_id":"s11","exercise_id":"bench","set_index":1,"reps":10,"weight_kg":20,"is_warmup":true,"logged_at":"2026-10-19T17:02:00Z"},
    {"id":"e1","session_id":"s11","exercise_id":"bench","set_index":2,"reps":5,"weight_kg":72.5,"logged_at":"2026-10-19T17:06:00Z"},
    {"id":"e2","session_id":"s11","exercise_id":"bench","set_index":3,"reps":5,"weight_kg":72.5,"logged_at":"2026-10-19T17:10:00Z"},
    {"id":"x1","session_id":"p1","user_id":"u2","exercise_id":"bench","set_index":1,"reps":5,"weight_kg":100,"logged_at":"2026-10-24T09:05:00Z"}],
  "cardio_entries": [
    {"id":"r1","session_id":"s2","distance_m":5200,"duration_s":1660,"rpe":6,"note":"easy","logged_at":"2026-10-24T15:30:00Z"},
    {"id":"r2","session_id":"s7","distance_m":3000,"duration_s":900,"rpe":5,"note":"am","logged_at":"2026-10-21T06:20:00Z"},
    {"id":"r3","session_id":"s8","distance_m":2500,"duration_s":800,"rpe":7,"note":"pm","logged_at":"2026-10-21T17:20:00Z"},
    {"id":"r4","session_id":"s10","distance_m":21100,"duration_s":6300,"logged_at":"2026-10-20T09:50:00Z"}],
  "martial_entries": [
    {"id":"m1","session_id":"s3","discipline":"BJJ","duration_min":60,"rpe":7,"note":"drilled guard","logged_at":"2026-10-24T19:00:00Z"}],
  "bodyweight_entries": [
    {"id":"w1","weight_kg":78.6,"measured_at":"2026-10-24T06:30:00Z","local_date":"2026-10-24","deleted_at":"2026-10-24T19:00:00Z"},
    {"id":"w2","weight_kg":78.4,"measured_at":"2026-10-24T19:00:00Z","local_date":"2026-10-24"},
    {"id":"w3","weight_kg":78.0,"measured_at":"2026-10-20T06:00:00Z","local_date":"2026-10-20"}],
  "min_entries": [
    {"id":"n1","session_id":"s6","description":"20m walk","logged_at":"2026-10-22T17:00:00Z"}] }
```

Notes on the fixture:

- `w1` is marked deleted, which models the bodyweight replace. In production the uuidv5 id makes it the same row.
- `b5` was logged at 00:10 local on 26 Oct but inherits the session's date, 2026-10-25 (D9).
- `s4` starts at 22:30 CET on the DST-change day.
- Partner set `x1` and deleted set `a4` must not appear.

`tests/fixtures/export/basic.txt`, the expected output with exactly 16 lines, each ending in LF:

```
- 2026-10-25 · Squat · 2×5×100kg + 1×3×105kg + 2×5×100kg · RPE 9 · belt on
- 2026-10-24 · Weight · 78.4kg
- 2026-10-24 · Bench · 3×5×80kg · RPE 8 · felt strong
- 2026-10-24 · Pull-up · 3×8×BW
- 2026-10-24 · Dip · 3×10×BW+10kg
- 2026-10-24 · BJJ · 60m · RPE 7 · drilled guard
- 2026-10-24 · Run · 5.2km · 27:40 · RPE 6 · easy
- 2026-10-23 · Bench · 1×5×80kg + 2×3×85kg · RPE 9 · last rep - slow
- 2026-10-22 · MIN · 20m walk
- 2026-10-21 · Run · 5.5km · 28:20 · RPE 7 · am; pm
- 2026-10-20 · Weight · 78.0kg
- 2026-10-20 · Bench · 2×5×82.5kg + 1×5×81.25kg
- 2026-10-20 · Pull-up · 3×6×BW-15kg
- 2026-10-20 · Run · 21.1km · 1:45:00
- 2026-10-19 · Bench · 2×5×72.5kg
- 2026-10-19 · MIN · session
```

More fixtures:

- `basic.since-2026-10-21.txt` = the first 10 lines above.
- `basic.json.expected.json` and `basic.csv.expected.csv` = the same 16 entries in those formats.
- `empty.json` (a user with zero rows) → `empty.txt` with 0 bytes.
- `partner-only.json` (only `u2` rows) → 0 bytes.

### 5.7 Wiring each user's vault, and "Copy for my AI"

Settings → Vault export has an optional **Copy for my AI** button. It copies the text below with the real project URL and the user's active export format filled in. **It never includes the token.** The token is pasted separately, through the user's own private channel or secret store.

```
SPOTTER export — my training data, read-only, my rows only.
GET https://<ref>.supabase.co/functions/v1/export?since=YYYY-MM-DD   (since optional, inclusive, by local date)
Header: Authorization: Bearer <MY_TOKEN>   (fallback header: X-Export-Token: <MY_TOKEN>; never put the token in the URL)
Format: <lines|json|csv> (override with &format=). Default lines, newest date first, one line per exercise per day:
- 2026-10-24 · Bench · 3×5×80kg · RPE 8 · felt strong      (N×reps×kg groups joined " + " when sets differ)
- 2026-10-24 · Pull-up · 3×8×BW   /  Dip · 3×10×BW+10kg
- 2026-10-24 · Run · 5.2km · 27:40 · RPE 6 · easy
- 2026-10-24 · BJJ · 60m · RPE 7 · note
- 2026-10-24 · Weight · 78.4kg
- 2026-10-24 · MIN · 20m walk
Separators are " · " (U+00B7) and "×" (U+00D7). 401 = bad/revoked token, 429 = >60 calls/hour (see Retry-After), 304 if If-None-Match matches the ETag.
To sync: pull with since = (last synced date − 2 days), then REPLACE each returned date's block in my notes; never append.
Store the token in an env var or secret file outside the notes vault. Never commit it.
```

Laptop pull (either user):

```
curl -sf -H "Authorization: Bearer $SPOTTER_TOKEN" "https://<ref>.supabase.co/functions/v1/export?since=$SINCE"
```

---


---

## 6. Build plan

Rule: **Phase 1 ends with a deployed, two-user logging loop with a working export, before any eye-candy.** Each phase runs the §1.3 loop. File paths follow the repo structure in §4. "Demo script" means steps the Lead runs on the deployed URL and then hands to [FRIEND] in the checkpoint report.

### Phase 0: Scaffold and accounts (½ day)
**Scope**
- Scaffold Vite + React 19 + TS strict + Tailwind 4 + React Router 7 + vite-plugin-pwa (injectManifest). Pin exact versions and write `docs/STACK.md`.
- Set up the repo skeleton exactly as in §4: `src/core`, `src/data`, `src/features`, `src/platform`, `src/ui`, `supabase/`, `tests/`, `docs/`, plus the `@shared` alias with `allowImportingTsExtensions`.
- CI (`.github/workflows/ci.yml`): typecheck, lint, Vitest, secret scan, build, bundle-size check (it fails above the D17 budgets), plus `npm audit` as non-blocking.
- `docs/SETUP.md` drafted from §8. `.env.example`.
- Ask [FRIEND] for §8 steps 1–3, a batch of about 15 minutes.

**Files:** `package.json`, `vite.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/App.tsx`, `src/router.tsx`, `src/ui/tokens.css` (colour tokens only, §3 §2), `.github/workflows/ci.yml`, `.env.example`, `docs/*`.

**Definition of done**
- `npm run build` is green in CI on `main`.
- `npx supabase link` has succeeded against [FRIEND]'s project; the Lead confirms by running `supabase projects list` without printing keys.
- The secret scan passes, and a planted fake `sb_secret_test` in a scratch branch makes CI fail (then the branch is deleted).

**Demo script:** open the CI run, which is green. Open the Pages preview URL (if Pages is already connected) and see a black screen with the SPOTTER wordmark in plain text.

### Phase 1: Walking skeleton. Two users log, sync and export (2–3 days)
**Scope (functional only; minimal dark styling with tokens, no motion, sound, textures or particles)**
- **DB** (`0001_schema.sql`, `0002_rls.sql`, `0003_rpc.sql`, `0004_realtime.sql` stub):
  - all tables from §4, with the conventions there (client UUID, `local_date`, `client_updated_at`, `updated_at` trigger, `deleted_at`, indexes);
  - triggers `set_updated_at`, `lww_guard`, `enforce_owner`;
  - `is_crewmate()`, plus RLS on **every** table;
  - RPCs `create_crew`, `create_invite`, `redeem_invite`, `create_export_token`, `revoke_export_token`;
  - `profiles.export_format` (D13);
  - `seed.sql` with about 60 global exercises and their muscle map.
- **Auth:** 6-digit email OTP (D4). S2 with the rate-limit countdown "Link delayed — try again in 60 s".
- **Crew:** S3, create crew or join by code (D3), plus the profile step: name ≤16, colour from free hues (Volt to the creator), weekly target 3. `/join/<CODE>` route prefills the code. The error copy is "Code's dead. Ask for a new one."
- **Logging, plain UI:**
  - S6 gym session: exercise picker S7 with search, recent 8 and create exercise; kg and reps steppers ±2.5 / ±1; optional RPE pills 6–10; warm-up flag; LOG SET; swipe-delete with soft delete; finish button (plain hold, 600 ms).
  - S11 quick logs for Run, Martial arts, Weight and MIN. The MIN button on Floor logs "20m walk" in 1 tap.
- **Offline-first** (`src/data/db.ts`, `outbox.ts`, `sync.ts`, `pull.ts`, `ids.ts`):
  - Dexie mirror tables, outbox and meta;
  - single-flight flush on app start, `online`, `visibilitychange → visible`, every 30 s and after every write;
  - upserts in batches of ≤100 by `id`; backoff 2→60 s; dead-letter for 4xx;
  - delta pull with a 5 s overlap;
  - grey tick (on phone) and chalk tick (synced).
- **Floor (S4), minimal:** my week credits as text ("2/3 · 1 MIN"), partner's week credits as text, the last session summary, START and MIN.
- **Crew (S12), minimal:** the partner's latest 20 entries, refreshed by pull (Realtime arrives in Phase 3).
- **Export (D13, §5) in full, symmetric:**
  - Edge Function `export` with token hash lookup, constant 200 ms delay on 401, 60 requests/hour rate limit with `Retry-After`, `since` validation (400 on a bad value), `format=lines|json|csv` (default from `profiles.export_format`), ETag/304, `Cache-Control: private, no-cache` and `X-Content-Type-Options: nosniff`.
  - Determine whether the gateway accepts `Authorization: Bearer ipx_…` when deployed with `--no-verify-jwt`. If not, implement `X-Export-Token`, and record which one works in `docs/EXPORT.md`.
- **Settings → Vault export:**
  - Generate (shown once) / Copy / Revoke & regenerate; the list shows label, created, last used and revoked;
  - format picker (Lines / JSON / CSV);
  - a **live preview** of the last 7 days rendered by the same `_shared/export-format.ts`;
  - the **Copy for my AI** button (text in §8 step 9, canonical wording in §5).
- **Edge Function `health`** (returns `200 ok`), and `keepalive.yml` (pings every 2 days, commits `heartbeat.txt` monthly).
- **Deploy:** Cloudflare Pages with the CSP and headers from §4 in `public/_headers`, SPA fallback, and the manifest with name SPOTTER, icons and `display: standalone`.
- **Install basics:** S1 install gate, a plain version for now (the animated walkthrough comes in Phase 4); `navigator.storage.persist()` after install.

**Files:** `supabase/migrations/0001–0003`, `supabase/seed.sql`, `supabase/tests/rls.test.sql`, `supabase/functions/{export,health,_shared}/*`, `src/data/*`, `src/core/{credits,weeks,e1rm}.ts`, `src/features/{onboarding,log,session,settings,duo}/*`, `src/sw.ts`, `public/_headers`, `public/manifest`, `.github/workflows/keepalive.yml`, `tests/fixtures/export/*`, `tests/unit/export-format.test.ts`, `tests/e2e/p1-*.spec.ts`.

**Definition of done**
- Two real accounts (alice/bob test emails in local and mock runs; [FRIEND]'s own account in production) can each sign in with a 6-digit code on the deployed URL. They form a crew via a 10-char code, and each sees the other's entries after a pull.
- pgTAP (or the Deno fallback) is green for:
  - A cannot insert with B's `user_id`;
  - A reads crewmate B's sets;
  - non-member C reads nothing;
  - B's bodyweight is hidden while `show_bodyweight=false`;
  - an invite cannot be redeemed twice or after it expires;
  - `token_hash` is never selectable;
  - CI fails if any `public` table has RLS off.
- Flight-mode test, in Playwright `context.setOffline(true)` and on [FRIEND]'s iPhone: log 20 sets, kill the app, reopen it online. **Exactly 20 rows** on the server and 0 duplicates.
- The export golden fixtures in `tests/fixtures/export/` all pass byte for byte in the formats `lines`, `json` and `csv`.
- `curl` against production with a valid token → 200 with the correct lines. Revoked token → 401. A token for user A never returns user B's rows (tested with two tokens).
- There are no motion libraries in the Phase 1 bundle; initial JS is ≤170 KB gzip.

**Demo script**
1. On [FRIEND]'s iPhone: Safari → URL → Add to Home Screen → open from the icon → email → enter the 6-digit code → Start a crew → Lock in.
2. Settings → Crew → copy the invite link. Open it in a second browser profile as a second test account → join.
3. Phone 1, in airplane mode: START → Bench, 3 sets of 5 at 80 kg → finish → MIN → Weight 78.4.
4. Airplane mode off → ticks turn chalk within 30 s → phone 2 sees the entries after reopening.
5. Settings → Vault export → Generate → Copy → run on a laptop: `curl -s -H "Authorization: Bearer <token>" "https://<ref>.supabase.co/functions/v1/export"` → see `- 2026-…  · Bench · 3×5×80kg`, `· Weight · 78.4kg`, `· MIN · 20m walk`.
6. Revoke → the same curl returns 401.

### Phase 2: The workout engine (2 days)
**Scope**
- F4 prefill and next-exercise guess (rules in §2; ties per §4 §9); untouched prefilled set = 1 tap.
- F5 progression nudge (D10) as a chip "+2.5 → 82.5", tap to apply, never automatic. "Big jumps" toggle for lower-body compounds (+5 kg, off by default).
- F6 rest timer:
  - `ends_at`-based; 120 s for compounds and 90 s for isolation, remembered per exercise;
  - ±15 s and Skip;
  - after zero, "+0:12 over" counting up in the header chip;
  - Wake Lock on session start, timer start and `visibilitychange`, with the muted 1-second looping-video fallback and the "Screen may sleep" chip;
  - `aria-live` at 10 s and at 0.
  - Visual flash only, a single 300 ms pulse. Sound comes in Phase 4, Android vibrate per D16 now.
- F7 PR detection in `core/prs.ts`: e1RM (Epley, r 1–12), rep-max, volume, run distance and pace bucket ±5%. Only the highest tier fires. A first-ever session gives the "Baseline set" toast. `pr_events` rows are inserted locally and re-checked on the server. Here it is a static PR card; the takeover comes in Phase 4.
- F8 undo: an 8 s Undo on the row; swipe left → soft delete plus a 5 s restore snackbar; deleting a PR source soft-deletes its `pr_events` in the same outbox batch.
- F10 per-set weights, warm-up flag, `bw_lift` added load (0 or negative).
- F11 workout mode: session clock, hold RACK IT 600 ms, S10 summary (duration, tonnes, sets, PRs, one-line note), auto-close after 3 h idle at last set + 5 min, "Resume session (14 min)?" after a crash, a second session blocked with "Finish or discard the open one".
- F13 readiness sheet (D9) with **Do MIN** (first 2 exercises of the last session × 2 sets at 90%) and **Full send**; it never blocks.
- S14 exercise detail with history; S15 day editor (edit any field, including the date).
- Clock skew: detect a client clock more than 10 minutes off server time and apply the offset.

**Files:** `src/core/{prs,progression,readiness,volume}.ts`, `src/features/{session,timer,prs,stats}/*`, `src/platform/wakeLock.ts`, `src/platform/haptics.ts`, `tests/unit/*`, `tests/e2e/p2-*.spec.ts`.

**Definition of done**
- Unit tests cover:
  - e1RM at r=1, 12 and 13, and BW with and without a logged bodyweight;
  - the progression rule with RPE present, RPE absent and a gap of more than 14 days;
  - next-exercise guess fixtures;
  - prefill set mapping (extra sets copy the last set);
  - PR tier precedence;
  - a delete removing its PR.
- Playwright: log 3 sets using taps only inside the bottom 40% of the viewport → the timer starts → `page.clock` fast-forward → the flash element is visible at 0, and "+0:05 over" appears 5 s later.
- Backgrounding for 60 s mid-timer, then returning, shows the correct remaining time (computed from `ends_at`).
- Wake Lock behaviour on [FRIEND]'s iPhone is recorded in `docs/PLATFORM-NOTES.md`: works, or fallback active.

**Demo script:** START → readiness (tap 1/1/1) → "MIN day — still counts" → Full send → opens on the predicted exercise with last session's numbers → LOG SET (1 tap) → timer runs → lock and unlock the phone → the timer is still right → log a heavier set → PR card → swipe it away → the PR disappears → hold RACK IT → summary.

### Phase 3: Duo layer. Rings, The Bar, live feed (2 days)
**Scope**
- F14 personal ring and co-op ring: N × target segments, a MIN as half thickness, user B hatched (§3).
- The Bar per D6 and D7, with spots per D8. Week close is computed by `pg_cron` on Monday at 00:05 crew time (`0005_cron.sql`, function `close_week`); the client also computes it on open, and the server result wins. Weeks are built in the zone (`@date-fns/tz`), never as +168 h.
- "Bar adjusted after edit" when an edit changes a closed week's status.
- F15 Realtime:
  - publication per §4;
  - private channel `crew:{crew_id}` with a `realtime.messages` RLS policy;
  - presence payload `{user_id, session_id, kind, exercise_label, set_no, started_at}`;
  - presence banner "[name] is training · Bench · set 3 · 14 min", hidden 2 minutes after the last activity;
  - re-subscribe and delta pull on `visibilitychange`.
- Crew tab S12, full: partner card with ring, a neutral status ("Last trained 2 d ago"), live feed (new rows animate in later; plain insert now), a "Together" block, and the empty state "Crew of one. Send the code:".
- F16 comeback mode after ≥5 days with no credit: "Welcome back. MIN today?" with **20-min session** and **Just log MIN**; no count of days missed.
- F18 basic trend chart: best e1RM per session over 12 weeks; partner line toggle (dashed, rebased to % of each person's own first value).
- Fair comparison (§2 §6): relative % vs own trailing 4-week baseline, "Baseline building". Raw partner kg stays one tap deep and never sits side by side on the Crew front page.
- Partner leaves → co-op ring and The Bar freeze and are archived (`leave_crew` RPC).

**Files:** `supabase/migrations/0004_realtime.sql`, `0005_cron.sql`, `src/core/{weeks,credits,streak,duel}.ts`, `src/data/realtime.ts`, `src/features/duo/*`, `src/features/stats/*`, `src/ui/Ring.tsx`.

**Definition of done**
- With two signed-in devices online, a set logged on A appears in B's Crew feed in **≤3 s**, measured 10 times, p90 ≤3 s.
- Unit tests:
  - the week containing a set at 23:30 local on Sun 25 Oct 2026 starts Mon 19 Oct;
  - the 2027-03-28 switch;
  - credits (MIN 0.5, cap 2.0/day per D5);
  - the Bar table (FULL/FULL +1, HELD/FULL 0, REST −1, REST spotted 0, never below 0);
  - the spot window and monthly limit.
- A third test user joins with no schema change. Ring capacity = 3 × target, and each member gets a contiguous arc.
- Presence clears within 2 min 10 s of the last activity.

**Demo script:** both phones open. Phone 2 starts a session → phone 1's Floor shows the presence banner. Phone 2 logs a set → it appears on phone 1 within 3 s and phone 2's ring segment fills. Then use a test-only `?debug=week` override to simulate a week close and see a plate added.

### Phase 4: Iron & Chalk. Visual system and the four moments (2–3 days)
**Scope**
- The full §3 system:
  - oklch tokens converted with `culori`, plus `tokens.contrast.test.ts`;
  - Big Shoulders, Inter Tight and JetBrains Mono self-hosted via `@fontsource-variable`, precached;
  - Anybody optional (D17);
  - type scale, spacing, radii, elevation, the brushed-steel edge (max 4 on screen);
  - the grain PNG (≤12 KB, baked at build, never animated);
  - knurl hatch on RACK IT;
  - glass only on the nav and the timer (≤2 blur layers);
  - lucide icons plus about 10 custom glyphs.
- Motion: the `motion` library with the UI, SLAM and HEAVY springs; NumberFlow; View Transitions, feature-detected.
- Tier 3 micro: set logged (0.96 → 1, a 4px plate drop, `wdth` flex) with the copy "Locked in."
- Tier 1:
  - **PR takeover** per §3 §9.4 (≤120 particles via `canvas-confetti`, tap to skip, "Back to work" / "Share" stub);
  - **co-op ring close** per §3 §9.1;
  - **tier-up** of The Bar;
  - one Tier-1 per screen open, queued with a 400 ms gap, PR first.
- Tier 2: partner PR **shockwave** on next open (plays once, `pr_events.seen_by`), own segment fill, MIN logged ("MIN day. Still counts. Chain's alive.").
- Sound (off by default): Web Audio synth for clank, 3-2-1, bell, PR riser and ring chord. AudioContext unlocked on the first tap; `navigator.audioSession.type='playback'` if present ⚠️.
- iOS haptics checkbox trick behind a flag, off unless verified ⚠️.
- Reduced motion (media query **or** the in-app toggle): static cards, 200 ms fades, no canvas.
- S1 install gate, full: the animated Share → Add to Home Screen walkthrough; the "Install to keep your data safe" chip on Floor when skipped; the Android `beforeinstallprompt` button; "Open this in Safari / Chrome" for unsupported browsers.
- The forge flame (D7), its breath animation paused offscreen and under reduced motion.

**Files:** `src/ui/**`, `src/platform/{audio,haptics,install}.ts`, `src/features/prs/Takeover.tsx`, `src/features/duo/RingClose.tsx`, `public/fonts` via the fontsource build, `src/assets/*`.

**Definition of done**
- Contrast test green (text ≥4.5:1, large numbers and controls ≥3:1) in dark and light.
- Playwright with `reducedMotion: 'reduce'`: a PR shows the static card and no `<canvas>` exists.
- No flashes faster than 3 per second (asserted on the timer-zero and PR sequences).
- CLS ≤0.05 and initial JS ≤170 KB gzip; fonts ≤220 KB.
- The banned-word and banned-pattern test passes over `copy.ts`. No red state appears in the rest-week or missed-week UI (snapshot).

**Demo script:** log a set beating last time's best → the full PR takeover → "Back to work" → the timer is still counting underneath. Turn on Settings → Reduce motion → repeat → a static card. Phone 2 opens the app → the shockwave plays once and not again on the next open.

### Phase 5: Progress, settings and polish of MVP (1–2 days)
**Scope**
- S13 Progress: Lifts (sparklines), Run, Martial arts, and Body (7-day moving average chart).
- S14 completed: rep-max table placeholder, PR list, edit/delete per set, and a hidden data table for screen readers.
- S16 Settings, full:
  - profile, target, colour, units shown greyed (kg);
  - plate inventory, rest defaults;
  - sound, haptics, reduce motion, battery saver (turns off grain and 3D);
  - notification toggles (wired in Phase 7);
  - share bodyweight (off), share DOTS (off);
  - Vault export (done in Phase 1);
  - crew invite, leave crew;
  - sign out, and delete my account (removes all rows and revokes tokens);
  - dead-letter list "1 entry couldn't sync" with retry/discard.
- Empty states use no fake numbers: "Log your first set. Everything starts here." and "Two sessions and the lines start drawing."
- The offline banner "Saved on your phone. Syncs when you're back up." and "Server asleep — data safe on phone" when Supabase is paused.
- The SW update chip is suppressed during a workout.
- The scheduled purge of soft-deleted rows after 30 days.

**Definition of done**
- Every screen S1–S16 works at 375 px width and survives 200% text scaling without horizontal scroll.
- Delete-account leaves no rows for that user (verified by an SQL count) and revokes their export tokens (curl → 401).

**Demo script:** Progress → Bench → chart and history → edit one set's kg → the chart updates → change an entry's date in S15 → the export preview moves the line to the new date.

### Phase 6: Hardening gate. MVP release candidate (1–2 days)
**Scope**
- Run the full §7 test plan.
- Lighthouse CI on the preview: installable, LCP ≤2.0 s on mobile slow 4G, INP ≤200 ms, CLS ≤0.05.
- Run the §4 security checklist line by line.
- Accessibility pass:
  - targets ≥48 px, and ≥64 px for Log/Undo/timer controls;
  - `aria-label` on every icon button;
  - ring text alternatives;
  - focus order.
- An on-device session with [FRIEND] on iPhone (and Android if available), going through every ⚠️ item.
- Update `docs/PLATFORM-NOTES.md` with the device results.
- Rerun the export fixtures against production.

**Definition of done:** every MVP item in §9 is ticked with evidence; tag `mvp-rc`. Then [FRIEND] performs §8 steps 8–10 (invite the friend and wire both vaults).

**Demo script:** the §9 acceptance checklist itself, run by the Lead, then the on-device subset by [FRIEND].

### Phase 7: v1 features (3–5 days, in this order, each a mini-loop of §1.3)
1. **F24 Web Push**:
   - VAPID keys made with `npx web-push generate-vapid-keys`, stored as secrets;
   - Edge Function `push-dispatch` (`npm:web-push`; ⚠️ if it fails on Deno, use `jsr:@negrel/webpush` and record it);
   - permission asked only from a Settings button or after the first PR ("Want to know when [name] PRs?");
   - iOS only when installed (16.4+);
   - D11 events, 3 per day cap, quiet hours not queued, 404/410 purge, `fail_count ≥5` purge.
2. **F25 Nudge**: one per sender per day, "Gym's open. MIN counts.", two ignored nudges disable sending, enforced in the RPC.
3. **F23 Hype reactions**: 🔥 🦍 💀 by long-press, max 3 per set; Broadcast for instant display plus the durable `reactions` row; shown at the receiver's next rest-timer start or next open; never pushed.
4. **F20 Plate calculator and warm-up generator**: 2D SVG with IWF colours and "PER SIDE: 25 + 10 + 2.5"; warm-ups bar×10, 40%×5, 60%×3, 80%×1, rounded down to loadable weights, de-duplicated, flagged warm-up, inserted in one tap.
5. **F21 Ghost row**: "Last time: 3×5×80 @8", a gold border when matched, "Ghost's behind you."
6. **F22 Rep-max table and PR wall** (% over previous best).
7. **F27 Shorthand command bar**: `bench 80 5 5 5 @8`, `bench 80x5x3`, `run 5.2 27:40`, `bjj 60 @7`, `bw 78.4`, `min walk`, with a live preview and fuzzy aliases.
8. **F26 Muscle heatmap**: front and back, 5 steps in the owner's colour, duo view.
9. **F28 Story cards**: 1080×1920 PNG, Web Share Level 2 with a download fallback, no bodyweight.
10. **F29 Weekly recap**: hourly `pg_cron` on Sundays, sent at 19:xx local; a 4-card deck; a curated list of 40 roast lines that never mocks a person.
11. **F30 Duels and 4-week seasons**: baseline frozen at start, opt-in, "TAKEN." / "Next one's yours. +2.1% is still up."
12. **F31 Temptation bundle**: the "Unlocked" chip only during a session.

**Definition of done:** each feature's acceptance criteria from §2 have a test. The push cap and quiet hours are unit-tested with `Europe/Amsterdam` and one non-Amsterdam tz. A push arrives on [FRIEND]'s installed iPhone (or is recorded ⚠️ with the reason). Budgets are still green; the three.js chunk, if built, is lazy and ≤250 KB gzip.

**Demo script:** Settings → enable notifications → phone 2 sends a nudge → it arrives outside quiet hours → hype long-press on phone 2 → shows on phone 1 at the next rest timer → type `bench 80 5 5 5 @8` → preview shows 3 sets → confirm.

### Phase 8: Stretch (only on [FRIEND]'s explicit request)
3D barbell, Duo Wrapped, train-together mode, challenge stakes, training load, passkeys, Android voice, recovery %, Lottie plate crack. Each one gets its own plan, review and test loop, and none may break a budget.

---

## 7. Test plan and budgets

CI (`ci.yml`) runs on every push, in this order: typecheck → lint → unit and coverage → pgTAP (when Docker is available) → build → bundle-size check → Playwright on the mock backend → Lighthouse CI. Any failure blocks the phase checkpoint (§6). `npm audit` runs but does not block. A test named below must exist **with that name**, so §9 can check it off.

### 7.1 Unit tests (Vitest, CI-gating, ≥95% line coverage of `src/core/` and `supabase/functions/_shared/`)

**`e1rm.test.ts`**
- `U-E1` `epley 100x5 = 116.67` (2-decimal compare).
- `U-E2` `reps 1 returns weight`.
- `U-E3` `reps 12 computed; reps 13 returns null`.
- `U-E4` `bw_lift uses bodyweight_latest + added`; with no bodyweight → `null`.
- `U-E5` `assisted -15 with bw 78 → 63 base`.

**`export-format.test.ts`**
- `U-X1` `identical sets → 3×5×80kg`.
- `U-X2` `mixed → 2×5×80kg + 1×3×85kg`.
- `U-X3` `non-consecutive repeats stay separate`.
- `U-X4` `warm-ups excluded; only-warmup exercise yields no line`.
- `U-X5` `BW, BW+10kg, BW-15kg`.
- `U-X6` `kg trimming 80 / 82.5 / 81.25 / 1.25 / 100.10→100.1`.
- `U-X7` `RPE max, .5 kept, integer without .0`.
- `U-X8` `note sanitising: '·'→'-', newline→space, collapse, 120-cap`.
- `U-X9` `session note only on first lift line of session`.
- `U-X10` `runs merged per day; M:SS vs H:MM:SS at 3599/3600 s`.
- `U-X11` `km half-up rounding 5005 m → 5.01km, 10000 → 10km`.
- `U-X12` `martial merged per discipline per day; two disciplines two lines`.
- `U-X13` `weight latest of day, 78 → 78.0kg`.
- `U-X14` `MIN entry line; mode=min session adds MIN · session`.
- `U-X15` `within-date order Weight→lifts→martial→Run→MIN`.
- `U-X16` `trailing LF on last line, no blank line, empty → ''`.
- `U-X17` `golden basic.txt byte-identical` (compare as Buffer, which catches U+00B7 and U+00D7 errors).
- `U-X18` `golden since-2026-10-21`.
- `U-X19` `json and csv goldens; json.line === lines output`.
- `U-X20` `partner rows never appear`.
- `U-X21` `deleted rows excluded; renamed exercise uses current label`.

**`weeks.test.ts`**
- `U-W1` `Sun 2026-10-25 23:30 Europe/Amsterdam → week of Mon 2026-10-19` (25-hour day).
- `U-W2` `Mon 2026-10-26 00:00 → new week`.
- `U-W3` `2027-03-28 (23-hour Sunday) boundaries`.
- `U-W4` `week boundaries never computed by adding 168 h` (property test across 2026–2028).
- `U-W5` `session started 23:30 keeps local_date across midnight`.
- `U-W6` `crew tz used for crew weeks, device tz for display`.

**`credits.test.ts` / `bar.test.ts`** (rules from §2)
- `U-C1` `session = 1, MIN = 0.5`.
- `U-C2` `cap 2.0 per local day`.
- `U-C3` `warm-up-only session = 0`.
- `U-C4` `FULL / HELD / REST thresholds with target 3`.
- `U-B1` `both FULL → +1 plate`.
- `U-B2` `both ≥HELD → 0`.
- `U-B3` `one REST → −1, floor 0`.
- `U-B4` `REST covered by spot → 0`.
- `U-B5` `spot needs credits ≥ target+1 and 1 per calendar month`.
- `U-B6` `tier names Iron 0–3, Steel 4–7, Titanium 8–15, Obsidian 16+`.
- `U-B7` `N=3 crew ring = 3 × targets`.

**`prs.test.ts`**
- `U-P1` `first session sets baseline, no PR`.
- `U-P2` `rep-max PR`.
- `U-P3` `e1RM PR outranks rep-max on same set`.
- `U-P4` `volume PR`.
- `U-P5` `warm-ups never PR`.
- `U-P6` `deleting the PR set removes its PR on recompute`.
- `U-P7` `run longest distance; fastest pace within ±5% bucket`.

**`progression.test.ts`**
- `U-N1` `all reps at RPE ≤8 → +2.5`.
- `U-N2` `RPE missing and all reps hit → +2.5` (D14).
- `U-N3` `one set short → no nudge`.
- `U-N4` `lower_body + big_jumps → +5`.
- `U-N5` `gap >14 days → no nudge`.

**Other `core/` files**
- `prefill.test.ts`:
  - `U-F1` `next exercise from last session with same first exercise`.
  - `U-F2` `fallback: most frequent for weekday over 8 weeks`.
  - `U-F3` `set n prefilled from set n; extra sets copy last`.
- `shorthand.test.ts`:
  - `U-S1` `bench 80 5 5 5 @8 → 3 sets 80×5 RPE 8`.
  - `U-S2` `bench 80x5x3`.
  - `U-S3` `run 5.2 27:40`.
  - `U-S4` `bjj 60 @7`.
  - `U-S5` `bw 78.4`.
  - `U-S6` `min walk`.
  - `U-S7` `alias bp → Bench`.
  - `U-S8` `garbage returns parse error, never throws`.
- `plates.test.ts`:
  - `U-PL1` `100 kg on 20 bar → 25+15 per side`.
  - `U-PL2` `impossible weight rounds down to loadable`.
  - `U-PL3` `custom inventory`.
- `warmup.test.ts`: `U-WU1` `100 kg → bar×10, 40×5, 60×3, 80×1, dupes removed, flagged warm-up`.
- `readiness.test.ts`: `U-R1` `total ≤2 suggests MIN; 3 does not; skip = no suggestion`.
- `comeback.test.ts`: `U-CB1` `≥5 days since last credit → comeback; next credit clears`.
- `duel.test.ts`:
  - `U-D1` `% over own 4-week baseline`.
  - `U-D2` `<2 sessions in baseline → 'Baseline building'`.
  - `U-D3` `tie → half-segment both`.
- `dots.test.ts`: `U-DT1` `reproduces 3 published example values from the cited OpenPowerlifting source`. The test file cites the URL and commit of the coefficients. **A test with coefficients typed from memory fails review.**
- `validate.test.ts`: `U-V1` `Zod ranges equal DB checks (kg −250…500, reps 1–100, RPE 6–10 step .5, run 0.1–100 km, martial 1–480, bw 30–250)`.
- `tokens.contrast.test.ts`: `U-T1` `every §3 text pair ≥4.5:1, large/UI ≥3:1, dark and light`.

**`data/` tests** (Vitest with `fake-indexeddb` and the mock adapter)
- `U-O1` `write = mirror + outbox in one transaction`.
- `U-O2` `5 edits to one row coalesce to 1 outbox entry`.
- `U-O3` `20 offline sets → exactly 20 upserts, replay twice → still 20 rows`.
- `U-O4` `4xx marks dead, queue continues`.
- `U-O5` `backoff sequence 2,4,8,16,32,60`.
- `U-O6` `pull skips rows with pending outbox`.
- `U-O7` `clock offset >10 min applied to client_updated_at`.
- `U-O8` `bodyweight uuidv5 same day → same id`.
- `U-O9` `QuotaExceededError surfaces blocking modal state`.

### 7.2 Database tests (pgTAP, `supabase test db`)

These need Docker. Without it, run the same assertions as a Deno script against a throwaway **local** stack. Never run them against production.

- `D-1` `rls enabled on every public table` (queries `pg_class.relrowsecurity`).
- `D-2` `A cannot insert a set with B's user_id`.
- `D-3` `A cannot upsert over B's existing row id`.
- `D-4` `A reads crewmate B's sets/sessions`.
- `D-5` `non-member C reads zero rows from every table`.
- `D-6` `B bodyweight hidden while show_bodyweight=false, visible when true`.
- `D-7` `no client delete on training tables`.
- `D-8` `lww_guard keeps newer client_updated_at`.
- `D-9` `enforce_owner rejects a set on someone else's session`.
- `D-10` `child local_date forced to session local_date`.
- `D-11` `negative weight rejected on non-bw_lift`.
- `D-12` `invite single-use; expired rejected; revoked rejected; normalisation O→0 I/L→1 works`.
- `D-13` `11th failed redeem in an hour → slow_down`.
- `D-14` `crew_full at max_members`.
- `D-15` `left member loses crew reads; rejoin restores`.
- `D-16` `export_tokens.token_hash not selectable by authenticated; list_export_tokens omits hash`.
- `D-17` `4th active export token rejected`.
- `D-18` `send_nudge: one per day, refused in quiet hours, refused after 2 unacted`.
- `D-19` `spend_spot once per month and needs target+1`.
- `D-20` `every SECURITY DEFINER function has search_path=''` (catalogue query).
- `D-21` `realtime.messages policy: member can join crew topic, non-member cannot`.
- `D-22` `week-close: both FULL +1, REST −1 floor 0, spot holds`.

### 7.3 Edge Function tests (Deno test against the local stack)

- `F-1` `export 200 lines for own token, byte-identical to basic.txt after loading basic.json`.
- `F-2` `user A token never returns B rows` (both users seeded with data).
- `F-3` `missing/garbled/revoked token → 401 empty body, ≥200 ms`.
- `F-4` `61st request in an hour → 429 + Retry-After`.
- `F-5` `since invalid → 400; ?token= → 400`.
- `F-6` `format=json and format=csv match goldens; profile export_format respected`.
- `F-7` `ETag stable; If-None-Match → 304`.
- `F-8` `Cache-Control private, no-cache present`.
- `F-9` `revoke & regenerate: old 401 immediately, new 200`.
- `F-10` `X-Export-Token fallback works`.
- `F-11` `push-dispatch drops in quiet hours, caps at 3/day, skips if recipient already credited today (except partner_pr), deletes 410 endpoints`.
- `F-12` `health returns ok`.

### 7.4 End-to-end tests (Playwright, `VITE_BACKEND=mock`, projects `iPhone 15` on WebKit and `Pixel 7` on Chromium)

- `E-1` `onboarding → join with code → Floor shows two rings`.
- `E-2` `thumb zone`: log 3 sets where every tap's y ≥ 60% of the viewport height (asserted on each click's bounding box). The rest timer starts. `page.clock.runFor(120_000)` → the zero flash element is visible and "Bar's loaded." is announced.
- `E-3` `offline`: `context.setOffline(true)` → log 3 sets → reload → the sets are present and the outbox count is 3 → online → outbox 0 and chalk ticks show.
- `E-4` `crash resume`: start a session, close the page, reopen → "Resume session (… min)?".
- `E-5` `swipe-undo`: swipe left on a set → restore toast (5 s) → set and PR event removed after expiry.
- `E-6` `PR moment`: a PR set → the takeover shows. With `reducedMotion:'reduce'`, a static card shows and no `<canvas>` is present.
- `E-7` `one-tap log`: an untouched prefilled set takes exactly 1 tap.
- `E-8` `MIN`: one tap → "MIN counts." toast → half segment filled.
- `E-9` `comeback`: a mock clock set 6 days after the last credit → "Welcome back" state, with no day count rendered.
- `E-10` `export preview`: the Settings preview equals `basic.txt`. "Copy for my AI" text contains the URL and no `spx_`.
- `E-11` `token shown once`: after closing the sheet, the token text is no longer in the DOM.
- `E-12` `partner live` (two browser contexts on a shared mock bus): B's set appears in A's feed within 3 s.
- `E-13` `out-of-range input` shows "That's a world record. Check it." and creates no outbox entry.
- `E-14` `axe-core`: zero serious or critical violations on Floor, Log, Crew, Progress and Settings.

### 7.5 Manual device checklist (the agent writes it to `docs/DEVICE-TEST.md`; [FRIEND] runs it in §8, and the results are recorded)

| ID | Check | iPhone (iOS ≥16.4) | Android Chrome |
|---|---|---|---|
| M-1 | Install from Safari or Chrome; opens standalone with no browser UI | ✔ | ✔ |
| M-2 | 6-digit email code login inside the installed app | ✔ | ✔ |
| M-3 | Screen stays awake through a 3-minute rest (Wake Lock or video fallback). If it doesn't, the "Screen may sleep" chip shows. | ⚠️ 18.4+ expected native | ✔ |
| M-4 | Timer zero: flash always; sound if on (test with the silent switch on and off ⚠️); vibration Android only | ✔ | ✔ |
| M-5 | Airplane mode: log 5 sets → kill → reopen online → exactly 5 rows on the server | ✔ | ✔ |
| M-6 | Push enable from the Settings button; nudge arrives; quiet hours respected | home-screen only | ✔ |
| M-7 | Partner set visible on the other phone in ≤3 s | ✔ | ✔ |
| M-8 | `curl` export with each user's own token returns only their own data | — | — |
| M-9 | Web Share of a story card (files) works, or the download fallback works ⚠️ | ✔ | ✔ |
| M-10 | Font scaling at 200%: no clipped set rows | ✔ | ✔ |

### 7.6 Performance budgets (CI fails above these)

| Metric | Budget | Enforced by |
|---|---|---|
| Initial JS for the Log route, gzip | ≤ 170 KB | `size-limit` on `dist/assets` |
| CSS, gzip | ≤ 30 KB | `size-limit` |
| Fonts | ≤ 4 woff2 files, latin subset, ≤ 220 KB total, `font-display: swap` | script on `dist` |
| Grain tile | ≤ 12 KB PNG, 256×256 | script |
| three.js chunk | ≤ 250 KB gzip, lazy, never in the initial graph | `size-limit` + chunk-graph check |
| Precache total | ≤ 1.5 MB | vite-plugin-pwa manifest size check |
| LCP (Lighthouse mobile, slow 4G) | ≤ 2.0 s | Lighthouse CI |
| INP | ≤ 200 ms | Lighthouse CI (TBT proxy) + manual |
| Tap → "set logged" visual | ≤ 100 ms (local write ≤ 50 ms) | `performance.mark` in E-2 |
| CLS | ≤ 0.05 | Lighthouse CI |
| Animation | transform, opacity and `font-variation-settings` only; ≤ 2 `backdrop-filter` layers; R3F `frameloop="demand"`, DPR ≤ 1.5; 60 fps during logging on a mid-range Android | code review + a Playwright trace on Pixel 7 |
| Lighthouse | PWA installable criteria pass; Performance ≥ 90; Accessibility ≥ 95; Best Practices ≥ 95 | `lighthouserc.json` |

### 7.7 Accessibility budgets

- **Contrast:** text ≥ 4.5:1; large numbers and UI controls ≥ 3:1. Enforced by `U-T1` in both themes.
- **Targets:**
  - ≥ 48×48 px for everything, with an 8 px minimum gap.
  - ≥ 64 px for Log set, Undo, the timer controls and Skip.
  - The primary bar is 72 px.
  - A Playwright helper fails the run if any `button`, `[role=button]` or `a` has a bounding box under 48×48.
- **One-hand:** all workout actions sit in the bottom 40% of the screen (E-2). No action requires reaching a top corner. Sheets close with a swipe down.
- **Reduced motion:** `prefers-reduced-motion: reduce` **or** `profiles.reduce_motion` removes confetti, shake, spin, parallax, breath and 3D. Tier-1 moments become a 200 ms opacity fade (E-6).
- **Flashing:** never more than 3 flashes per second. The timer zero and PR are single pulses. A unit test on the flash scheduler asserts it.
- **Screen readers:**
  - Semantic buttons, and `aria-label` on every icon-only button.
  - The rest timer is `aria-live="polite"` and announces only at 10 s and at 0.
  - Rings expose text, e.g. "Week: 4 of 6 sessions, the friend 2, [name] 2" with names read from `profiles`, never hardcoded.
  - Charts carry a visually hidden data table.
- **Colour independence:** every user mark carries an initial chip plus a line, marker or hatch pattern per slot (D4). A test renders a ring in greyscale and asserts that the pattern attributes are present.
- **Text scaling:** layouts survive 200% (M-10). Display sizes use `clamp()`, and set rows wrap instead of truncating.
- **Language:** `<html lang="en">`. No banned copy strings from §3. A lint test greps `src/` for the banned word list and for any hardcoded name or email (`@` followed by a domain in a string literal outside tests fails).

---

## 8. Human checklist for [FRIEND]

About 25–35 minutes in total, split across checkpoints. The agent tells you when each step is due. **Never paste a secret into chat with anyone, including the friend.** Paste secrets only into the dashboards or the terminal prompt the agent opens.

### Step 1: GitHub (2 min, Phase 0)
1. github.com → New repository → name `ironpact` → **Private** → create.
2. Give your coding agent push access: either your local git is already signed in, or use `gh auth login` when the agent asks.

### Step 2: Supabase project (8 min, Phase 0)
1. supabase.com → sign up (free, no card) → New project.
   - Name `ironpact`.
   - Region **Frankfurt (eu-central-1)**.
   - Generate a strong database password and **save it in your password manager**.
2. Project Settings → API (or API Keys). Copy into the terminal prompt or the `.env` the agent creates, never into chat:
   - Project URL (`https://<ref>.supabase.co`) and the project ref;
   - the **publishable / anon** key (`sb_publishable_…` or the legacy anon key; either works ⚠️);
   - the **secret / service_role** key (`sb_secret_…` or legacy). This one goes **only** into `supabase secrets set`, which the agent runs.
3. Authentication → Providers → Email: **enabled**.
4. Authentication → Email Templates → "Magic Link": make sure the body contains the line `Your code: {{ .Token }}`, so the email carries the 6-digit code. Save.
5. Authentication → URL Configuration: leave it for now; you fill it in at Step 4.4.
6. Optional, only if code emails arrive late or not at all (the built-in sender is rate-limited ⚠️):
   - resend.com → free account → API key;
   - Supabase → Authentication → SMTP Settings → host `smtp.resend.com`, port 465, user `resend`, password = the Resend API key, sender = an address on a domain you verified, or Resend's test sender for now.

### Step 3: Supabase CLI link (3 min, Phase 0)
When the agent asks, run in the project folder:
```
npx supabase login
npx supabase link --project-ref <your-ref>
```
It asks for the database password from Step 2.1. After that the agent runs `db push`, `npx web-push generate-vapid-keys` (Phase 7), `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:<your address>`, and `supabase functions deploy` (with `export`, `health` and `push-dispatch` as `--no-verify-jwt`). You only approve these.

### Step 4: Cloudflare Pages (6 min, Phase 1)
1. dash.cloudflare.com → sign up (free) → Workers & Pages → Create → Pages → Connect to Git → pick `ironpact`.
2. Build command `npm run build` · output directory `dist` · environment variable `NODE_VERSION=22`.
3. Environment variables (Production and Preview):
   - `VITE_SUPABASE_URL`;
   - `VITE_SUPABASE_ANON_KEY` (the publishable key, **never** the secret one);
   - `VITE_VAPID_PUBLIC_KEY` (added in Phase 7, from the agent).
4. Deploy → copy the `https://<name>.pages.dev` URL → Supabase → Authentication → URL Configuration → **Site URL** = that URL, and add it under **Redirect URLs**.

### Step 5: Keep-alive (2 min, Phase 1)
GitHub repo → Settings → Secrets and variables → Actions → New secret:
- `SUPABASE_URL`;
- `SUPABASE_ANON_KEY`.

The agent's `keepalive.yml` pings `/functions/v1/health` every 2 days, because the free project pauses after about 7 idle days. It also commits `heartbeat.txt` monthly, because GitHub can disable scheduled workflows in inactive repos after about 60 days ⚠️. If you ever get an email that a workflow was disabled, open Actions → keepalive → Enable.

### Step 6: Smoke test on your iPhone (5 min, after Phase 1, again after Phase 6)
1. Safari → open the Pages URL → Share → **Add to Home Screen** → Add.
2. Open SPOTTER **from the home-screen icon**, not from Safari. Enter your email → enter the 6-digit code from the email.
3. Start a crew → pick a name (first name or nickname only) → Lock in.
4. Turn on airplane mode → START → log one set → MIN → turn airplane mode off → within about 30 s the grey tick turns to a chalk tick.
5. From Phase 7: Settings → Notifications → **Enable**, and allow when iOS asks. This only works from the installed icon, on iOS 16.4+.
6. Tell the agent what you saw, including anything that looked off: a timer that let the screen sleep, no sound, a missing notification. It records this in `docs/PLATFORM-NOTES.md`.

### Step 7: Data hygiene rules (read once)
- Display names are first names or nicknames only. No surnames, no medical info.
- Each person's export token is **personal**. You never see the friend's, and he never sees yours. Nobody sends a token over chat; each person generates their own in their own app.

### Step 8: Invite the friend (3 min, after Phase 6 `mvp-rc`; Phase 1 for early testing)
1. Crew → **Invite** → it shows a link `https://<app>/join/<CODE>` and the 10-character code in large type (valid 7 days, single use; "Invite" again makes a new one and kills the old one).
2. Send the friend a private message (WhatsApp is fine; the code is not a secret like a token, but don't post it in a group). Paste this, filling the brackets:

```
SPOTTER is live. Do this on your iPhone, in Safari (not Chrome):
1. Open: <app URL>/join/<CODE>
2. Tap Share → Add to Home Screen → Add.
3. Close Safari. Open SPOTTER from your home screen icon.
4. Enter your email, then the 6-digit code from the email.
5. Your invite code (if it isn't filled in): <CODE> — valid 7 days.
6. Pick your name + colour, keep target 3, tap Lock in.
For your vault: in SPOTTER go to Settings → Vault export → Generate.
Your export URL is: https://<ref>.supabase.co/functions/v1/export
Tap "Copy for my AI" and paste that into your laptop agent. Never send the token to anyone, including me.
```

3. After he joins, check that your Crew tab shows his card and his empty ring next to yours.

### Step 9: Wire YOUR vault (5 min, after Phase 1; same steps the friend follows on his side)
1. SPOTTER → Settings → Vault export → **Format**. Pick what your vault takes: **Lines** (default, Markdown bullets), **JSON** or **CSV**. A per-request `?format=lines|json|csv` overrides it.
2. **Generate**, label it e.g. `laptop-vault`. The token (`ipx_…`) is shown **once**, so copy it straight into your agent's secret store: an environment variable `SPOTTER_TOKEN`, or the OS keychain. Never put it in a note, the repo or a URL. Tokens are sent in a header only.
3. Tap **Copy for my AI** and paste the result into your vault agent. It copies text like the block below; the canonical wording is in §5, and §5 wins if they differ.

```
SPOTTER export — my own training data, read-only.
GET https://<ref>.supabase.co/functions/v1/export[?since=YYYY-MM-DD][&format=lines|json|csv]
Auth: header "Authorization: Bearer $SPOTTER_TOKEN" (if 401 with a valid token, use header "X-Export-Token: $SPOTTER_TOKEN" — see docs/EXPORT.md).
Token is in env var SPOTTER_TOKEN. Never log it, never put it in a URL.
Default format: one line per item, newest date first, LF endings, separators " · " (U+00B7) and "×" (U+00D7):
- 2026-10-24 · Bench · 3×5×80kg · RPE 8 · felt strong
- 2026-10-24 · Bench · 2×5×80kg + 1×3×85kg · RPE 9
- 2026-10-24 · Pull-up · 3×8×BW
- 2026-10-24 · Run · 5.2km · 27:40
- 2026-10-24 · BJJ · 60m · RPE 7 · drilled guard
- 2026-10-24 · Weight · 78.4kg
- 2026-10-24 · MIN · 20m walk
Rules: since= is inclusive. Empty body = no entries. 401 = bad/revoked token. 429 = over 60 calls/hour (respect Retry-After). 304 if ETag unchanged.
To sync: pull with since = (last pulled date − 2 days), then REPLACE each returned date block in my notes (edits and deletes in the app change past days).
```

4. Ask your agent to write a small pull script that does exactly that and runs at most hourly (once or twice a day is plenty), then test it once:
   ```
   curl -sf -H "Authorization: Bearer $SPOTTER_TOKEN" "https://<ref>.supabase.co/functions/v1/export?since=2026-10-01"
   ```
5. Lost laptop or leaked token → SPOTTER → Settings → Vault export → **Revoke & regenerate**. The old token dies immediately. Up to 3 active tokens are allowed, e.g. one per machine.

### Step 10: What to send whom, summarised
| To | What | Channel |
|---|---|---|
| the friend | app URL, join link, 10-char code, install steps, export base URL (Step 8 message) | private chat |
| the friend | **nothing else**: no tokens, no keys | — |
| Your agent | Supabase keys (terminal/`.env`), DB password (terminal prompt only) | local only |
| Your vault agent | the "Copy for my AI" text + `SPOTTER_TOKEN` as a secret | local only |

---

## 9. Final acceptance checklist (the agent self-verifies every item, with evidence, before declaring done)

Each item needs evidence, written next to it in `docs/ACCEPTANCE.md`: a test name, a curl transcript (token redacted), a screenshot path, or "verified on [FRIEND]'s iPhone, <date>". An item verified only in an emulator where a device is required is **not** ticked; mark it ⚠️.

**Accounts, crew, privacy**
- [ ] 1. Sign-in with a 6-digit email code works from the installed iOS home-screen app (device).
- [ ] 2. Rate-limited sign-in shows "Link delayed — try again in 60 s" with a visible countdown.
- [ ] 3. Creating a crew issues a 10-char Crockford code. Only its sha256 is stored in `crew_invites.code_hash`.
- [ ] 4. An invite cannot be redeemed twice, after 7 days, or after it has been revoked by a newer invite (pgTAP). The UI shows "Code's dead. Ask for a new one."
- [ ] 5. A third test user joins with no schema or code change; the co-op ring shows 3 × target segments.
- [ ] 6. User A cannot insert or update a row with B's `user_id` on any user table (pgTAP).
- [ ] 7. Non-member C reads zero rows of A and B (pgTAP).
- [ ] 8. B's bodyweight is invisible to A while `show_bodyweight=false`, and visible once it is true.
- [ ] 9. CI fails if any `public` table has RLS disabled (proven by a scratch migration).
- [ ] 10. No surname, email or real name appears in the repo, seed or fixtures (grep over tracked files).
- [ ] 11. Delete my account removes every row of that user and revokes their tokens.

**Logging and offline**
- [ ] 12. An untouched prefilled set logs in exactly 1 tap; a changed set in 2.
- [ ] 13. All primary workout actions sit in the bottom 40% (Playwright tap-zone assertion on both device profiles).
- [ ] 14. Log Set, Undo and the timer controls are ≥64 px; every other target is ≥48 px, with gaps ≥8 px.
- [ ] 15. Tap → "set logged" visual ≤100 ms; local write → UI ≤50 ms (performance marks).
- [ ] 16. Flight-mode test: 20 sets offline, kill, reopen online → exactly 20 server rows, 0 duplicates (Playwright **and** device).
- [ ] 17. The outbox replays on open, on `online`, on `visibilitychange` and every 30 s, single-flight.
- [ ] 18. A 4xx payload goes to dead-letter, the queue continues, and Settings offers retry or discard.
- [ ] 19. Undo appears for 8 s, and swipe-delete restores within 5 s. Deleting a PR's source set removes its `pr_events` row and the partner's PR card.
- [ ] 20. Last-write-wins: an older `client_updated_at` never overwrites a newer one (`lww_guard` test).
- [ ] 21. Run, martial-arts, weight and MIN quick logs save. MIN from Floor takes ≤2 taps ("20m walk" in 1).
- [ ] 22. Out-of-range input shows "That's a world record. Check it."
- [ ] 23. A crash mid-session offers "Resume session (N min)?". A second open session is blocked with "Finish or discard the open one". A 3 h idle session auto-closes at the last set + 5 min.

**Workout engine**
- [ ] 24. The progression nudge follows D10, is tap-to-apply only, and is suppressed after a gap of more than 14 days.
- [ ] 25. The rest timer is computed from `ends_at`, stays correct after 60 s in the background, and shows "+0:12 over" after zero.
- [ ] 26. Timer zero: a single ≤300 ms flash (never more than 3 flashes/s), the bell if sound is on, Android vibrate `[80,60,80,60,200]`, and "Bar's loaded."
- [ ] 27. Wake Lock is held during a session, or the fallback runs with the "Screen may sleep" chip shown; the device result is recorded.
- [ ] 28. PRs: Epley for reps 1–12, highest tier only, warm-ups excluded, "Baseline set" on the first-ever session.
- [ ] 29. Readiness is stored 1–3 per row; a sum ≤5 suggests MIN; Do MIN builds 2 exercises × 2 sets at 90%; it never blocks.
- [ ] 30. Holding RACK IT for 600 ms shows the summary with duration, tonnes, sets, PRs and a note.

**Duo**
- [ ] 31. A partner's set appears on the other phone within 3 s, p90 over 10 trials, both online.
- [ ] 32. The presence banner shows exercise, set number and minutes, and clears within about 2 minutes of the last activity.
- [ ] 33. Credits: session 1, MIN 0.5, at most 2.0 per local day (D5); FULL/HELD/REST are computed per §2.
- [ ] 34. The Bar: +1 when both are FULL, 0 when both ≥HELD, −1 on REST unless spotted, never more than −1 per week, never below 0, tiers Iron/Steel/Titanium/Obsidian.
- [ ] 35. A spot is offered from Sunday 12:00 crew time only when the spotter has ≥ target + 1 credits; 1 per member per month; "[name] spotted you. Week saved."
- [ ] 36. The week close runs server-side on Monday at 00:05 crew time, and the server result overrides the client's.
- [ ] 37. Week boundaries are correct across 2026-10-25 and 2027-03-28 (a set at 23:30 on Sun 25 Oct 2026 → week of Mon 19 Oct).
- [ ] 38. Comeback mode appears after ≥5 days with no credit, shows no count of missed days and no red, and goes away after the next credit.
- [ ] 39. The Crew front page never shows raw kg side by side; comparisons are % of each person's own baseline.

**Export (symmetric, §5)**
- [ ] 40. Every golden fixture passes byte for byte in `lines`, `json` and `csv`.
- [ ] 41. Production curl with A's token returns only A's data, and with B's token only B's (both tested).
- [ ] 42. A bad or revoked token → 401 after about 200 ms with an empty body. The 61st call within an hour → 429 + `Retry-After`. A malformed `since` → 400. No entries → 200 with an empty body.
- [ ] 43. The response has `text/plain; charset=utf-8` (for lines), LF endings, no header line, no trailing blank line, the literal U+00B7 and U+00D7, `Cache-Control: private, no-cache`, and an ETag with a working 304.
- [ ] 44. The token is never accepted in a query string, never logged, stored only as sha256, shown once, max 3 active, and rotation revokes immediately.
- [ ] 45. The in-app export preview output equals the server output for the same data (same `_shared` formatter, snapshot test).
- [ ] 46. "Copy for my AI" copies the §5 text with this user's own export URL filled in and **no token**.
- [ ] 47. `docs/EXPORT.md` states which auth header works against the deployed gateway.

**PWA, platform, push**
- [ ] 48. The install gate shows in iOS Safari when not standalone; the Android install button works; `navigator.storage.persist()` is called after install.
- [ ] 49. Lighthouse installability passes; the manifest name is SPOTTER, with `display: standalone` and theme `#0A0A0B`; the icons include a 180 px apple-touch icon.
- [ ] 50. The service worker never caches Supabase API or export responses; the app shell and fonts work offline.
- [ ] 51. The SW update prompt is suppressed during an active workout.
- [ ] 52. Push (v1): permission is requested only from a tap; delivery to the installed iPhone is verified or ⚠️ recorded; ≤3 per recipient per day; nothing sent during quiet hours 22:00–08:00 in the recipient's tz; 404/410 endpoints purged; hype never pushed.
- [ ] 53. Every haptic has a visual twin; nothing depends on iOS vibration.

**Visual, copy, accessibility, performance**
- [ ] 54. The token contrast test passes in dark and light (text ≥4.5:1, large numbers and controls ≥3:1).
- [ ] 55. Reduced motion (OS setting or the in-app toggle) removes confetti, shake, spin, parallax, breath and 3D; a PR shows a static card with no canvas.
- [ ] 56. No green status colour and no red failed/missed state anywhere; danger red only on destructive buttons, with an icon.
- [ ] 57. The banned-word test passes over all copy ("beast", "no excuses", "grind", "crush it", "failed", "missed", "lazy", "you broke your streak", "don't give up").
- [ ] 58. Sound is off by default; at most 2 `backdrop-filter` layers on any screen; the grain is a static PNG ≤12 KB.
- [ ] 59. Initial JS ≤170 KB gzip, CSS ≤30 KB, fonts ≤220 KB in ≤4 files, precache ≤1.5 MB, LCP ≤2.0 s, INP ≤200 ms, CLS ≤0.05 (Lighthouse CI artefact).
- [ ] 60. Every screen works at 375 px width and 200% text scaling with no horizontal scroll; charts have hidden data tables; icon buttons have `aria-label`.

**Operations and security**
- [ ] 61. No service-role or secret key in `dist/`, the repo or CI logs (the secret scan is green, plus a grep over the `dist/` artefact).
- [ ] 62. `public/_headers` serves the CSP from §4 (`connect-src` limited to the project's https and wss origins), `frame-ancestors 'none'`, `Referrer-Policy no-referrer` and the `Permissions-Policy`.
- [ ] 63. Every SECURITY DEFINER function sets `search_path = ''` and checks `auth.uid()` (a SQL catalogue query proves it).
- [ ] 64. The keep-alive workflow has run successfully at least once, and `/functions/v1/health` returns 200.
- [ ] 65. The soft-delete purge job (30 days) is scheduled; the week-close and recap cron jobs are visible in `cron.job`.
- [ ] 66. DOTS: coefficients cite a primary source and reproduce 3 published values; otherwise the badge is disabled and this is reported.
- [ ] 67. `docs/SETUP.md`, `docs/EXPORT.md`, `docs/PLATFORM-NOTES.md` and `docs/ACCEPTANCE.md` are current. Every ⚠️ in §2–§4 has a recorded finding with its source.
- [ ] 68. Every phase is tagged, `main` is green, and the final checkpoint report to [FRIEND] lists anything rolled forward or still ⚠️.

## 10 — Errata and overrides (these win over every section above)

> Building agent: this section wins over §0–§9, including §1.1 and the §1.6 decision register. Each item names what it overrides, the defect in one line, and the rule to build. Where an item is marked ⚠️, verify it as §1.2 requires and record the result in `docs/PLATFORM-NOTES.md`.

### 10.0 Document repairs

**E0.1 · Overrides: §5.1 (corrupted text)**
- **Defect:** the copy of §5.1 is broken. Two copies of §0–§1.6 were pasted in the middle of it, cutting off the `since` and token regexes.
- **Rule:** ignore both pasted copies. These are the full rules:
  - `since` must match `^\d{4}-\d{2}-\d{2}$` and be a real calendar date. Otherwise return **400** with body `bad since`.
  - Function step 1: if the token is missing or does not match `^spx_[A-Za-z0-9_-]{43}$`, wait 200 ms and return **401** with an empty body.

**E0.2 · Overrides: the end of §3**
- **Defect:** a leftover drafting note starts "The section came out at about 5,300 words… Nothing was written to disk."
- **Rule:** delete it. It is not a requirement.

**E0.3 · Overrides: every "§2 §N" / "§3 §N" style pointer**
- **Defect:** these pointers use the source docs' numbering, so they point at the wrong sections.
- **Rule:** read them as follows:

| Pointer as written | Read as |
|---|---|
| "§2 §4" | §2.6 |
| "§2 §6" | §2.8 |
| "§2 §8" | §2.7 |
| "§3 §2" | §3.2 |
| "§3 §8" | §3.8 |
| "§3 §9.x" | §3.9.x |
| "§4 §9" | AC4.1 (it holds the tie rules) |
| "text in §8 step 9" | §5.7 |

### 10.1 Naming and identifiers (§1.1.4, §1.6 D1, §4.0 D1/D20, §4.2, §5, §8)

**E1.1 · Defect:** the name is split three ways. The repo, DB and namespace are called both `ironpact` and `spotter`. The token prefix is `ipx_` in §1 and §8 but `spx_` in §4 and §5.
- **Rule:**
  - Repo, package and Dexie database name: **`ironpact`**.
  - Code namespace and every user-facing string: **SPOTTER**.
  - Export token prefix: **`spx_`** everywhere, matching §5's byte contract. Replace every `ipx_` in §1.2, §1.3, §2.3 (AC17.1), §3.9.11, §6 and §8 with `spx_`.
  - The repo-tree root in §4.2 is `ironpact/`.

**E1.2 · Overrides: the §1.2 secret scan**
- **Defect:** grepping for `ipx_` matches the docs and placeholder strings, but never matches a real token.
- **Rule:** fail CI on:
  - the regex `\b[si]px_[A-Za-z0-9_-]{43}\b`;
  - `sb_secret_`;
  - `service_role"?\s*[:=]`;
  - `eyJhbGci[A-Za-z0-9_-]{20,}`.

  Scan both the tracked files and `dist/`.

### 10.2 One canonical table for the conflicting rules

**E2.1 · Overrides: §1.6 D7, §2.2 tiers, §3.0 D10, §3.2.1, §3.9.2**
- **Defect:** the tier tables contradict each other: Bare bar/Bronze/Iron/Steel/Obsidian, Iron/Steel/Titanium/Obsidian, and the hex values swap between sections.
- **Rule:** use this table:

| Plates | Tier | Flame outer colour |
|---|---|---|
| 0–3 | **Iron** | `#9AA0A6` |
| 4–7 | **Steel** | `#7FA7C9` |
| 8–15 | **Titanium** | `#C9CCD1` ⚠️ (contrast test) |
| 16+ | **Obsidian** | core `#1A1420`, molten rim |

- There is no "Bare bar" and no "Bronze". `#B87333` is not used.

**E2.2 · Overrides: §1.6 D9, §4.0 D13, §4.3 `sessions.readiness` check, §3.10.2, U-R1**
- **Defect:** readiness is stored as 1–3 in some sections and 0–2 in others, and the DB check rejects 3.
- **Rule:**
  - Store each row as **1–3**, with a DB check of `between 1 and 3`.
  - MIN is suggested when the **sum is ≤5**.
  - U-R1 becomes: `sum 5 suggests MIN; sum 6 does not; skip = no suggestion`.

**E2.3 · Overrides: §4.0 D10, §4.3 checks, §2.7, U-V1**
- **Defect:** the DB checks are stricter than §1.6 D14, and the golden fixture `r2` has `rpe: 5`, so it fails the DB check.
- **Rule:**
  - **DB checks (all `rpe` columns):** RPE 5–10 in 0.5 steps; bodyweight 30–300; `display_name` 1–20.
  - **UI / Zod (all forms):** RPE 6–10; bodyweight 30–250; name 1–16.
  - **Zod import (pull/Realtime payloads):** follows the DB ranges.
  - U-V1 becomes: `form schemas ⊆ DB checks; import schemas == DB checks`.

**E2.4 · Overrides: §4.0 D16, §4.3 `reactions.emoji`, §2.3 F23, §6 Phase 7.3**
- **Defect:** emoji reactions (🔥🦍💀) contradict §3.0 D11, which bans emoji and skulls.
- **Rule:**
  - The column becomes `kind text check (kind in ('light_weight','clean','again','chalk'))`.
  - The UI shows only the chalk stamps LIGHT WEIGHT · CLEAN · AGAIN · chalk handprint.
  - There is no emoji anywhere in the UI.

**E2.5 · Overrides: §4.3 `streak_tokens.kind`**
- **Defect:** the check allows only `'spot'`, but §1.6 D6 says `'freeze'` stays in the schema.
- **Rule:** `check (kind in ('spot','freeze'))`. `'freeze'` is never written.

**E2.6 · Copy conflicts. Every one of these is final, and every other variant is deleted.**

| Context | Final string | Fixes |
|---|---|---|
| Comeback | "Welcome back. You owe nothing." + buttons "20-min session" · "Just log MIN" | §2 AC16.1, §6 Phase 3 |
| Presence | "{partner} is on the floor · Bench 3/5 · 14 min" | §4.5, §6 Phase 3 |
| OTP rate limit | "Code delayed — try again in 60 s." | §4.7 Auth, §6 Phase 1, §9 #2 |
| Edited elsewhere | "Updated from your other phone." | §2.10, §4.6 |
| Ghost matched | 2px chalk border + "Ghost's behind you." — **no gold** | §2 F21, §6 Phase 7.5 |
| Spot offer | "{partner}'s week is light. You can cover it." | §3 #23, §2.6 |
| Spot not yet eligible | "Log one past your target to cover {partner}." | §2.2, §3.9.2 |
| Spot push | "{partner}'s week is light. You can cover it." | §2.6 |
| Phase 2 demo readiness line | "Running on fumes? MIN today. It counts the same." | §6 Phase 2 |

- No copy string uses a gendered pronoun: no "him", "his", "he" or "she". Use `{partner}` or "they".
- `copy.test.ts` greps for `\b(him|his|he|she|her)\b` in user-facing strings.

**E2.7 · Overrides: §2.5, §5.7, §8 step 9**
- **Defect:** there are three different "Copy for my AI" templates, with different prefixes and different sync advice.
- **Rule:** the **only** template is E6.2 below. Delete the blocks in §2.5 and §8 step 9; §8 step 9.3 just says "Tap Copy for my AI and paste it into your vault agent."

### 10.3 Platform and accounts (buildability)

**E3.1 · Overrides: §8 step 2.6, §4.7 Auth**
- **Defect:** Supabase's built-in email sender only delivers to members of the project's organization and is heavily rate-limited ⚠️. the friend would never get his code.
- **Rule:** custom SMTP is **mandatory before the friend is invited**. It becomes §8 step 2.6, no longer optional. Pick one:
  1. **Brevo free** (about 300 emails a day) with a single verified sender address ⚠️ (check whether a Gmail sender passes DMARC).
  2. **Resend free**, which needs a verified domain. A domain is not free, so ask [FRIEND] first.

  Stop-gap only, for the first test: invite each crew email to the Supabase organization as a member ⚠️. The agent records which option works.

**E3.2 · Overrides: §8 step 2.4, §4.7 Auth**
- **Defect:** with `shouldCreateUser: true`, a first-time user may get the "Confirm signup" email template, not "Magic Link". The code is also configurable in length and lifetime.
- **Rule:**
  - [FRIEND] puts `Your code: {{ .Token }}` into **both** the "Confirm signup" and the "Magic Link" templates.
  - Authentication → Providers → Email: set **Email OTP Length = 6** and **Email OTP Expiration = 600** s ⚠️ (check the field names in the current dashboard).
  - The S2 code boxes render `VITE_OTP_LENGTH` boxes, default 6, and paste fills all of them.

**E3.3 · Overrides: §4.2 env list, §8 step 3**
- **Defect:** `supabase secrets set` refuses names starting with `SUPABASE_`. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions automatically.
- **Rule:**
  - Never set them. Functions read `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` ⚠️ (check the injected name, which may now be a `SUPABASE_SECRET_KEYS` variant).
  - The only secrets to set are `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `DISPATCH_SECRET`.

**E3.4 · Overrides: §8 step 3, §4.7 VAPID**
- **Defect:** `VAPID_SUBJECT=mailto:<your address>` puts an email into config, against the privacy rule.
- **Rule:** `VAPID_SUBJECT=https://<app>.pages.dev`.

**E3.5 · Overrides: the §4.7 / §8 `--no-verify-jwt` deploy flag**
- **Defect:** a CLI flag gets forgotten on the next redeploy.
- **Rule:**
  - In `supabase/config.toml`, set `[functions.export] verify_jwt = false`, and the same for `health`, `push-dispatch` and `rest-alarm` (E9.1).
  - CI checks these entries exist.

**E3.6 · Overrides: §4.7 `public/_headers`**
- **Defect:** a static file can't contain `<ref>`, and the CSP breaks if the placeholder ships.
- **Rule:**
  - `scripts/gen-headers.mjs` runs in `npm run build`. It reads `VITE_SUPABASE_URL` and writes `dist/_headers` with the real `https://` and `wss://` origins.
  - The build fails if `<ref>` survives into `dist/`.

**E3.7 · Overrides: §4.7 manifest `shortcuts`**
- **Defect:** iOS ignores manifest shortcuts.
- **Rule:** keep them for Android only, and never depend on them.
- **Rule:** iOS has no proper splash screen without `apple-touch-startup-image` ⚠️, so generate them with `@vite-pwa/assets-generator` (`#0A0A0B` background with the wordmark) to avoid a white launch flash.

**E3.8 · Overrides: §2.9 Flow 1 step 4, §2 S3**
- **Defect:** on iOS, the installed app does not share `localStorage` with Safari, so a code saved on the `/join` page never reaches the app.
- **Rule:** the `/join/<CODE>` page shows the code large, plus a 64px **"Copy code"** button (`navigator.clipboard.writeText` in a tap handler). S3 then offers:
  1. **Paste** (`navigator.clipboard.readText` on tap; iOS shows its paste bubble);
  2. prefill from the URL, when the installed app was launched at `/join/<CODE>` ⚠️ (check whether iOS uses the page URL or the manifest `start_url`);
  3. typing.

**E3.9 · Overrides: §8 step 5, §4.7 keep-alive**
- **Defect:** GitHub disables scheduled workflows after 60 days of inactivity only in **public** repos, and this repo is private.
- **Rule:** keep the ping. The monthly heartbeat commit stays, but only as a harmless guard. Mark the claim ⚠️ in `PLATFORM-NOTES.md`.

**E3.10 · Overrides: §4.1 Motion, §7.6 budget**
- **Defect:** the full `motion` bundle threatens the 170 KB initial-JS budget.
- **Rule:**
  - Use `LazyMotion` + `domAnimation` with the `m.*` components.
  - Load `domMax` and `canvas-confetti` lazily.
  - `size-limit` measures the Log route with Phase 4 code included.

### 10.4 Data model, RLS and RPC holes

**E4.1 · Overrides: §4.3 foreign keys**
- **Defect:** `auth.admin.deleteUser` and the 30-day purge fail on foreign keys that don't cascade.
- **Rule:**

| Column | On delete |
|---|---|
| `exercises.owner_id` | cascade |
| `crews.created_by` | set null (column becomes nullable) |
| `crew_invites.created_by`, `crew_invites.used_by` | cascade / set null |
| `nudges.from_user`, `nudges.to_user`, `reactions.to_user` | cascade |
| `challenges.created_by`, `challenge_participants.user_id` | cascade |
| `sets.session_id`, `cardio_entries.session_id`, `martial_entries.session_id`, `min_entries.session_id` | cascade |
| `pr_events.exercise_id`, `sets.exercise_id` | restrict (purge never hard-deletes an exercise that sets reference) |

- **Add test D-23:** `delete_my_account leaves 0 rows for that user across every public table`.

**E4.2 · Overrides: §4.4 `cp_ins`**
- **Defect:** any user can join any crew's challenge.
- **Rule:** the check becomes `user_id = auth.uid() and exists (select 1 from public.challenges c where c.id = challenge_id and public.is_member(c.crew_id) and c.status = 'proposed')`.

**E4.3 · Overrides: §4.4 `redeem_invite`**
- **Defect:** the "10 failed attempts per hour" rule has nowhere to store attempts.
- **Rule:** add the table `invite_attempts(user_id uuid, at timestamptz default now())` with no client policies. The RPC counts the caller's rows from the last hour.

**E4.4 · Overrides: §4.4 `send_nudge`**
- **Defect:** nothing ever sets `acted_on`.
- **Rule:** compute it inside the RPC. A nudge is "acted on" if the recipient has ≥0.5 credit with `logged_at` within 24 h after `created_at`. Drop the `acted_on` column.

**E4.5 · Overrides: §4.3 triggers, `lww_guard`**
- **Defect:** returning `OLD` still writes the row, and `set_updated_at` then bumps `updated_at`.
- **Rule:** `lww_guard` returns **NULL**, which skips the row, when `NEW.client_updated_at < OLD.client_updated_at`. Name it `a_lww_guard` so it runs before `b_set_updated_at`.

**E4.6 · Overrides: §4.6 IDs**
- **Defect:** natural-key tables created on two offline devices hit unique conflicts and go dead.
- **Rule:** use deterministic uuidv5 ids:

| Table | Key |
|---|---|
| `exercise_prefs` | `user_id:exercise_id` |
| `reactions` | `user_id:target_id:kind` |
| `bodyweight_entries` | `user_id:local_date` |

- When a bodyweight entry's date is changed in S15, soft-delete the old row and write a new one.

**E4.7 · Overrides: §4.4 `push_subscriptions`**
- **Defect:** if a second user signs in on the same phone, the unique `endpoint` collides with the first user's row and RLS blocks the update.
- **Rule:** RPC `save_push_subscription(endpoint, p256dh, auth)` (security definer) reassigns the endpoint to the caller. Remove the `ps_all` insert and update policies; keep select and delete.

**E4.8 · Overrides: §2 AC7.5, §4.0**
- **Defect:** "the server re-checks PRs on sync" has no implementation anywhere.
- **Rule:** delete the server re-check. Before a partner's PR shows (feed stamp, shockwave or push), the viewing client recomputes it from the owner's synced sets. If they disagree, it is hidden. The `partner_pr` push fires from a `pg_net` webhook only after a 2-minute delay ⚠️; if that is not feasible, fire it immediately.

**E4.9 · Overrides: §4.4 (exercise uniqueness)**
- **Defect:** export labels can clash with export keywords and make the lines ambiguous.
- **Rule:** `exercises.export_label` and `martial_entries.discipline` reject (case-insensitive) `Weight`, `Run` and `MIN`. A discipline equal to an existing lift label is rejected with "You already have one called that."

### 10.5 Offline sync correctness (§4.6)

**E5.1 · Overrides: Flush**
- **Defect:** when LWW drops a write, the device keeps its stale local value forever.
- **Rule:** upsert with `.select()`. Write every returned row back into Dexie. For any row sent but not returned, fetch it by id and overwrite the local copy.

**E5.2 · Overrides: Flush 4xx handling**
- **Defect:** one bad row fails the whole 100-row batch.
- **Rule:** on a 4xx batch error, retry by bisection down to single rows. Only the single failing row is marked `dead`.

**E5.3 · Overrides: Pull**
- **Defect:** `updated_at >` pagination skips rows that share a timestamp at a page edge.
- **Rule:** use keyset pagination on `(updated_at, id) > (last_ts, last_id)` with the 5 s overlap, ordered by `updated_at, id`.

**E5.4 · Overrides: Clock skew (and §2.10)**
- **Defect:** skew under 10 minutes still misorders LWW between two phones.
- **Rule:** always measure `offset = server_now − (t0 + rtt/2)` once per launch and always apply it. The 10-minute figure only controls whether "Phone clock is off" is logged to `meta`.

**E5.5 · Overrides: the §2.2 and §4.6 date and week rules**
- **Defect:** "local_date in profile tz" and "weeks in crew tz" disagree for anyone travelling.
- **Rule:**
  - `sessions.tz` is the **device** tz at session start, and `local_date` is computed in it.
  - `profiles.tz` is refreshed to the device tz on each launch. It is used only for pushes and quiet hours.
  - Credits belong to the crew week that contains the entry's **`local_date`**, compared as dates; instants are never converted.
  - Week starts are Mondays.

**E5.6 · Overrides: the §2.2 credit table, §4.3 `sessions.kind='min'`**
- **Defect:** a Floor MIN creates a `kind='min'` session, and the rules let it be counted as a 1-credit session.
- **Rule:** credits come only from these lines:

| Entry | Credit |
|---|---|
| `kind='min'` session | 0.5 per `min_entries` row; never the session credit |
| `kind in ('gym','run','martial')` with ≥1 non-warm-up entry | 1, whether or not `ended_at` is set |
| `mode='min'` gym session (Do MIN) | 1 |

- The daily cap is 2.0.

**E5.7 · Overrides: §4.7 cron, §6 Phase 3**
- **Defect:** week close is described both as an Edge Function `week-close` and as an SQL `close_week`.
- **Rule:**
  - It is one SQL function, `public.close_week(crew_id, week_start)`, called by `pg_cron`. Remove `functions/week-close` from the tree.
  - Credits are computed by SQL `public.week_credits(user_id, week_start)`, and `core/credits.ts` mirrors it.
  - Both are tested against the same `tests/fixtures/credits/*.json` (pgTAP **and** Vitest), so they can't drift.

**E5.8 · Overrides: §2.2 The Bar**
- **Defect:** a crew created midweek, or a member who just joined, takes a −1 plate for a partial week.
- **Rule:** the week a crew is created, and a new member's join week, can only give +1 or 0, never −1. A just-joined member is never REST in their join week.

**E5.9 · Overrides: §4.7 Web Push senders**
- **Defect:** offline sessions synced hours later fire "partner started" pushes.
- **Rule:** skip `partner_start` if `started_at` is more than 10 minutes before `received_at`.

**E5.10 · Overrides: the §2.6 "no push if the recipient already credited today" rule**
- **Defect:** the rule blocks the weekly recap and the spot push, which go to people who probably did train.
- **Rule:** the exemptions are `partner_pr`, `recap`, `spot` and `rest_alarm` (E9.1).

**E5.11 · Overrides: §6 Phase 3 `?debug=week`**
- **Rule:** it exists only when `import.meta.env.DEV` or `VITE_BACKEND=mock`. It is stripped from production.

### 10.6 Export contract fixes (§5)

**E6.1 · Overrides: the §5.7 sync rule ("since = last synced − 2 days")**
- **Defect:** S15 allows edits and date moves on any past day, so changes older than 2 days never reach the vault, and a fully deleted day can't be detected.
- **Rule:** the recommended vault sync is a **full pull without `since`, at most hourly, typically daily**.
  - Send `If-None-Match` with the last ETag; a 304 means nothing changed.
  - On 200, the agent **replaces its whole SPOTTER section**.
  - `since` stays available for previews only.

**E6.2 · The canonical "Copy for my AI" text.** It replaces §2.5, §5.7 and §8 step 9.3. `{URL}` = `VITE_SUPABASE_URL` + `/functions/v1/export`. `{HEADER}` = whichever header §1 recorded as working in `docs/EXPORT.md`. `{FMT}` = the user's `export_format`.

```
SPOTTER export for {display_name}: my own training data, read-only. Never anyone else's.
GET {URL}   optional: ?format=lines|json|csv (my default: {FMT}) · ?since=YYYY-MM-DD (inclusive, by local date)
Auth: {HEADER} <MY_TOKEN>. The token is in env var SPOTTER_TOKEN. Never put it in a URL, a note, a log or a commit.
Lines format: newest date first, one line per exercise per day, LF endings, separators " · " (U+00B7) and "×" (U+00D7):
- 2026-10-24 · Bench · 3×5×80kg · RPE 8 · felt strong
- 2026-10-23 · Bench · 1×5×80kg + 2×3×85kg · RPE 9      (count×reps×kg groups, joined " + ", in set order)
- 2026-10-24 · Pull-up · 3×8×BW
- 2026-10-24 · Dip · 3×10×BW+10kg
- 2026-10-24 · Run · 5.2km · 27:40
- 2026-10-24 · BJJ · 60m · RPE 7 · drilled guard
- 2026-10-24 · Weight · 78.4kg
- 2026-10-24 · MIN · 20m walk
Sync: at most hourly. Pull the full export with If-None-Match: <last ETag>. 304 = no change.
On 200, REPLACE my whole SPOTTER section (past days can be edited or deleted). Never append.
200 with empty body = no entries. 401 = bad or revoked token. 429 = over 60 calls/hour (respect Retry-After).
```

- E-10 asserts this text contains `{URL}` filled in and no match for `spx_[A-Za-z0-9_-]{43}`.

**E6.3 · Overrides: the §3.12 #3 and §7 banned-word CI grep**
- **Defect:** grepping `supabase/functions/**` for "failed" hits the required 500 body `export failed` and normal error code.
- **Rule:** grep only `src/ui/copy.ts` and a new `supabase/functions/_shared/push-copy.ts`, which holds all push titles and bodies. Every push string must come from that file.

**E6.4 · Overrides: §5.6 test**
- **Rule:** keep the fixture and the 16-line expected output unchanged; both were checked line by line and are correct.
- **Add U-X22** `exercise label "Run"/"Weight"/"MIN" rejected` (E4.9).
- **Add U-X23** `note with '×' is preserved; note with '·' becomes '-'`.

### 10.7 UI and interaction defects

**E7.1 · Overrides: §1.6 D15, §3.0 D5, §3.9.5, AC3.1, E-2**
- **Defect:** a sheet over the bottom 55% hides the kg/reps steppers, "Next exercise" and RACK IT during every rest. That is exactly when he adjusts the next set or wants to finish. And on a 375×667 screen, steppers plus RPE plus the bars can't fit in the bottom 40%.
- **Rule (S6 layout with the timer running):**
  - The **ring and digits render in the top read-only zone**, replacing the ghost and nudge area while running. The ring is 200px and the digits use `--t-mega`.
  - The **−15 / +15 / Skip** row (64px) sits **directly above LOG SET** and temporarily replaces the "Next exercise" / RACK IT row.
  - Long-pressing Skip for 600 ms finishes the session, so RACK IT is still reachable while resting.
  - The steppers stay visible and usable.
  - There is no glass sheet over the controls. Glass stays on the nav and the minimised pill.
- **Zones (E-2 and §9 #13):**
  - LOG SET, Undo, the timer controls, RACK IT and Next exercise must have their bounding-box top at ≥60% of viewport height.
  - Steppers and the RPE row must be at ≥40%.
  - Below 700px of viewport height, the RPE pill row folds into one 48px "RPE" chip that opens a bottom sheet.

**E7.2 · Overrides: §2 F7 volume PR, §3.7.2**
- **Defect:** a volume PR re-fires on every set once it has been passed.
- **Rule:**
  - Volume PRs are evaluated only at RACK IT and shown as a badge on S10, never as a takeover.
  - At most **one takeover per exercise per session**. Other PRs become toasts.
  - "Per screen open" means per foreground visit (`visibilitychange` visible → hidden).

**E7.3 · Overrides: §2 F13**
- **Defect:** readiness adds a tap to every START. That is friction the core loop can't afford.
- **Rule:** after 3 skips in a row, S5 stops appearing (`meta.readiness_auto_skip=true`), and Settings → Training gets "Quick check before sessions" (on/off) to bring it back.

**E7.4 · Overrides: §2.3 (scope)**
- **Defect:** v1 is over-scoped. The DOTS badge compares raw strength, which goes against §2.8's own fairness principle and needs shared bodyweight.
- **Rule:** move **F30 Seasons** and the **DOTS badge** to Stretch. F30 Duels stays in v1. The `share_dots` column stays, unused.

**E7.5 · Overrides: §2 AC12.3**
- **Defect:** "the earlier entry is soft-deleted and replaced" contradicts the uuidv5 upsert.
- **Rule:** saving a second weigh-in the same day overwrites the same row. The sheet shows "Replaces today's 78.6."

**E7.6 · Overrides: §2 AC1.1 / S3**
- **Defect:** `create_crew(name)` needs a crew name, but no screen asks for one.
- **Rule:** the default name is "Crew", editable later in S16 → Crew. S3 never asks.

**E7.7 · Overrides: §4.5 presence payload, AC15.2**
- **Defect:** "3/5" needs a planned set count, and nothing defines it.
- **Rule:**
  - Add `planned_sets` to the presence payload. It is the set count of that exercise in the last session, or the logged count if there is no history.
  - Add `last_active_at` to the §6 Phase 3 payload as well.

### 10.8 Added ideas (built after the tier they name; each gets acceptance criteria and tests in the Phase 7 mini-loop)

**E9.1 · Locked-screen rest alarm via self-push** (v1, first item in Phase 7, ⚠️)
- **Why:** the honest gap in a web timer is that it can't ring while the phone is locked. This closes it for installed PWAs with push turned on.
- **Client side:**
  - When `visibilitychange → hidden` fires while a timer runs, send `fetch('/functions/v1/rest-alarm', {method:'POST', keepalive:true, body:{alarm_id, ends_at}})` with the user's JWT.
  - On `visible` and on every LOG SET, upsert a new `alarm_id`, which cancels the old one.
- **Server side:**
  - Add the table `rest_alarms(user_id pk, alarm_id uuid, ends_at timestamptz)`.
  - The function returns immediately and keeps working in the background with `EdgeRuntime.waitUntil`. It sleeps until `ends_at`, then re-reads the row and sends a push to the caller's **own** subscriptions only if `alarm_id` still matches.
  - Title "SPOTTER", body "Bar's loaded.", `tag:'rest'`.
- **Exemptions:** the 3-a-day cap, quiet hours and the credited-today rule do not apply.
- **Limits:** rests longer than the free-tier wall-clock limit (≈150 s ⚠️) are not scheduled.
- **Fallback:** if the result can't be confirmed on [FRIEND]'s iPhone, leave the flag off and keep the onboarding line.
- **Copy change once it works:** "Install + notifications on = the timer can reach you on the lock screen."

**E9.2 · "PR within reach" cue** (v1)
- Before a set, `core/prs.ts` checks whether the prefilled kg × (reps + 1), or +2.5 kg at the same reps, would beat a best.
- If so, the ghost slot shows "1 more rep = PR" (molten outline, `--t-sm`). It never appears on warm-ups and never during comeback mode.
- Cheap, offline, and high motivation.

**E9.3 · Plate-math equivalents** (v1)
- S10, the story card and the recap translate totals into gym units from pure arithmetic. No invented facts.
- Examples: "11.4 t = 570 twenty-kilo plates"; "5.2 km = 13 laps of a 400 m track"; "60 min BJJ = 12 five-minute rounds".
- Shown for your own data, and for the crew only as a combined total.

**E9.4 · App badge for good news only** (v1, ⚠️ `navigator.setAppBadge`; iOS installed and notification-permitted only)
- The badge count = unseen partner PRs + unseen hype. It is cleared on Crew open.
- It never counts missed days, the outbox or anything you owe. That is a §3.12 ban.
- Feature-detect it, and do nothing if it is missing.