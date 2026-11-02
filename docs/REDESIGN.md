# SPOTTER redesign (R2) — direction for every X-ticket

**Status:** owner-requested full UI rework, 2026-11-02 (decision **L19**). This file **supersedes `docs/SPEC.md` §3 (look, layout, copy) and the screen layouts in §2**. Product rules (credits, MIN, PRs, sync, privacy, export) are unchanged. Read `docs/UX-AUDIT.md` for the findings each ticket closes.

## 1. Who and what
Two friends, mid-workout, phone in one hand, chalk on the other. The app does three jobs, in this order:
1. **Log a set in two taps** without thinking.
2. **See if we're both on track this week** at a glance.
3. **See progress** on a lift over months.

Everything else (export, tokens, plates, quiet hours) is a setting, not a screen.

## 2. Concept: "the shared bar"
The training week is one barbell **you load together**. Each session either of you logs adds a plate to your side. The bar is full when you both hit your target. This is the **one memorable element** of the app. It lives on Today and nowhere else. Everything around it is quiet and disciplined.

Plates use the **competition plate colours** lifters already know (25 kg red, 20 kg blue, 15 kg yellow, 10 kg green, 5 kg white). That gives the app a palette from its own world, not an "accent colour".

```
Today
┌───────────────────────────────┐
│ Mon 2 Nov            ⚙        │  header: date left, settings right
│                               │
│  Can            Eytan         │
│  ▌▌▌ ═══════════════ ▌▌      │  ← the shared bar: your plates left,
│  2 of 3          1 of 3       │    partner's right; MINs = thin plates
│                               │
│  ┌ Start workout ───────────┐ │  primary action, full width
│  └──────────────────────────┘ │
│  Run   Fight   Weigh-in   MIN │  secondary quick logs, icon + word
│                               │
│  Last workout · Sat           │  quiet list: last session, partner's
│  Bench 5 × 90 kg   PR         │  latest, this week's PRs
│  Eytan · Sun · Squat 5 × 120  │
├───────────────────────────────┤
│ Today  Train  Progress  Crew  │  tab bar, always visible except mid-set
└───────────────────────────────┘
```

## 3. Tokens (`src/ui/tokens.css`, ticket X1)
| Name | Hex | Use |
|---|---|---|
| Rubber | `#1E1F22` | app background (gym floor), dark theme |
| Rubber raised | `#2A2C30` | sheets, dock, tab bar |
| Chalk | `#EDEBE6` | primary text on dark; the light-theme background |
| Steel | `#8C9199` | secondary text, dividers, inactive tabs |
| Plate red | `#D3263A` | **you**: your plates, your line on charts |
| Plate blue | `#2563C9` | **partner**: their plates, their line |
| Plate yellow | `#F2C230` | PRs only (badge, PR row, takeover) |
| Plate green | `#2F9E5B` | success / synced / done |

- The light theme swaps Rubber and Chalk. Plate colours stay as they are (contrast-checked in `tokens.contrast.test.ts`, AA for text).
- **No** acid green, **no** grain overlay, **no** glass except the tab bar. Radii: 14 for sheets/buttons, 8 for chips. Plates are drawn square-ish (they're plates).
- Spacing: 4-pt scale (4, 8, 12, 16, 24, 32, 48).

## 4. Type
- **Big Shoulders** (already self-hosted): numbers only (kg, reps, timer, week count). Large: 56 / 40 / 28.
- **Inter Tight** (already self-hosted): everything else. 17 body, 15 secondary, 13 caption, 22/28 titles, weights 400/600.
- **Drop JetBrains Mono** (removes bytes and the "dev tool" look). No ALL-CAPS labels, no letter-spaced eyebrows, no "A · B · C" strings: use real words ("2 of 3 this week").
- Sentence case everywhere. Buttons say what happens: "Start workout", "Log set", "Finish workout", "Save weigh-in".

## 5. Information architecture (ticket X2)
| Tab | Route | What |
|---|---|---|
| Today | `/` | Shared bar, Start workout, quick logs, latest activity |
| Train | `/session` | Active workout, or the picker to start one. The tab shows a live dot while a workout runs |
| Progress | `/progress` → `/exercise/:id`, `/day/:date` | Lifts / Cardio / Fight / Body, with history |
| Crew | `/crew` | Partner's week, their latest sessions, shared totals, invite |
| ⚙ (header) | `/settings` | Grouped settings sub-pages |

- Detail routes get a header with a back chevron and title.
- The tab bar hides while the set-input dock is focused (keyboard up) and during the PR takeover.
- Quick logs (`/log/:kind`) stay bottom sheets over the current tab.

## 6. Screen notes (the X-tickets own the details)
- **Train (X4):** START → picker (recent first, search on top) → exercise screen: full-height set list grouped by exercise; a bottom **dock** with kg and reps steppers (big Big Shoulders numerals), "Log set", RPE behind "Add RPE"; the rest timer as one slim bar above the dock (tap to expand, ±15 s). Header: elapsed time + "Finish" (hold 600 ms). Summary: per-exercise list, PRs in yellow, total volume in kg, "Done" → Today.
- **Progress (X5):** segmented control Lifts/Cardio/Fight/Body; list of exercises with a sparkline + best; exercise detail = chart (you red, partner blue toggle), PR list, history by day, a collapsed "Rep-max table", and settings in a ⋯ sheet.
- **Day editor (X6):** week strip (Mon–Sun chips), the session header, set rows (tap → edit sheet), "Delete workout" at the bottom (hold).
- **Crew (X7):** partner hero (their name, plates this week, last workout), "You two this month" totals, a feed of both, Invite. Leave crew → Settings.
- **Settings (X8):** grouped list → sub-pages; hide unbuilt notifications.
- **Onboarding (X9):** install gate → sign-in → **name + colour + weekly target** → crew create/join → a 3-card explainer (sessions & MIN, the shared bar, PRs after 2 sessions).

## 7. Motion
One orchestrated moment only: **a plate sliding onto the bar** on Today after a session/MIN (and on the partner's side on next open = the shockwave). Everything else answers a tap: set row slide-in, sheet open, PR row flash yellow once. Respect reduced motion (no slide, instant).

## 8. Words (ticket X10 sweep; every ticket follows it)
| Old | New |
|---|---|
| Floor | Today |
| RACK IT / Hold to rack it | Finish workout (hold) |
| Locked in. | Saved |
| Baseline set. | First sessions set your baseline. PRs start after 2. |
| IRON · PLATES | Volume · kg |
| Weight (quick log) | Weigh-in |
| Martial arts | Fight |
| e1RM | Estimated 1-rep max (e1RM) |
| Tonnes 0.9 | 900 kg moved |
| Athlete | the person's name |
| 2026-11-02 | Today / Yesterday / Mon 2 Nov |

## 9. Quality floor (every ticket)
375 px with no horizontal scroll · 44 px targets · visible focus · AA contrast · reduced motion · initial JS ≤170 kB (fonts precached, not in JS) · no new runtime deps without a decision · e2e specs updated for new labels/routes in the same PR.
