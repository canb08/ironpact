# SPOTTER device test

A numbered script for a person who is not a developer. Budget about 30 minutes on an iPhone. If you also have an Android phone, use the Android boxes; otherwise tick **no Android** and move on.

Do the phone steps in order. Leave every **Desk** step blank. The Lead fills those.

## Rules

- User-facing name on the phone is **SPOTTER**.
- Use Safari on iPhone. Do not use Chrome on iPhone. Use Chrome on Android.
- Use a nickname. No surnames.
- Do not write an email address, an invite code, or a token (`spx_…`) in this file, in a chat, or in a photo of the screen. A token is shown once. Put it only in a local secret named `SPOTTER_TOKEN`.
- Tick one box. If you tick fail, write one short reason on the note line.
- Buttons are named as they appear in the app.

## Before you start (2 min)

Write this in the results table, not here:

- Date
- iPhone model and iOS version (Settings → General → About)
- Android model and version, or "no Android"

You need the live SPOTTER address from the Lead. If you do not have it, stop.

A second phone, signed in as the other person in the same crew, is needed for the partner step and the push step. One phone can do the rest.

## Phone steps

### 1. Install, then open with no browser chrome (M-1)

**Verifies:** §7.5 M-1. Also the install walkthrough (Share → Add to Home Screen).

1. If SPOTTER is already on the home screen, leave it. Skip to "Open the icon" below.
2. Safari → the address from the Lead.
3. You should see **Add SPOTTER to your home screen**.
4. Tap Share (the square with the arrow) → **Add to Home Screen** → **Add**.
5. On Android Chrome: open the browser menu → **Install app** or **Add to Home screen**. If a button named **Install** is on the page, you may tap that instead. If the page says to use the browser menu, do that.

**Open the icon.** Do not open SPOTTER from the browser tab.

**You should see:** the app fills the screen. No address bar, no tab bar.

iPhone: ☐ pass ☐ fail
Android: ☐ pass ☐ fail ☐ no Android

Note:

### 2. First frame when the icon opens (startup image)

**Verifies:** startup image still open in `docs/PLATFORM-NOTES.md` (white launch flash).

Force-quit SPOTTER (see the force-quit note under step 5), then tap the home-screen icon again. Watch the first moment.

**You should see:** a dark screen, not a white flash, then SPOTTER. Write which one you actually saw.

iPhone: ☐ pass ☐ fail
Android: ☐ pass ☐ fail ☐ no Android

Note (dark or white):

### 3. Email code inside the installed app (M-2, OTP email)

**Verifies:** §7.5 M-2. R1 #3 (mail actually arrives). R1 #4 (the code is 6 digits, not 8).

Stay in the installed app from step 1. Do not sign in inside Safari.

1. Type the email the Lead gave you. Tap **Send code**.
2. Open Mail. Wait up to 2 minutes.
3. Count the digits in the code. It should be **6**.
4. Type them into SPOTTER. You should get past the code screen (crew setup, or the home screen with **START**).

If nothing arrives, stop tapping **Send code**. The built-in sender only allows about two messages an hour, and only to project-team addresses. Tick fail and write "no email".

iPhone: ☐ pass ☐ fail
Android: ☐ pass ☐ fail ☐ no Android

Digits you counted (number only):
In junk mail? yes / no:

### 4. Install from the invite link, then join (install from `/join`)

**Verifies:** R1 #5. Safari and the home-screen app do not share storage. The icon does not open on `/join/…`.

You need an invite link: `https://<the app>/join/<CODE>`. On a phone that already has a crew, the owner opens **Crew** → **Copy invite link**. The page says **Invite link copied.** The code is 10 characters, shown in the link. Do not write the code down in this file.

On the **joining** phone (a second phone, or this phone only if it is not already in a crew):

1. Open that link in **Safari** (Chrome on Android). You should see boxes for the code.
2. From **that** page: Share → **Add to Home Screen** → **Add**. On Android, use the Chrome install menu. If an old SPOTTER icon is already there, iOS will not make a second one. Do not delete an icon that already has training on it. Use the other phone, or tick fail and write "not run: icon already installed".
3. Close the browser completely.
4. Open SPOTTER from the **home-screen icon**.

**You should see:**

