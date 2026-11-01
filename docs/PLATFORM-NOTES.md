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
