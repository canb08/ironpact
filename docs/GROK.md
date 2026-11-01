# GROK.md: running a ticket on Grok

Grok follows `AGENTS.md` exactly like Codex: one ticket, one branch, one PR, only the files the ticket lists. Claim the ticket in `docs/BOARD.md` first.

## Route A: Grok Build CLI on your PC (preferred: it can run the tests)
1. Clone once: `git clone https://github.com/canb08/ironpact` (your own GitHub login; you are a collaborator) → `cd ironpact` → `npm ci`.
2. Every ticket: `git checkout main && git pull` → start `grok` in the repo folder (signed in with your SuperGrok account).
3. Send:
   `Read AGENTS.md, then do the ticket in docs/tickets/<ID>.md on a new branch <ID>-<short-name>. Touch only the files it lists. Run npm run typecheck, lint, test, build and size until green. Then commit, push the branch and open one PR to main with gh pr create, the body = the ticket's acceptance checklist with proofs.`
4. If Grok can't run `gh`, push the branch yourself and open the PR on github.com.

## Route B: grok.com chat with the GitHub connector (what the Leads use)
Model picker → **Build** (the coding agent; it clones, runs npm and pushes).
Works only because the repo owner installed the **Grok (by xAI)** GitHub App on `canb08/ironpact`. Connect GitHub in Grok's settings (your own GitHub login), then in a chat attach the `ironpact` repo and send the same prompt as Route A. It can't run the test suite, so CI is the only check: read the CI result on the PR before asking for review.

## Rules that bite
- Never push to `main`, never force-push, never merge your own PR (a Claude Lead reviews and merges).
- Line endings are LF (export fixtures are byte-exact).
- No secrets anywhere. No real names or emails in code (`alice@example.test`, `bob@example.test`).
- `src/router.tsx` and `src/app/*` are frozen: replace your screen's placeholder file instead.