- No browser chrome (same as step 1).
- The icon does **not** open on the join page. A code you only saw in Safari is **not** filled in. That is expected. Type or paste the code yourself.
- After a nickname (no surname), a colour, and **Lock in**, you are in the crew.

iPhone: ☐ pass ☐ fail
Android: ☐ pass ☐ fail ☐ no Android

Was the code already filled in when you opened the icon? yes / no:

### 5. Storage still there after a force-quit

**Verifies:** R1 #7, the part you can see today. `navigator.storage.persist()` does not show a prompt on iPhone or Android Chrome. The installed app should keep what you already saved.

**Force-quit:**

- iPhone: swipe up and hold, then swipe the SPOTTER card up.
- Android: open recent apps, swipe SPOTTER away.

Open SPOTTER again from the **icon**. You should still be signed in. Nothing should have asked "keep data?" or shown a storage prompt.

iPhone: ☐ pass ☐ fail
Android: ☐ pass ☐ fail ☐ no Android

Did any storage prompt appear? yes / no:

### 6. Seven-day Safari wipe (do not wait)

**Verifies:** R1 #7, the part that takes 7 days. Safari can delete site data after 7 days without a visit. The home-screen app is supposed to be exempt. This session cannot prove that.

Tick **fail**. On the note line write: `not run: needs 7 days without opening SPOTTER in Safari`.

iPhone: ☐ pass ☐ fail
Android: ☐ pass ☐ fail ☐ no Android

Note:

### 7. Screen stays awake for a 3-minute rest (M-3, Wake Lock)

**Verifies:** §7.5 M-3. Wake Lock in the installed app. The fallback chip is **Screen may sleep.**

1. From the home screen, tap **START**.
2. If you see **How's the tank?**, tap **Skip**.
3. Pick any exercise (Bench is fine). Tap **LOG SET** once.
4. A rest timer appears, about **2:00**. Tap **+15s** four times so it reads about **3:00**.
5. Put the phone face up. Do not touch it until the timer ends. You should see **Bar's loaded.** when it hits zero.

**Pass:** the screen stayed on the whole 3 minutes, and you never saw **Screen may sleep.**

**Fail:** the screen dimmed or slept, or the chip **Screen may sleep.** showed. iOS older than 18.4 is expected to fail the native lock. Still tick fail and write the iOS version plus whether you saw the chip. Do not try to "fix" it.

iPhone: ☐ pass ☐ fail
Android: ☐ pass ☐ fail ☐ no Android

iOS version:
Saw **Screen may sleep.**? yes / no:

### 8. Timer flash, and sound with the silent switch (M-4, sound unlock)

**Verifies:** §7.5 M-4 sound half. `navigator.audioSession` type `playback` (still not verified on a device). Sound is off until you turn it on. The first tap unlocks sound.

1. Open **Settings** → **Feel** → turn **Sound** on.
2. Go back, tap **START** (or **Resume** if it offers the open session).
3. Log one set. Let the rest timer reach **zero**. Do not tap **Skip** for this step.
4. You should see a short flash at zero. With the ringer on, you should also hear a sound.
5. Flip the iPhone silent switch **on** (orange showing). Log another set. Wait for zero again.

**Pass:** a flash both times, and a sound when the ringer was on. Write yes or no for sound with the silent switch on. A "no" there does not by itself fail the step.

**Fail:** no flash, or no sound even with the ringer on.

Android has no silent switch. Pass if the flash happens and a sound plays while **Sound** is on. Then turn **Sound** off and log one more set: you should see the flash and hear nothing.

iPhone: ☐ pass ☐ fail
Android: ☐ pass ☐ fail ☐ no Android

Sound with the iPhone silent switch on? yes / no:

### 9. Haptics flag stays off on iPhone

**Verifies:** the iOS checkbox-switch haptic flag (`VITE_IOS_HAPTICS` / `iosHapticsTrick`). It ships **off** until a device proves it. Android uses vibration only. §7.5 M-4 vibration half.

1. **Settings** → **Feel**. Leave **Haptics** on.
2. Log one set.

**iPhone pass:** you feel **no** tick. A tick means the flag is on when it must be off. Tick fail and write "felt a tick".

