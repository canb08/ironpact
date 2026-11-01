# Setup

A1 supplies the local scaffold and CI only. Account creation, CLI login/link, SMTP delivery, hosting, function deployment and phone checks are human/later-ticket steps, not completed by this PR. This checklist is SPEC §8 with §10 corrections applied; live dashboard labels and device behavior remain subject to verification.

For local work: select Node 24 with `nvm use`, then `npm ci` and `npm run dev`. Run `npm run typecheck && npm run lint && npm test && npm run build && npm run secret-scan && npm run size` for the CI checks. The wordmark requires no backend keys. Copy `.env.example` to an ignored `.env` when backend tickets need the values.

About 25–35 minutes in total, split across checkpoints. The agent tells you when each step is due. **Never paste a secret into chat with anyone, including your partner.** Paste secrets only into the dashboards or the terminal prompt the agent opens.

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
   - the **secret / service_role** key (a current secret key or legacy). This stays server-side. Hosted Edge Functions receive project keys automatically; never set reserved `SUPABASE_` names (E3.3).
3. Authentication → Providers → Email: **enabled**.
4. Authentication → Email Templates → both **Confirm signup** and **Magic Link**: include `Your code: {{ .Token }}` and save. Authentication → Sign In / Providers → Auth Providers → Email: set **Email OTP Length = 6** and **Email OTP Expiration = 600** seconds. Confirm the length field in the live dashboard before first invite; `VITE_OTP_LENGTH=6` must match (E3.2).
5. Authentication → URL Configuration: leave it for now; you fill it in at Step 4.4.
6. **Email (decision L6): no custom SMTP.** Two users only, so Supabase's built-in email is enough: Supabase dashboard → Organization → Team → Invite member → your partner's email (free). Built-in mail reaches organization members only, 2 emails/hour; each phone signs in once and stays signed in. Add custom SMTP (own domain) only if a third user is ever added.


### Step 3: Supabase CLI link (3 min, Phase 0)
When the agent asks, run in the project folder:
```
npx supabase login
npx supabase link --project-ref <your-ref>
```
It asks for the database password from Step 2.1. Once the later backend tickets supply config and migrations, the agent runs `db push` and deploys functions. Do not push an empty scaffold to a live database.

In Phase 7 the agent generates VAPID keys and sets only `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `DISPATCH_SECRET`, through a local ignored env file or dashboard. `VAPID_SUBJECT=https://<app>.pages.dev` (E3.4). Never set reserved `SUPABASE_` names: project URL and keys are injected. The current hosted API exposes `SUPABASE_SECRET_KEYS` as a JSON key dictionary; legacy `SUPABASE_SERVICE_ROLE_KEY` is also documented (see PLATFORM-NOTES.md).

Before function deployment, the backend ticket must commit `verify_jwt = false` for `export`, `health`, `push-dispatch` and `rest-alarm` in `supabase/config.toml` with CI checks (E3.5). These endpoints implement their own appropriate authentication; a one-off CLI flag is insufficient. Those implementations and configuration are not supplied by A1.


### Step 4: Cloudflare Pages (6 min, Phase 1)
1. dash.cloudflare.com → sign up (free) → Workers & Pages → Create → Pages → Connect to Git → pick `ironpact`.
2. Build command `npm run build` · output directory `dist` · environment variable `NODE_VERSION=24`.
3. Environment variables (Production and Preview):
   - `VITE_SUPABASE_URL`;
   - `VITE_SUPABASE_ANON_KEY` (the publishable key, **never** the secret one);
   - `VITE_VAPID_PUBLIC_KEY` (added in Phase 7, from the agent);
   - `VITE_BACKEND=supabase`;
   - `VITE_OTP_LENGTH=6`.
4. Headers: `public/_headers` (A8) allows `https://*.supabase.co` and `wss://*.supabase.co` in the CSP. Phase 1 ships that wildcard (decision L3); G1 narrows it to the real project origin. Dark iOS startup images are still open (E3.7, Phase 4); manifest shortcuts are Android-only. Exact Pages steps: `docs/DEPLOY.md`.
5. Deploy → copy the `https://<name>.pages.dev` URL → Supabase → Authentication → URL Configuration → **Site URL** = that URL, and add it under **Redirect URLs**.

### Step 5: Keep-alive (2 min, Phase 1)
GitHub repo → Settings → Secrets and variables → Actions → New secret: `HEALTH_URL` = `https://<project-ref>.supabase.co/functions/v1/health` (details in `docs/DEPLOY.md`).

