# LANES.md: two Claude overseers, four coders, no collisions

Two lanes run in parallel. Each lane = **one Claude Lead (overseer only) + one Codex + one Grok** on the same human's accounts.

| Lane | Human | Lead | Coders | Owns (Phase) | Tickets in order |
|---|---|---|---|---|---|
| **C** | Can (`canb08`) | Can's Claude | Can's Codex, Can's Grok | Phase 2 · workout engine | P2A, P2F, P2B, P2C → P2D, P2E → P2G |
| **E** | Eytan (`jfork967-spec`) | Eytan's Claude | Eytan's Codex, Eytan's Grok | Phase 3 · duo layer | P3A, P3C, P3D → P3B → P3E, P3F → P3G |

## Fire order (who starts what, right now)
| Engine | Lane C | Lane E |
|---|---|---|
| Codex (task 1) | **P2A** data contract (Astra High) | **P3A** realtime + week close SQL (Astra High) |
| Codex (task 2, parallel) | **P2F** PR server check SQL (Sol High) | — (P3B after P3A merges) |
| Grok (chat 1) | **P2B** core PRs/progression/readiness/prefill | **P3C** core Bar/spots/duel/comeback |
| Grok (chat 2, parallel) | **P2C** rest timer + Wake Lock + haptics | **P3D** Ring component |
| Next when unblocked | Codex **P2D** (after P2A+P2B+P2C) · Grok **P2E** (after P2A) · Grok **P2G** last | Codex **P3B** (after P3A) → Codex **P3E** (after P3B+P3C+P3D) · Grok **P3F** (after P3C) · Grok **P3G** last |

Two tasks at once per engine are fine **only** when their file lists don't overlap (they don't in this table).

## What a Lead does (and only this)
1. `git pull`, read `docs/BOARD.md`. Claim the next ticket of **your lane** (status `running`, commit, push), then fire it in the built-in browser:
   - Codex: `https://chatgpt.com/codex/cloud` → New chat → Cloud + `ironpact` → model as the ticket says → **High** → **Approve for me** → send `Do the ticket in docs/tickets/<ID>.md. Branch from the latest main. Open one PR. Touch only the files it lists.`
   - Grok: `https://grok.com` → model **Build** → send `Use the GitHub connector on repo canb08/ironpact (existing repo, no new app). Read AGENTS.md, docs/GROK.md and docs/LANES.md, then do the ticket in docs/tickets/<ID>.md. Branch <ID>-work from the latest main. Touch only the files it lists. Run the checks, commit, push the branch and open one draft PR to main. Never push to main.`
2. Watch GitHub in the background (30 s `gh pr list` loop), never the chat page.
3. Review per `CLAUDE.md` §4: **read fully** anything in `src/data/**`, `supabase/**`, `src/core/prs.ts`/`streak.ts`; CI-trust + skim UI and tests. Answer every `## Questions` / contract request on the PR (decisions go to `docs/DECISIONS.md` as the next free `L<n>`).
4. Merge your lane's PRs when `check` + `db` (+ `e2e`) are green: `gh pr ready <n>` then `gh pr merge <n> --squash --delete-branch`. A red **teardown/port** step on one run with the twin run green = runner flake, merge.
5. Update the board row (`pr #n` → `merged #n`) and fire the next unblocked ticket. Leads write **no feature code**; they only resolve merge conflicts and make tiny review fixes.

## Shared files (the only places the lanes can collide)
| File | Lane C writes | Lane E writes | Rule |
|---|---|---|---|
| `src/data/adapter.ts` | P2A: new `RepoQueries`/`RepoWrites` methods | P3B: `Repo.duo` + new `Remote` methods | Whoever merges **second** resolves by keeping both sides. |
| `src/data/repo.ts` | P2A: implementations | P3B: wiring + presence hooks | Same. |
| `src/ui/copy.ts` | under `// ── P2x` anchors | under `// ── P3x` anchors | Never touch another anchor; a conflict = keep both blocks. |
| `docs/DECISIONS.md` | L9 (P2A) | L10 (P3B) | Leads number further decisions L11+ by pulling first. |
| `.github/workflows/ci.yml` | — | P3B `db` step only if needed | — |

Never force-push (auto mode blocks it): update an old branch by **merging `main` into it**; resolve `copy.ts` by keeping both blocks, A6/data files by taking `main`'s side, then run the full suite before pushing.

## Queue after Phase 2–3 (Phase 4 visuals, Phase 5 polish) — fire as soon as "Starts after" is met
| Lane | Codex | Grok |
|---|---|---|
| **C** | P4B motion + moment queue (after P4A, P2D) → P4C PR takeover (after P4B, P2D) → P5C Settings full (after P2A, P5D) | **P4A design foundation (no deps — fire the moment a Grok is free)** · P5E banners/update chip (no deps) · P4D sound (after P2C) · P5B S14 complete (after P2E) · P4G Playwright p4 (after P4C, P4E) |
| **E** | **P5D delete account + purge (no deps — fire the moment a Codex is free)** → P4E duo moments (after P4B, P3E) | P4F install gate full (after P4A) · P5A Progress full (after P3F) |

Lane E: P4F and P4E both touch `src/features/floor/` — run them one after the other, not in parallel.
**Grok has no 5-hour limit (trial, weekly pool only): run every Grok-ready ticket as its own parallel chat, and give a ready Codex ticket to Grok when Codex is busy.**
Never idle: when an engine finishes, fire the first ticket in its row whose "Starts after" is met.

## Not in this round
G1 deploy (needs Can: Supabase project + Cloudflare Pages, `docs/DEPLOY.md`), Phase 6 hardening + device test, Phase 7 v1 features, C4 exercise muscles (L7). Don't start them without the humans.