**Android pass:** one short buzz on **LOG SET**. No buzz = fail.

iPhone: ☐ pass ☐ fail
Android: ☐ pass ☐ fail ☐ no Android

iPhone tick? yes / no:
Android buzz? yes / no:

### 10. Airplane mode, 20 sets, kill, reopen (M-5, 20-set flight)

**Verifies:** §7.5 M-5 (the table says 5 sets; this session logs **20**, which is the flight in §9 item 16 and Phase 1). Offline outbox. No duplicates.

1. Turn on airplane mode. You should see **Saved on your phone. Syncs when you're back up.** at the top.
2. Tap **START**. If a session is already open, tap **Resume**.
3. Pick one exercise. Tap **LOG SET** until the header says **20 sets**. Tap **Skip** on each rest so you do not wait. Do not hold **RACK IT**.
4. Each row has a check mark. While offline it is the quieter colour. Its name is **On phone**.
5. Force-quit SPOTTER (step 5) while airplane mode is still on.
6. Turn airplane mode off. Open SPOTTER from the icon. Tap **START**, then **Resume** if it asks.
7. Wait up to 30 seconds. The header should still say **20 sets**, not 19 and not 40. The check marks should become **Synced**.

**Pass:** exactly 20, zero extras.
**Fail:** any other count, a duplicate block, or rows that never leave **On phone**.

iPhone: ☐ pass ☐ fail
Android: ☐ pass ☐ fail ☐ no Android

Count before kill:
Count after sync:

### 11. The other phone shows the set within 3 seconds (M-7)

**Verifies:** §7.5 M-7.

You need the other person in your crew, with SPOTTER open on **Crew**.

1. On your phone, with signal, log one new set (not a warm-up).
2. On their phone, look at **Crew**.

**Pass:** that set is visible within 3 seconds.
**Fail:** it takes longer, it never appears, or you have only one phone. If you have only one phone, tick fail and write `not run: one phone`.

iPhone: ☐ pass ☐ fail
Android: ☐ pass ☐ fail ☐ no Android

Seconds you counted:

### 12. Push, from a tap, and quiet hours (M-6)

**Verifies:** §7.5 M-6. R1 #12 on the phone (iOS push only from the installed app, iOS 16.4+, permission from a tap).

1. Installed app → **Settings** → **Notifications**.
2. Read the line under the heading.

This build shows **Saved here. Alerts are not sent yet.** There is no control that asks iOS or Android for notification permission.

**Pass only if all of these happened:**

- You tapped a real Enable (or the same kind of button), and the phone asked for notification permission.
- A nudge arrived on the installed app while the clock was outside quiet hours. Quiet hours are **Quiet from** 22:00 to **Quiet until** 08:00 unless you changed them.
- A nudge did **not** arrive during those quiet hours.

**Otherwise tick fail.** If you saw **Saved here. Alerts are not sent yet.**, write that sentence. Do not treat a saved toggle as a delivered nudge.

iPhone: ☐ pass ☐ fail
Android: ☐ pass ☐ fail ☐ no Android

Sentence you saw:
Clock time:

### 13. Export curl returns only your rows (M-8)

**Verifies:** §7.5 M-8. Export curl. Your token reads only your data.

On the phone: **Settings** → **Vault export**.

1. Set **Export format** to **Lines**.
2. Label the token `phone-test`. Tap **Generate token**.
3. Copy the token into the computer secret `SPOTTER_TOKEN`. It starts with `spx_`. It is shown once. Do not paste it into this file.
4. Tap **Copy export URL**. That is `EXPORT_URL` below. Do not put the token in the URL.

On a computer, in a terminal (the `$` variables stay on that machine):

```bash
curl -sf -D - -H "Authorization: Bearer $SPOTTER_TOKEN" "$EXPORT_URL?since=2026-01-01"
```

**You should see:** your own lines, including today's sets, and nothing that belongs to the other person. Status 200.

If that returns 401, run one more command and stop. Do not try other headers.

```bash
curl -sf -D - -H "X-Export-Token: $SPOTTER_TOKEN" "$EXPORT_URL?since=2026-01-01"
```

**Pass:** one of those two commands returned only your rows.
**Fail:** 401 on both, someone else's training in the body, or the token appeared in a URL.

