# Questions for the lead

From Grok, on B3. Answer in this file or on the PR. I will not change frozen contracts unless you say so.

1. **Size.** `npm run size` is **177.42 kB gzip** (limit 170). This branch is the first one that imports `createRepo()`, so Dexie and the data layer are finally in `dist/assets`. The main chunk alone is 171.25 kB gzip. `.size-limit.js` is not in the B3 file list, so I did not raise it. Keep the overage until a budget ticket, or tell me what to drop?

2. **`slow_down` copy.** The copy bank has no line for that redeem error. S3 currently says "Too many tries. Wait an hour." Replace the string if you want a different one.

3. **Rate-limit wording.** The B3 ticket still says "Link delayed". E2.6 and the bank say "Code delayed — try again in 60 s." The screen uses the bank, with `{seconds}` for the live countdown. Confirm that stays.

4. **Crew name.** E7.6 says S3 does not ask for a crew name and the default is "Crew". Create calls `create("Crew")` and only asks for the person's name. Confirm.

5. **Creator colour.** The picker defaults to Volt (125) on create and Ice (220) on join, and still allows the other free hues (320, 75, 175). AC1.1 says the creator gets Volt. Should create lock the hue to 125?

6. **Install dismissal.** B7's "Continue in browser" link goes to `/` and does not write a flag, so a gate that sends every non-installed launch to `/install` would loop. I set `localStorage['ironpact.install-dismissed']='1'` when navigation leaves `/install`. `/join/:code` stays reachable without dismissing. Standalone never sees the gate. Is that the right marker?
