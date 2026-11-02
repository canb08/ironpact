# SPOTTER feel layer (R3): logging should feel like training, not like a calculator

**Status:** requested by the friend/co-owner (Eytan) on 2026-11-02, decision **L20**. R3 sits **on top of R2**: `docs/REDESIGN.md` still owns layout, IA, tokens, type and words. This file owns **how things move, sound, buzz and respond to touch**. It **replaces REDESIGN §7** ("one orchestrated moment only"). Where the two disagree on interaction or motion, this file wins. On everything else, REDESIGN wins.

## 1. The idea in one line
**Every input is a physical object from the gym.** You load plates, you don't type numbers. You ring a bell, you don't fill in "rounds". A logged set lands on the bar with weight. The calculator vanishes; the gym stays.

## 2. Five laws (every Y-ticket, every review)
1. **No keypad on the hot path.** Logging a set, a run or a Muay Thai session never opens the number keyboard. Use dials, plates, taps and "same again". The keyboard is the fallback, one tap away, for odd values.
2. **One thumb, no look.** Every hot-path control sits in the bottom 40% of a 375×812 screen, is ≥56 px tall, and confirms itself by feel: haptic plus sound plus motion. You should be able to log a set without reading the screen.
3. **Everything has weight.** Motion uses the spring tokens (`src/ui/motion/springs.ts`), never linear or ease-in-out tweens. Heavier things move slower: a 100 kg set lands harder than a 20 kg one, and plates overshoot and settle.
4. **Feedback is earned, not sprayed.** Small actions get a tick. A logged set gets a clank. A PR gets the full moment. A finished week gets the bar locking out. Never celebrate a tap that did nothing.
5. **Respect the room.** Reduced motion → instant states plus the haptic. Sound follows the existing `sound_on` setting (schema default unchanged; X9 onboarding may offer it). Battery saver → no particles. Nothing blocks input while it plays.

## 3. The feel kernel (ticket Y1, everything else uses it)
One call: `feel(kind, { weightKg? })`. It fires the matching haptic, sound and visual pulse together. No component calls `navigator.vibrate` or the audio APIs directly.

| kind | Haptic | Sound (synthesised with WebAudio, no files) | Visual |
|---|---|---|---|
| `tick` | 8 ms | none | none (dial detents, plate taps) |
| `set` | 20 ms, longer for heavier sets | plate clank: two damped metal partials, pitch drops with weight | dock edge flashes your plate colour |
| `plate` | 15 + 15 ms | lighter clank | plate slides onto the Today bar |
| `round` | 3 × 40 ms | boxing bell: inharmonic partials, 1.8 s decay | ring pulse |
| `pr` | 30-60-90 ms pattern | bell plus a low hit | the PR takeover |
| `lockout` | long 120 ms | bar slam | Today bar flexes and locks: the week is complete for both of you |
| `error` | 2 × 10 ms | dull thud | a 6 px shake (no shake under reduced motion) |

- Build on what exists: `src/platform/haptics.ts` (patterns + the iOS `switch` trick behind `VITE_IOS_HAPTICS`) and `src/platform/audio.ts` (synth cues `clank`, `bell`, `plate`, `pr-riser`, ...). Y1 adds the missing cues/patterns and weight scaling; it does not replace them.
- iOS haptics: Y1 turns the `switch` trick **on by default**; the friend verifies it on his iPhone from the PR preview (one line in `## Questions`). If it misbehaves, it goes back behind the flag.

## 4. Signature interactions (one ticket each)
### Load the bar: the set dock (Y3, after X4)
- **Kg = plates, not digits.** Under the kg number sits a mini barbell. You tap plate chips (25 / 20 / 15 / 10 / 5 / 2.5 / 1.25, competition colours). Each tap adds a **pair** of plates, they slide onto both sleeves, and you get a `tick`. Long-press a plate to take it off. The bar weight comes from the existing plate-calc settings.
- **Scrub to fine-tune:** dragging the kg or reps numeral up or down moves it by one step per detent (`ScrubDial`), with a `tick` on each step. A fast flick moves faster. Arrow keys work and the role is `slider`, so it stays accessible.
- **Same again:** the dock opens pre-loaded with the last set, or with this exercise's matching set from last session, shown as a ghost row in the set list. One big tap on "Log set" logs it. **A typical straight set is one tap.**
- Logging plays `feel('set', {weightKg})`. The ghost row solidifies, and the next ghost row appears below it.
- Swipe a logged set right = repeat it. Swipe left = edit sheet.

