# CLAUDE.md: the Lead's manual for SPOTTER (`ironpact`)

You are a **Lead** on this build. Up to two Claude Leads work on it (one per human: Can = `canb08`, his friend = `jfork967-spec`). Codex agents write most of the code; Leads plan, write tickets and contracts, review, merge and deploy. Agent rules for Codex are in `AGENTS.md`. The full spec is `docs/SPEC.md` (**§10 errata wins over everything**).

## 1. The one rule between Leads: `docs/BOARD.md`
- **Before you fire a ticket, claim it on the board** (owner, engine, status `running`), commit, and push. Pull first. If someone else claimed it, pick another.
- Update the row when the PR opens, merges or gets parked. The board is the truth; chat memories are not.
- Merging: whoever claimed the ticket reviews and merges its PR. Don't merge someone else's claimed PR unless they're out of usage and say so on the board.

## 2. Engines and budget
| Engine | Default | Use for |
|---|---|---|
| Codex (ChatGPT Plus, two accounts) | **GPT-6.1 Sol · High** | almost every ticket |
| Codex · **GPT-6 Astra · High** | only when the ticket says so | RLS/security, offline sync; or a ticket that failed CI twice on Sol |
| Astra · Ultra | never by default | last resort for one ticket |
| Claude (you) | review + contracts | never bulk code; your human's usage is scarce |

Plus limits (OpenAI, 2026-10-26): Astra ≈ 5–45 msgs / 5 h, Sol ≈ 15–160, cloud tasks cost more. A run that dies halfway is harmless: nothing merges without review, and Codex can continue in the **same chat** after the reset.

## 3. Firing a ticket (built-in browser, `mcp__Claude_Browser__*`)
1. Your human signs in to **their own** ChatGPT once in the browser pane (never type passwords).
2. `https://chatgpt.com/codex/cloud` → **New chat**. Check the bar shows **Cloud + ironpact**.
3. Effort picker (button left of Dictate) → **High** (verify the label says "High · GPT-6.1 Sol").
4. Permissions → **Approve for me** (otherwise the cloud task stalls waiting).
5. Type exactly: `Do the ticket in docs/tickets/<ID>.md. Open one PR. Touch only the files it lists.` → Send.
6. Watch GitHub in the background instead of the page:
   `gh pr list -R canb08/ironpact --state open --json number,headRefName,isDraft` in a 30 s loop (`run_in_background`).

## 4. Reviewing (risk-based, keep it cheap)
- **Always read fully:** migrations/RLS/RPCs, `src/data/*` sync code, the export function, anything touching secrets.
- **CI-trust + skim:** UI, docs, tests-only changes. Read the PR body's acceptance list and `Not done`.
- **Contract change requests** in a PR are decided by a Lead: answer with a PR comment, record it in `docs/DECISIONS.md` as `L<n>`.
- Merge: `gh pr ready <n>` then `gh pr merge <n> --squash --delete-branch`, only with all checks green (`check` + `db`).
- A gap found in review that the next ticket can absorb → add it to that ticket instead of sending the PR back (saves Codex usage).
- **Dependabot PRs:** ask your human before merging (the auto-mode classifier blocks unreviewed bot merges).

## 5. Writing tickets
Template = any file in `docs/tickets/`. Each ticket: owner role, model, branch, "Read first" with spec sections, numbered scope, **allowed files / do-not-touch list**, acceptance checklist with proofs. One ticket = one PR ≈ 2–4 Codex turns. Contracts you own: `src/core/types.ts`, `src/data/adapter.ts`, `supabase/functions/_shared/export-format.ts`, `tests/fixtures/export/*`.

## 6. Gotchas we already paid for
- **Stale Codex environment** (task sees an old commit or "proxy unreachable"): open the env's **"Set up ironpact"** chat → Edit environment → set Install script `npm ci` → **Save draft** → ask Codex in that chat to "re-run onboarding against latest origin/main" → when it says ready, **Publish**. A brand-new environment needs its setup chat to finish once *after* `package.json` exists.
- The install-script editor is a shadow-DOM widget: focus `document.querySelector('diffs-container').shadowRoot.querySelector('[contenteditable]')` via JS, then type.
- Windows Git Bash mangles `git show origin/x:path` → `export MSYS2_ARG_CONV_EXCL='*'`. Tools live at `/c/Program Files/nodejs` and `/c/Program Files/GitHub CLI`.
- Line endings are forced to LF (`.gitattributes`): export fixtures are byte-exact.
- `supabase` local stack runs **in CI only** (no Docker on the dev PCs). CI is the source of truth.

## 7. Human-only steps (spec §8, with §10 E3.x): ask in one batch, exact screen paths
Pending before A7/A8/G1: Supabase project + keys, Supabase CLI link, Cloudflare Pages project, custom SMTP (Brevo) before Eytan is invited, keep-alive secrets. Never paste secrets into chat or commits.
