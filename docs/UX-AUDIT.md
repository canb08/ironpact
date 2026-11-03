# UX audit — first real use (2026-11-02)

Original audit: Lead (owner's Claude) clicked through every route at 375×812 on the mock backend, after the owner's first production use on iPhone. Each item has an ID, a severity and the ticket that fixes it. **P0** = blocks use · **P1** = confusing or broken · **P2** = polish.

The short version: the parts work (offline sync, PR checks, export, ~720 tests), but there is **no product shell**. There's no navigation, so half the screens can't be reached. The labels describe how the system is built, not what the user is doing. The visuals are the generic "dark + acid accent + mono labels" look.

## Navigation and structure

| ID | Sev | Where | Finding | Fix → ticket |
|---|---|---|---|---|
| A1 | P0 | whole app | No tab bar or nav. `/progress`, `/exercise/:id` and `/day/:date` are linked from nowhere on the Floor, so the owner saw "one screen". | Bottom tab bar Today · Train · Progress · Crew, plus Settings in the header → **X2**  Fixed: #66 |
| A2 | P0 | `/session` after finishing | After **Done** on the summary, the app stays on `/session` showing "Session racked. START". It's a dead end with no way home. | Done → Today, with the finished session highlighted → **X4**  Fixed: #67 |
| A3 | P1 | `/progress`, `/exercise/:id`, `/day/:date`, `/crew`, `/settings` | No back affordance and no header. The only way out is the browser/OS back gesture (none in an installed iOS app). | Shell header with back on detail screens → **X2**  Fixed: #66 |
| A4 | P1 | iPhone home-screen app | A fresh device where the user already has a crew gets stuck on `/crew/new` ("You're already in."). | **H10** (running)  Fixed: #64 |

## Today (Floor, `/`)

| ID | Sev | Finding | Fix → ticket |
|---|---|---|---|
| F1 | P0 | Quick-log row "Run · Martial arts · Weight · MIN". **"Weight" is a bodyweight weigh-in**, but every lifter reads it as "log weights". Lifting is hidden behind START. | Rename and regroup: primary **Start workout** · secondary **Run · Fight · Weigh-in · MIN** → **X3**  Fixed: #68 |
| F2 | P1 | The same week ring is shown 3× (My week, Partner, Crew card), and "Athlete" is repeated 4× in the first viewport. | One duo week visual (see REDESIGN §4) → **X3**  Fixed: #68 |
| F3 | P1 | Everyone is named "Athlete" (profile name never asked during onboarding). | Ask name + colour at crew setup / join → **X9**  Fixed: #74; returning unnamed profiles → X12 below |
| F4 | P1 | "IRON · 0 PLATES" is unexplained jargon. The text is also duplicated in the DOM ("0PLATES" + "0 / PLATES"), so screen readers say it twice. | Plain "Volume this week: 0.9 t", one node → **X3** + **X10**  Fixed: #68, #77 |
| F5 | P1 | Partner card says "No sessions yet" right above a "Last time" card. That's confusing because it's not clear whose. | Label by person, with avatar colour → **X3**  Fixed: #68 |
| F6 | P2 | "MIN" appears twice (quick log + bottom bar). MIN is never explained. | One MIN entry. First-run explainer: "MIN = the 10-minute minimum that still counts" → **X3**, **X9**  Fixed: #68, #74 |
| F7 | P2 | "Install to keep your data safe." banner shows inside the installed app's browser fallback on desktop, and it's not dismissible. | Show only in a mobile browser tab; dismissible → **X3**  Fixed: #68 |
| F8 | P2 | "0 weeks on" means nothing to a new user. | Hide streak until ≥1 week; label "Week streak" → **X3**  Fixed: #68 |

## Train (session, `/session`)

| ID | Sev | Finding | Fix → ticket |
|---|---|---|---|
| S1 | P0 | 4 taps before the first set: Floor START → "Ready for a set? START" → readiness quiz → "Choose exercise" → pick. | START opens the exercise picker directly. Readiness becomes optional, one line at the end → **X4**  Fixed: #67 |
| S2 | P0 | Logged-sets list is a **46 px tall scroll box**, so you see one set at a time and can't see your workout. | Full-height set list grouped by exercise; the input dock is pinned at the bottom → **X4**  Fixed: #67 |
| S3 | P1 | RPE chips 6–10 overflow the 375 px width. Only "No RPE · 6" are visible, and the rest are clipped off-screen. | Compact RPE stepper or 2-row grid; hidden by default behind "Add RPE" → **X4**  Fixed: #67 |
| S4 | P1 | The rest timer renders twice (a 14 px span + a 105 px copy). The big one is announced as hidden but dominates the screen. | One timer, clear hierarchy, collapsible → **X4**  Fixed: #67 |
| S5 | P1 | "1 sets" / "2 sets" grammar. | Pluralise → **X4** / **X10**  Fixed: #67, #77 |
| S6 | P1 | "Screen may sleep." is always visible, even when Wake Lock works. | Show only when Wake Lock is unavailable or was denied → **X4**  Fixed: #67 |
| S7 | P1 | "Baseline set." / "Locked in." / "RACK IT" / "Hold to rack it." are insider jargon. RACK IT = finish workout. | Plain verbs: "Finish workout (hold)", "Saved" → **X4** + **X10**  Fixed: #67, #77 |
| S8 | P1 | First sessions never show a PR ("Baseline set.") with no explanation. It looks broken. | One-line explainer on the first sessions: "PRs start after 2 sessions of a lift" → **X4**  Fixed: #67 |
| S9 | P1 | Summary shows only duration / "Tonnes 0.9" / working sets. There's no per-exercise breakdown and no PRs listed. | Summary: per-exercise sets, best set, PRs, volume in kg, then "Back to Today" → **X4**  Fixed: #67 |
| S10 | P2 | The kg ± step is 2.5 kg with no visible step. Reps and kg inputs look identical. | Show the step, larger numerals, distinct units → **X4**  Fixed: #67 |
| S11 | P2 | The exercise picker opens with "All exercises" and a tiny list, with no recent/favourites first. | Recent first, then muscle groups, with search on top → **X4**  Fixed: #67 |
| S12 | P2 | "Next exercise" and RACK IT sit side by side at the same weight, so it's easy to finish by mistake (hold mitigates). | Finish lives in the header; Next exercise is in the dock → **X4**  Fixed: #67 |

## Progress (`/progress`, `/exercise/:id`, `/day/:date`)

| ID | Sev | Finding | Fix → ticket |
|---|---|---|---|
| P1 | P0 | Unreachable (A1). | **X2**  Fixed: #66 |
| P2 | P1 | Every tab shows the same empty text "Two sessions and the lines start drawing." | Per-tab empty states that tell you what to log → **X5**  Fixed: #69 |
| P3 | P1 | Exercise detail is a wall: "Best e1RM" twice, a 12-row rep-max table, raw ISO dates, and rest/"Big jumps" settings mixed into stats. | Chart first; PR list; history; collapse the rep-max table; move settings into a sheet → **X5**  Fixed: #69, #77; range labels → **X11 (this PR)** |
| P4 | P1 | "e1RM" is never explained. | Label "Estimated 1-rep max" once, with a tooltip → **X5** / **X10**  Fixed: #69, #77 |
| P5 | P1 | Day editor renders every set as a full form (kg, reps, 9 RPE chips, warm-up, note, save, delete) at once. It's endless. | Collapsed set rows; tap opens an edit sheet → **X6**  Fixed: #71 |
| P6 | P2 | The day editor date strip mixes "27 28 … 2026-11-02 … 09". | Weekday + day chips, the selected one highlighted → **X6**  Fixed: #71 |
| P7 | P2 | "Show Athlete" toggle (partner overlay) uses the default name. It's a button without switch semantics. | Real name; `role="switch"` → **X5**  Fixed: #69; legacy stored name → **X11 (this PR)** |

## Crew (`/crew`) and Settings (`/settings`)

| ID | Sev | Finding | Fix → ticket |
|---|---|---|---|
| C1 | P1 | Crew repeats the week ring again. "Together 0 sessions 0.0 t / IRON 0 PLATES" means nothing. "Leave crew" sits in the main view. | Partner-centred page: their week, their last session, shared totals, feed; leaving moves to Settings → **X7**  Fixed: #76 |
| C2 | P2 | "Refresh" button: sync is automatic, so a manual refresh suggests it isn't. | Pull-to-refresh only → **X7**  Fixed: #76 |
| T1 | P1 | Settings is one ~4,000 px scroll: profile, plates, rest, theme, notifications ("Alerts are not sent yet"), privacy, vault tokens, export format, sync, crew, account. | Grouped list → sub-pages (Profile · Training · Appearance · Notifications · Privacy & export · Account) → **X8**  Fixed: #73; theme segmented control → **X11 (this PR)** |
| T2 | P2 | Notification toggles that do nothing yet. | Hide until Phase 7 push exists → **X8**  Fixed: #73 |

## Look and feel (all screens)

| ID | Sev | Finding | Fix → ticket |
|---|---|---|---|
| V1 | P0 | No visual hierarchy: the session screen uses 3 font sizes (12/14/16) plus one 105 px timer. Everything is the same grey block. | New type scale and layout system → **X1**  Fixed: #65, #67 |
| V2 | P1 | The generic look: near-black + one acid accent, ALL-CAPS labels, monospace data labels, "A · B · C" meta strings. | REDESIGN direction → **X1** + all screen tickets  Fixed: #65, #77 |
| V3 | P1 | Identical rounded cards stacked everywhere, so nothing reads as primary. | One hero per screen; quiet lists below → screen tickets  Fixed: #68, #67, #69, #71, #76, #73 |
| V4 | P2 | Dates are raw ISO (`2026-11-02`) everywhere. | "Today", "Mon 2 Nov" via one formatter → **X10**  Fixed: #77; plain range endpoints → **X11 (this PR)** |

## Areas deferred by the original audit
The original audit deferred sign-in, onboarding, join, light theme, offline banners, PR takeover, partner shockwave, Wake Lock, haptics and sound. X11 now covers sign-in, onboarding, join and light theme in WebKit, alongside the existing H7 browser checks. Installed-device checks are listed in X13 below.

## X11 close-out · 3 November 2026

The rows above retain the original findings and identify their resolving PRs.
X11 adds deterministic 375×812 iPhone 15 WebKit baselines in dark and light for
Today; Train picker, six sets, running rest and summary; all four Progress tabs;
exercise detail; day rows and edit sheet; Crew; Settings index and Appearance;
quick logs; and install, sign-in, crew create/join, profile and explainer cards.
The snapshot spec also checks horizontal overflow and WCAG A/AA with axe on every
captured state. Existing H7 and screen-specific interaction tests remain in place.

Carried copy fixes use calendar dates at both range endpoints, activity-specific
delete labels, the partner fallback for legacy stored names, action-specific quick-log
save buttons and success toasts, and the X1 theme segmented control. Product rules,
outbox and data contracts are unchanged.

### Remaining tickets

- **X12 · Returning profile name prompt (F3):** X9's prompt exists in its isolated
  preview but is not mounted on production Today. New accounts supply a name;
  old unnamed/default profiles get the fallback. Lead must authorise the production
  mount in Floor and verify dismissal/account scoping before calling this part fixed.
- **X13 · On-device platform check:** repeat the original deferred checks on an
  installed iPhone: Wake Lock, haptics, sound, offline banners, PR takeover and
  partner shockwave with two accounts. Browser snapshots cannot establish device
  API behaviour. Y5's planned motion pass will need fresh baselines when merged.

CI completion is intentionally left to the Lead: the X11 hand-off is PR open and
CI started, as required by the ticket.