### Rest is a ritual (Y4, after X4)
- The slim rest bar fills in your plate colour. At 10 s left you get a `tick`; at 0 you get a `round` haptic, a soft bell, and the dock pulses: "Next set".
- Swipe the rest bar up for a full-screen rest view: a huge countdown, the next set's ghost row, and ±15 s targets the size of half the screen.

### Muay Thai: the pad class, run by the app (Y2, after X3)
**How the class actually works** (the friend, 2026-11-02; both users are beginners, no sparring yet):
1. **Warm-up** 10-15 min (stretching).
2. **Half 1: punches** (body shots allowed, belly pad on). Partners pair up: one wears **gloves** (striker), the other **pads** (holder). The coach shows a combo; the striker throws it **non-stop for 3:00**. Then the striker does **10 push-ups** while the holder does **10 squats**. That repeats for **3 combos**. Then they **swap gear**, and the other partner strikes the same 3 combos.
3. **Rest 2:00.**
4. **Half 2: kicks** (mixed, mostly kick-oriented; **long pads** fingers-to-elbow plus the belly pad). Same structure: 3 combos × 3:00 + push-ups/squats, swap, 3 combos.
5. Done. Per person per class: **6 striking rounds** (18 min of striking), **6 holding rounds**, 60 push-ups, 60 squats.

**What the app does with it: log it after class, in two taps** (owner correction, 2026-11-02: nobody touches a phone during class, because their hands are full)
- No live timer and no in-class screens. You log the class **after** it ends, quickly.
- The Muay Thai sheet opens on one **Pad class** card that already describes the usual class: 2 halves (punches, kicks) × 3 combos × 3:00 → **6 rounds struck, 6 held, ~60 min, 60 push-ups + 60 squats**, focus `Pads`. One big **Log class** button saves it → `feel('plate')` → the together prompt (Proof). **Two taps from Today.**
- **Adjust** (a quiet expander) for the odd class: combos per half (2-4), round length (2/3/5 min chips), total minutes. Rounds struck = 2 × combos.
- **Optional, never blocking:**
  - "How did it feel?" 1-5 chips (stored as RPE only if the schema has it).
  - "Combos you remember": strike chips `1` jab, `2` cross, `3` lead hook, `4` rear hook, `5` lead upper, `6` rear upper, `Teep`, `L kick`, `R kick`, `Knee`, `Elbow`. They build "1-2-R kick" into the note.
- **Same as last class** chip. Focus chips for non-class days: Pads (default) · Bag · Clinch · Technique · Conditioning. **No sparring** while they're beginners. **Muay Thai is the only discipline.**
- **Storage (no data change):** `discipline: 'Muay Thai'`, `minutes`, `rounds` = rounds struck, `note` (≤120 chars) = `Pads · 1-2-3 / L kick-2 / …`, truncated at a combo boundary.
- **Combo book:** Progress → Muay Thai lists every combo you've noted, newest first, with how often it came up.

### Runs that feel like running (Y6, after X3)
- Distance and duration are `ScrubDial`s: 0.1 km detents, with flicks that accelerate. The pace updates live in big numerals while you scrub ("5:12 /km").
- **Same as last run** chip; a **Live run** mode (start/stop timer, Wake Lock, no GPS) that fills in the duration.

