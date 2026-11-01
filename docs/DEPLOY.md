# Deploy SPOTTER

Human steps for Cloudflare Pages and the keep-alive secret. Paste secret values only into the dashboards named below. Never paste them into chat, issues, or this file.

Checked against `docs/research/R1-platform.md` items 9 and 11 (2026-11-01).

## Cloudflare Pages

Screen path: dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git → repository `ironpact`.

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable `NODE_VERSION` | `24` (same major as `.nvmrc`) |

Set these environment variables for **both** Production and Preview. Names only; the values come from the Supabase project settings (API / API Keys):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL, `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The publishable / anon key. Never the secret or service-role key. |
| `VITE_BACKEND` | `supabase` |

`VITE_VAPID_PUBLIC_KEY` is Phase 7. Do not set it in this step.

After the first production deploy:

1. Copy the production URL `https://<name>.pages.dev`.
2. Supabase → Authentication → URL Configuration.
3. Set **Site URL** to that URL, and add the same URL under **Redirect URLs**.

Preview deployments (Cloudflare, checked 2026-11-01):

- A preview is created only for a pull request opened from this same repository.
- Deployment URL: `https://<hash>.<project>.pages.dev`.
- Branch alias: `https://<branch>.<project>.pages.dev`, with the branch name lowercased and every character that is not a letter or digit replaced by a hyphen (`fix/api` → `fix-api`).

### Routes (no `404.html`)

Do not add a top-level `404.html`. Without one, Pages treats the site as a single-page app and serves `/` for any path that is not a real file. Client routes then render from `index.html`. `public/_redirects` is intentionally not in the repo.

Source: [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/) (updated 2026-10-10).

### Headers

`public/_headers` is copied to `dist/_headers` by the build. It is not generated.

`connect-src` allows `https://*.supabase.co` and `wss://*.supabase.co`, so the file has no project-ref placeholder. `scripts/gen-headers.mjs` is not used: nothing in the current shell needs a CSP hash (the service-worker registration is an external script, and `index.html` has no inline script). `style-src` keeps `'unsafe-inline'` because `index.html` sets a style attribute and §4.7 allows it for injected style tags.

Cloudflare joins two values of the same header with a comma. `Cache-Control` is therefore set only on the paths that need it, not on `/*` (which would also match `/assets/*`).

- `/assets/*`: `public, max-age=31536000, immutable` (Vite's hashed files).
- `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest`: `no-cache`.

Limits: 100 header rules, 2,000 characters per line. Source: [Headers](https://developers.cloudflare.com/pages/configuration/headers/) (updated 2026-08-25).

## Keep-alive secret

Screen path: the GitHub repository → Settings → Secrets and variables → Actions → New repository secret.

| Name | Value |
|---|---|
| `HEALTH_URL` | `https://<project-ref>.supabase.co/functions/v1/health` |

No API key and no token in that value. `health` is deployed with `verify_jwt = false`.

Do not create Actions secrets named `SUPABASE_URL` or `SUPABASE_ANON_KEY` for this workflow. Older setup notes still list those names. This workflow reads only `HEALTH_URL`.

### What the workflow does

`.github/workflows/keepalive.yml`:

- Cron `0 6 */2 * *`: 06:00 UTC on day 1, 3, 5, and so on.
- `curl -fsS` the `HEALTH_URL` secret.
- If that secret is unset, it prints `notice: HEALTH_URL is unset; skipping the health ping` and exits 0. The run does not fail.
- On the 1st (UTC) the same run writes one `YYYY-MM-DD` line to `heartbeat.txt` and commits it when the line changed.
- Permissions are `contents: write` only.
- Scheduled runs happen only after this file is on the default branch (`main`). A manual run (Actions → Keepalive → Run workflow) only pings; it does not commit.

### What the ping does not guarantee

Supabase pauses a Free plan project that does not get enough database activity for 7 days. The documented ways to avoid a warned pause are opening the project in the dashboard, or API calls that reach the database. An Edge Function HTTP ping is not listed.

Source: [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) (checked 2026-11-01).

The `health` function currently returns `ok` and does not query the database. Changing it is out of scope here. Until a backend change makes `health` run a database query (the spec's `select 1`), this ping is not the pause fix. In a pause-warning week, open the project in the Supabase dashboard, or use a paid plan (paid projects are not paused).

### Heartbeat

GitHub disables scheduled workflows after 60 days without repository activity in a **public** repository only. This repository is private, so that rule does not apply. The monthly commit stays as a guard.

Source: [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) (checked 2026-11-01).

If a workflow is ever disabled: Actions → Keepalive → Enable.