iPhone (you generated the token here): ☐ pass ☐ fail
Android: ☐ pass ☐ fail ☐ no Android

Which header worked? Authorization / X-Export-Token / neither:
About how many lines came back (number only):

When you are done, you may **Revoke** that token in **Vault export**.

### 14. Share a story card, or download it (M-9)

**Verifies:** §7.5 M-9. Web Share with a file, or the download fallback.

Look through the home screen, a finished session, and **Progress** for a control that shares an image card.

**Pass:** the share sheet opens with a file, or a file downloads.
**Fail:** there is no such control. Write `no story share in this build`. Do not invent a share.

iPhone: ☐ pass ☐ fail
Android: ☐ pass ☐ fail ☐ no Android

Note:

### 15. Text at the largest size, set rows still readable (M-10)

**Verifies:** §7.5 M-10. 200% text. Set rows must not be clipped.

iPhone, in the **iOS Settings app** (not inside SPOTTER): Accessibility → Display & Text Size → Larger Text → turn on **Larger Accessibility Sizes** → drag the slider to the far right.

Android: Settings → Display → Font size → largest. If a Display size slider exists, set that to the largest too.

Open SPOTTER, resume the session from step 10, and look at a set row (the line with reps and kg).

**Pass:** the reps and the weight are fully visible. Wrapping onto a second line is fine.
**Fail:** the text is cut off, or you must scroll sideways to read the row.

Put the iPhone slider back to your normal size when you finish.

iPhone: ☐ pass ☐ fail
Android: ☐ pass ☐ fail ☐ no Android

Note:

## Desk steps

Not part of the 30 minutes. The person with the phone leaves these blank. The Lead ticks them from the repo and from `docs/PLATFORM-NOTES.md` / `docs/research/R1-platform.md`. Do not pause a live Supabase project to answer them.

### 16. Custom mail, not a free Gmail sender (R1 #3 remainder)

**Verifies:** R1 #3 Brevo / DMARC half. Built-in Supabase mail only reaches org members and is capped at about two per hour.

**Pass:** the code in step 3 arrived from a domain the project owns (DKIM and DMARC), not from a `@gmail.com` From and not from a rewritten free-domain sender.
**Fail:** it did not, or nobody has checked the sender yet. Write which.

☐ pass ☐ fail

Note (domain only, no address):

### 17. OTP length field name (R1 #4 remainder)

**Verifies:** the dashboard label for OTP length. The phone already counted digits in step 3.

**Pass:** the hosted project is 6 digits and 600 seconds. Write the label you actually saw if it is not "Email OTP Length".
**Fail:** the length is not 6, or the expiry is not 600.

☐ pass ☐ fail

Label you saw:

### 18. Free-project pause and the Actions schedule (R1 #9)

**Verifies:** R1 #9, still PARTIAL. A free project pauses after about 7 days without enough database use. An Edge Function ping is not documented as enough. The 60-day schedule disable is documented for **public** repos. This repo is private; the monthly heartbeat stays only as a guard.

**Pass:** `docs/PLATFORM-NOTES.md` still says that, and nobody turned off the guard.
**Fail:** the only keep-alive is an Edge ping, or the note was dropped.

☐ pass ☐ fail

Note:

### 19. pgTAP on GitHub Actions (R1 #10)

**Verifies:** R1 #10, still PARTIAL. R1 asked for `supabase/setup-cli@v3`, then a local stack and `supabase test db` on `ubuntu-latest`.

**Pass:** the `db` job in `.github/workflows/ci.yml` still uses `supabase/setup-cli@v3` with CLI `2.122.0`, runs `supabase test db`, and runs `supabase start` for the function tests.
**Fail:** it uses `@v1`, or the database tests are gone.

☐ pass ☐ fail

Note:

### 20. Push library on the server (R1 #12 remainder)

**Verifies:** R1 #12, the Deno half. The phone half is step 12. Do not import `npm:web-push` in an Edge Function. The recorded fallback is `jsr:@negrel/webpush`.

**Pass:** no function imports `npm:web-push`.
**Fail:** one does, or a live send was claimed without a device receipt.

☐ pass ☐ fail

Note:

### 21. DOTS badge stays off (R1 #13)