### Motion pass (Y5, after X3–X7 merge, before X11)
- **Tabs:** a directional slide via the View Transitions API (`src/ui/motion/viewTransition.ts`). Today → Train slides left, back slides right.
- **List → detail:** the exercise row's name and sparkline morph into the detail header and chart (shared `view-transition-name`).
- **Sheets:** spring up with overshoot. Drag-to-dismiss follows the finger, with velocity.
- **Numbers:** every total uses `AnimatedNumber` (it rolls, it doesn't swap).
- **The bar on Today:** plates drop with weight. On a completed week the bar **flexes and locks out** (`lockout`). Swipe the bar left or right to see past weeks; each week's plates are restacked on the bar.
- **PR takeover:** the bar bends in proportion to the PR weight, chalk dust bursts from the plates (a canvas, lazy chunk, ≤4 kB, skipped under battery saver and reduced motion), and the yellow plate slams.
- **Partner shockwave:** on open, the partner's new plates drop onto their side one by one, each with a `plate` feel.

### Proof: the shared photo log (Y8 data, Y9 screens)
**Idea (the friend's):** every workout you two do together ends with a photo. The app keeps those photos as a wall of cards, so you can scroll back through months of training together. Named **Proof** ("pics or it didn't happen"); it's a 5th tab.

**After any workout** (lift summary "Done", run saved, Muay Thai saved):
1. A sheet asks "**Trained together?**": **With Can** / **Solo**. Muay Thai pad class defaults to "With Can", because pads always need a partner. "With Can" links your entry and the partner's entry for that day of the same kind (if they've logged it) into one card.
2. "**Add a photo**": **Take photo** (opens the camera) / **Choose photo** / **Skip**. Skipping is fine; the card still appears with a designed placeholder.
3. The photo is resized on the phone (longest side 1600 px, JPEG about 80%, ≤400 kB), and **re-encoding strips the location data**. It's stored on the phone first and uploads when you're back online, the same way sets do.

**The Proof tab:**
- A 2-column grid of **portrait cards** grouped by month ("November · 9 together"). Each card shows the **photo full-bleed**, the date ("Tue 3 Nov"), the workout chip ("Muay Thai · pads · 6 rounds", "Push · 4.2 t", "Run · 5.1 km · 26:40"), both avatar dots if you trained together, and a yellow PR badge if a PR happened.
- Without a photo, the card shows the workout's plates on the bar in plate colours, so it still looks deliberate.
- Tap a card → full screen. Swipe between cards, and see the workout details underneath: sets, combos, pace. You can **Replace photo**, **Remove photo** or **Add caption** (≤80 chars). Either crew member can add a photo to a together card, up to 2 photos per card (one each).
- At the top: "**23 sessions together**" plus your longest together streak in weeks.
- The partner shockwave applies here too: when the partner adds a photo, their card slides in on your next open.
- **Privacy:** photos are visible to your crew only (private storage, crew-scoped access rules, short-lived links). Removing a photo deletes the file. The vault export gets a photos folder later (not in Y8/Y9).

### Voice log (Y7, experimental, after Y3)
- Hold the mic in the dock and say "ninety by five" or "same again". A pure parser in `src/core/voice.ts`, with tests, turns the speech into a set and fills a ghost row; a tap confirms. It's feature-detected (`SpeechRecognition` / `webkitSpeechRecognition`) and hidden where unsupported. Lazy chunk.

## 5. Budgets (same as R2)
- Initial JS ≤170 kB. Particles, voice and round-mode screens are lazy chunks.
- **No new runtime dependencies.** Springs come from `springs.ts`, transitions from the View Transitions API, sound from WebAudio, particles from a hand-rolled canvas.
- 60 fps on a Pixel 7: animate only `transform` and `opacity`, and never animate layout.
- Every Y-ticket attaches **375×812 screenshots plus one screen recording or GIF** of its signature interaction to the PR. The Lead reviews the motion, not just the stills.

## 6. Ticket map
| ID | What | Starts after | Engine |
|---|---|---|---|
| Y1 | Feel kernel: `feel()`, synth sounds, iOS haptic, `ScrubDial`, CSS spring easings | now | Grok |
| Y2 | Muay Thai only: after-class 'Log class' card (2 taps), adjust, combos you remember, combo book | X3 + Y1 merged | Grok |
| Y3 | Load the bar: plate taps, scrub dials, same again, swipe rows | X4 merged, Y1 | Codex |
| Y4 | Rest ritual + full-screen rest | Y3 | Grok |
| Y5 | Motion pass: tabs, list→detail, sheets, bar lockout, PR takeover, shockwave | X3–X7 merged, Y1 | Codex |
| Y6 | Runs: dials, live pace, same as last run, live run | X3 merged, Y1 | Grok |
| Y7 | Voice log (experimental) | Y3 | Grok (parser + UI only) |
| Y8 | Proof data: together links, photo storage + access rules, offline upload queue | Codex free + lane C ack (shared data contract, L21) | Codex |
| Y9 | Proof screens: together/photo prompt after every workout, Proof tab, card viewer | Y8 + Y2 merged | Codex or Grok (no data files) |
