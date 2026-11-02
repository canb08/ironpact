# Platform notes

Device verification register (reserved for the platform tickets):

| Item | Finding | Source | Date |
|---|---|---|---|

## A1 source checks — 2026-10-26

- Package majors: `npm view` against the official npm registry confirms Vite 8.3.5 and vite-plugin-pwa 2.0.0; exact package versions are in STACK.md. These supersede the uncertain §4.1 majors.
- TypeScript: Microsoft's [TypeScript 7 release notes](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0) document side-by-side aliases for the native compiler and TypeScript 6 API. [typescript-eslint](https://typescript-eslint.io/users/dependency-versions/) supports the latter, not TypeScript 7's API. A1 uses these aliases with exact pins.
- Titanium: #C9CCD1 against #121214 computes to 11.62:1 using WCAG sRGB luminance, above the [3:1 non-text threshold](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Source checked in the [official W3C repository](https://github.com/w3c/wcag/blob/main/understanding/21/non-text-contrast.html). Only the color token ships; no tier component or device claim is made.
- SMTP (E3.1): [Supabase](https://supabase.com/docs/guides/auth/auth-smtp) limits built-in sending to project-team addresses, currently two messages/hour. SETUP requires custom SMTP before partner invitations. [Resend](https://resend.com/docs/dashboard/domains/introduction) requires a verified owned domain. Brevo sender/DMARC deliverability is unverified: use the named Resend alternative with an existing verified domain, or stop invitation setup for owner input; no account was configured here.
- OTP (E3.2): [Supabase OTP docs](https://supabase.com/docs/guides/auth/auth-email-passwordless) describe Token-based email templates and the current Email OTP Expiration path; [template docs](https://supabase.com/docs/guides/auth/auth-email-templates) list signup and magic-link templates. SETUP specifies both and 600 seconds. The exact live OTP-length dashboard label must be checked during account setup; no dashboard access or delivery test occurred.
- Injected keys (E3.3): [Supabase environment-variable docs](https://supabase.com/docs/guides/functions/secrets) list SUPABASE_SECRET_KEYS and the legacy SUPABASE_SERVICE_ROLE_KEY as injected server-only values. SETUP no longer instructs setting reserved names.
- Keepalive (E3.9): [GitHub schedule docs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) limit the 60-day inactivity disablement rule to public repositories. SETUP retains a future heartbeat as a guard, not a private-repo requirement.

Phone APIs, installation, startup images and push remain unverified until their platform tickets and real-device checks. A1's service worker only precaches the build manifest.
| WCAG contrast thresholds | 4.5:1 body text, 3:1 large text and UI graphics. Dark Titanium #C9CCD1 on #121214 = 11.62:1 (culori), passes. Five light-theme/Obsidian pairs fail → DECISIONS L1. | https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Perceivable/Color_contrast | 2026-10-26 |

## B7 install + storage (checked 2026-11-01)
- `beforeinstallprompt`: availability and timing vary; capture it when present, use it once from a tap, otherwise show manual steps + a browser escape. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event)
- `navigator.storage.persist()` is a request that can be denied and is not a backup. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist) · [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- Home-screen app storage is isolated from Safari and exempt from ITP's 7-day cap. [WebKit](https://webkit.org/tracking-prevention/)
- Manifest shortcuts have limited support; navigation never depends on them. [MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/shortcuts)

## A7 health function secrets (E3.3, checked 2026-11-02)
- `health` reads `SUPABASE_URL` plus the legacy `SUPABASE_SERVICE_ROLE_KEY`, falling back to the `default` entry of `SUPABASE_SECRET_KEYS`; reserved `SUPABASE_*` names are never set by us. [Supabase secrets](https://supabase.com/docs/guides/functions/secrets)

## P4D sound and iOS haptics flag (checked 2026-11-02)

- `navigator.audioSession` is feature-detected. On the first tap, when the object exists, `type` is set to `"playback"`. [MDN AudioSession.type](https://developer.mozilla.org/en-US/docs/Web/API/AudioSession/type) (modified 2026-08-19) lists `playback` as exclusive media playback (it pauses other playback) and `transient` as notification sounds. The page does not mention the iOS silent switch. **Not verified on a device.** Fallback per §3.13: sound stays optional and off by default; the visual flash carries the cue. A missing `AudioContext`, a thrown assignment, or a rejected `resume()` is a no-op and shows nothing. [MDN AudioContext](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext).
- iOS checkbox-switch trick: Safari's `<input type="checkbox" switch>` (the control [ios-haptics](https://github.com/tijnjh/ios-haptics) drives with a label click) can produce a tick. [WebKit bug 309082](https://bugs.webkit.org/show_bug.cgi?id=309082), merged as [WebKit PR 65327](https://github.com/WebKit/WebKit/pull/65327) on 2026-05-21, stops a programmatic `label.click()` from becoming a trusted click on the switch, so that path no longer haptics. That matches reports that iOS 26.5 patched it ([web-haptics issue 41](https://github.com/lochie/web-haptics/issues/41)). **Not verified on a device. Flag stays off** (`iosHapticsTrick`, and `VITE_IOS_HAPTICS` only when it is exactly `on`, `1` or `true`). Android still uses `navigator.vibrate` only. [MDN Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate). No user-agent sniff.

## Y1 iOS haptics default (checked 2026-11-02)

- The switch control itself still haptics on a real tap. [WebKit bug 266066](https://bugs.webkit.org/show_bug.cgi?id=266066) added it in Safari 18 ([Safari 18 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-18-release-notes)). [WebKit bug 285120](https://bugs.webkit.org/show_bug.cgi?id=285120) then required user activation, and [bug 309082](https://bugs.webkit.org/show_bug.cgi?id=309082) stopped a scripted `label.click()` counting as that activation. **Not verified on a device.** FEEL §3 (L20) turns the trick **on by default** anyway so the friend can check it from the preview. Fallback: `VITE_IOS_HAPTICS=off` (also `0` or `false`) skips the hidden switch. Android still uses `navigator.vibrate` only. [MDN Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate). No user-agent sniff. If the preview does not tick, the flag goes back off.