**Verifies:** R1 #13, still PARTIAL. Do not invent scores. The badge stays off until the source publishes three (bodyweight, total, points) rows.

**Pass:** no screen shows a calculated DOTS score. The Settings switch **Share DOTS**, left off, is not a score.
**Fail:** a DOTS number is on screen.

☐ pass ☐ fail

Note:

## Send these results to the Lead

Copy the table below into a message to the Lead. Do not attach a screenshot that shows a token, an email, or an invite code. The Lead writes the device results into `docs/PLATFORM-NOTES.md`. You do not edit that file.

| Step | Spec / open item | iPhone | Android | Note |
|---|---|---|---|---|
| 1 | M-1 install, standalone | | | |
| 2 | Startup image (no white flash) | | | |
| 3 | M-2, R1 #3 mail, R1 #4 six-digit OTP | | | |
| 4 | Install from `/join`, R1 #5 | | | |
| 5 | R1 #7 storage after force-quit | | | |
| 6 | R1 #7 seven-day Safari wipe | | | |
| 7 | M-3 Wake Lock | | | |
| 8 | M-4 sound unlock, silent switch | | | |
| 9 | Haptics flag off; Android vibrate | | | |
| 10 | M-5 and the 20-set flight | | | |
| 11 | M-7 partner set within 3 s | | | |
| 12 | M-6 push and quiet hours, R1 #12 phone | | | |
| 13 | M-8 export curl | | | |
| 14 | M-9 Web Share file or download | | | |
| 15 | M-10 text size, set rows | | | |
| 16 | R1 #3 sender domain (Desk) | Lead | — | |
| 17 | R1 #4 OTP field label (Desk) | Lead | — | |
| 18 | R1 #9 pause and cron (Desk) | Lead | — | |
| 19 | R1 #10 pgTAP CI (Desk) | Lead | — | |
| 20 | R1 #12 Deno web-push (Desk) | Lead | — | |
| 21 | R1 #13 DOTS (Desk) | Lead | — | |

## Coverage

Every §7.5 row and every R1 verdict that is still PARTIAL, plus every `docs/PLATFORM-NOTES.md` line that says the device is still unchecked.

| Item | Where |
|---|---|
| M-1 Install, standalone, no browser UI | Step 1 |
| M-2 6-digit code inside the installed app | Step 3 |
| M-3 Wake Lock, 3-minute rest, or the sleep chip | Step 7 |
| M-4 Flash always; sound with the silent switch; Android vibration | Steps 8 and 9 |
| M-5 Airplane mode, kill, reopen, exact rows | Step 10 (20 sets, stricter than the table's 5) |
| M-6 Push from a tap; quiet hours | Step 12 |
| M-7 Partner set within 3 s | Step 11 |
| M-8 curl export, own rows only | Step 13 |
| M-9 Web Share file, or download | Step 14 |
| M-10 200% text, set rows not clipped | Step 15 |
| Wake Lock (ticket, §3.13, R1 #6 device check) | Step 7 |
| Install from `/join` (ticket, R1 #5) | Step 4 |
| Storage persistence (ticket, R1 #7) | Steps 5 and 6 |
| Offline 20-set flight (ticket, §9 item 16) | Step 10 |
| OTP email (ticket, R1 #3, R1 #4) | Steps 3, 16, 17 |
| Export curl (ticket) | Step 13 |
| Sound unlock / `audioSession` (ticket, §3.13, PLATFORM-NOTES) | Step 8 |
| Haptics flag (ticket, §3.13, PLATFORM-NOTES) | Step 9 |
| Startup image and install APIs (PLATFORM-NOTES, still unverified) | Steps 1 and 2 |
| R1 #9 free-project pause, Actions cron | Step 18 |
| R1 #10 pgTAP on `ubuntu-latest` | Step 19 |
| R1 #12 Web Push on iOS, and `npm:web-push` on Deno | Steps 12 and 20 |
| R1 #13 DOTS scores | Step 21 |

R1 rows 1, 2, 6, 8 and 11 are verdict **WORKS** with a written source. They are not open. Row 6 still needs the phone, so it is step 7. §3.13 contrast, oklch and the font package name are already recorded in `docs/PLATFORM-NOTES.md`; they are not phone steps.