The agent's `keepalive.yml` pings that URL every 2 days, because the free project pauses after 7 days without database activity. An HTTP ping alone is not documented to count (R1 #9), so `health` runs a tiny database read (decision L4, built in A7). It also commits `heartbeat.txt` monthly as a harmless guard. GitHub’s documented 60-day inactivity disablement applies to **public** repositories; this repository is private (E3.9). The keepalive workflow and heartbeat arrive in Phase 1. If you ever get an email that a workflow was disabled, open Actions → keepalive → Enable.

### Step 6: Smoke test on your iPhone (5 min, after Phase 1, again after Phase 6)
1. Safari → open the Pages URL → Share → **Add to Home Screen** → Add.
2. Open SPOTTER **from the home-screen icon**, not from Safari. Enter your email → enter the 6-digit code from the email.
3. Start a crew → pick a name (first name or nickname only) → Lock in.
4. Turn on airplane mode → START → log one set → MIN → turn airplane mode off → within about 30 s the grey tick turns to a chalk tick.
5. From Phase 7: Settings → Notifications → **Enable**, and allow when iOS asks. This only works from the installed icon, on iOS 16.4+.
6. Tell the agent what you saw, including anything that looked off: a timer that let the screen sleep, no sound, a missing notification. It records this in `docs/PLATFORM-NOTES.md`.

### Step 7: Data hygiene rules (read once)
- Display names are first names or nicknames only. No surnames, no medical info.
- Each person's export token is **personal**. You never see your partner's, and they never see yours. Nobody sends a token over chat; each person generates their own in their own app.

### Step 8: Invite your partner (3 min, after Phase 6 `mvp-rc`; Phase 1 for early testing)
1. Crew → **Invite** → it shows a link `https://<app>/join/<CODE>` and the 10-character code in large type (valid 7 days, single use; "Invite" again makes a new one and kills the old one).
2. Send your partner a private message (WhatsApp is fine; the code is not a secret like a token, but don't post it in a group). Paste this, filling the brackets:

```
SPOTTER is live. Do this on your iPhone, in Safari (not Chrome):
1. Open: <app URL>/join/<CODE>
2. Tap Share → Add to Home Screen → Add.
3. Close Safari. Open SPOTTER from your home screen icon.
4. Enter your email, then the 6-digit code from the email.
5. Your invite code: <CODE> — valid 7 days. Copy it from the join page; paste or type it after opening the installed app. Safari storage is not assumed to transfer (E3.8).
6. Pick your display name + colour, keep target 3, tap Lock in.
For your vault: in SPOTTER go to Settings → Vault export → Generate.
Your export URL is: https://<ref>.supabase.co/functions/v1/export
Tap "Copy for my AI" and paste that into your laptop agent. Never send the token to anyone, including me.
```

3. After they join, check that your Crew tab shows their card and their empty ring next to yours.

### Step 9: Wire YOUR vault (5 min, after Phase 1; same steps your partner follows on his side)
1. SPOTTER → Settings → Vault export → **Format**. Pick what your vault takes: **Lines** (default, Markdown bullets), **JSON** or **CSV**. A per-request `?format=lines|json|csv` overrides it.
2. **Generate**, label it e.g. `laptop-vault`. The token (`spx_…`) is shown **once**, so copy it straight into your agent's secret store: an environment variable `SPOTTER_TOKEN`, or the OS keychain. Never put it in a note, the repo or a URL. Tokens are sent in a header only.
3. Tap **Copy for my AI** and paste it into your vault agent. The only template is SPEC §10 E6.2; the verified auth header is recorded in `docs/EXPORT.md` by the export ticket. Keep the token separate in your secret store.
4. Ask your vault agent for a full pull **without `since`**, at most hourly (daily is usually enough). Send `If-None-Match` with the previous ETag; 304 means no change. On 200, replace the whole SPOTTER section, including removal of edited/deleted days. `since` is for previews only (E6.1).

5. Lost laptop or leaked token → SPOTTER → Settings → Vault export → **Revoke & regenerate**. The old token dies immediately. Up to 3 active tokens are allowed, e.g. one per machine.

### Step 10: What to send whom, summarised
| To | What | Channel |
|---|---|---|
| your partner | app URL, join link, 10-char code, install steps, export base URL (Step 8 message) | private chat |
| your partner | **nothing else**: no tokens, no keys | — |
| Your agent | Supabase keys (terminal/`.env`), DB password (terminal prompt only) | local only |
| Your vault agent | the "Copy for my AI" text + `SPOTTER_TOKEN` as a secret | local only |
