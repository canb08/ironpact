# SPOTTER personal export

This is the machine-readable contract from SPEC §5 with E0.1, E3.3/E3.5 and E6.1–E6.3 applied. The existing [formatter](../supabase/functions/_shared/export-format.ts) is the byte authority; the endpoint imports it unchanged.

## Request and authentication

```text
GET https://<project-ref>.supabase.co/functions/v1/export[?since=YYYY-MM-DD][&format=lines|json|csv]
Authorization: Bearer <MY_TOKEN>
```

`HEAD` has the same status and representation headers as GET, with no response body. Other methods return 405 with `Allow: GET, HEAD`. The function emits no CORS headers. The local Supabase gateway adds its own CORS header through its [functions-v1 plugin](https://github.com/supabase/supabase/blob/master/docker/volumes/api/kong.yml); removing platform-added headers is outside these function files and must be verified at G1. Gateways may also weaken an ETag when compressing GET output; weak If-None-Match comparison remains supported. CI requests identity encoding when comparing literal GET/HEAD validators.

Tokens have the exact shape `^spx_[A-Za-z0-9_-]{43}$`. The alternative header is `X-Export-Token: <MY_TOKEN>`. An export Bearer credential takes precedence; a normal gateway JWT may accompany the X-Export-Token fallback. A `token` query parameter is always rejected with 400, including an empty value. Never put a token in a URL, note, log or commit.

⚠️ Which auth header works in production is recorded after the first deploy. Both forms are exercised against the local gateway in CI; G1 must verify the deployed gateway before filling `{HEADER}` below.

`since` is optional, inclusive by stored `local_date`, exactly YYYY-MM-DD and a real calendar date. Invalid values return 400 `bad since`. `format` is exactly `lines`, `json` or `csv`; invalid values return 400 `bad format`. The default is the owner's `profiles.export_format`, falling back to `lines` before profile setup.

Only a SHA-256 hex digest is used for token lookup. Missing, malformed, unknown and revoked credentials each cause a fixed 200ms wait followed by an empty 401 response. No request headers or tokens are logged.

## Ownership, quota and caching

The token row is the sole source of `user_id`. Request parameters cannot choose another user. Only that owner's live sessions, sets, cardio, martial, MIN and bodyweight rows are read. Referenced exercises retain their current label even if soft-deleted. Readiness, partner data, reactions, nudges and presence are never exported. Bodyweight is personal regardless of its crew-sharing setting.

Every authenticated request, including HEAD, conditional requests and invalid format/date requests, consumes one count in the fixed one-hour window. Counts above 60 return 429 and `Retry-After` in whole seconds, rounded up until the window ends. Expiry uses the SQL contract's strict comparison: `window_start < now - 1 hour`. The schema initially sets `window_start` when the token is created; the first request after expiry resets it and sets the count to one.

The user approved implementing the update through compare-and-swap within A5's file list. The update compares the original count and timestamp plus token ID, owner and non-revoked status. A concurrent change causes a fresh read and retry, so increments are never overwritten. This uses the function clock rather than database `now()`; after 100 unsuccessful retries the request fails closed with 500. CI exercises concurrent requests against the real local database.

Queries use ID keyset pagination until exhausted, avoiding the API's default row cap. A successful export updates `last_used_at`; revocation is checked again before returning it.

Success headers:

```text
Content-Type: <per format below>
Cache-Control: private, no-cache
ETag: "<SHA-256 hex of the UTF-8 response body>"
X-Content-Type-Options: nosniff
```

`If-None-Match` supports matching strong/weak tags, lists and `*`. A match returns 304 with the same representation headers and no body. ETags are derived from export bytes, not quota or last-use metadata.

| Status | Meaning |
|---|---|
| 200 | Export, including an empty result |
| 304 | Representation unchanged |
| 400 | Token in query, invalid since or format |
| 401 | Missing, malformed, unknown or revoked token; empty body after 200ms wait |
| 405 | Method other than GET/HEAD |
| 429 | More than 60 calls in the current hour; obey Retry-After |
| 500 | Unexpected error; body `export failed`, with no internal details |

HEAD always suppresses bodies, including errors. Empty lines exports have an empty body; CSV retains its header; JSON has `entries: []`.

## Lines: text/plain; charset=utf-8

```text
- YYYY-MM-DD · Weight · <kg1>kg
- YYYY-MM-DD · <Label> · <GROUPS> [· RPE <r>] [· <note>]
- YYYY-MM-DD · <Discipline> · <min>m [· RPE <r>] [· <note>]
- YYYY-MM-DD · Run · <km>km · <time> [· RPE <r>] [· <note>]
- YYYY-MM-DD · MIN · <description>
```

UTF-8 without BOM. The separator is exactly ` · ` (U+0020 U+00B7 U+0020); multiplication is `×` (U+00D7). Every line starts with `- ` and ends with LF, including the last line. No header, summary or extra blank line.

- Dates use stored session-start `local_date`, even across midnight. Bodyweight uses its own local date.
- Working sets merge per exercise ID/date across sessions, ordered by session start and set index. Warm-ups and deleted rows are excluded. Consecutive identical reps/load groups collapse to `N×R×W`, joined by ` + `; separated repeats stay separate.
- Lift load uses kg with dot decimals and at most two fractional digits, trimming trailing zeros. Bodyweight lifts use `BW`, `BW+10kg` or `BW-15kg` for zero, added or assisted load.
- RPE is the maximum logged value for the merged line, rendered as an integer or `.5`; it is omitted when absent.
- Notes are distinct non-empty row notes in time order. Session notes append to the session's first lift line by earliest working-set logged time. Join with `; `, replace `·` with `-`, replace CR/LF with spaces, collapse whitespace, trim and cap at 120 code points without an ellipsis. Preserve `×` in notes.
- All cardio entries on a date merge into Run. Sum metres then convert to km, half-up to two decimals with trailing zeros trimmed. Sum duration: M:SS below one hour, H:MM:SS from one hour.
- Martial entries merge by discipline/date, summing minutes, with max RPE and merged notes.
- Bodyweight uses the latest live measurement per date, always one decimal place.
- Each MIN row has one line with sanitized description. Gym sessions with `mode = min` also have `MIN · session` alongside their lift lines.
- Exercise labels are current labels, so renames apply retroactively.
- Dates sort newest first. Within a date: Weight, lifts by first logged working set, martial by first logged entry, Run, then MIN by logged time (or session start for a MIN-mode gym session).

## JSON: application/json; charset=utf-8

The envelope is `{format: "spotter.export.v1", tz, since, entries}` followed by LF. `tz` is the owner's profile timezone and `since` is null when omitted. Entries have the same order/grouping as lines. Each includes `date`, `type`, `label` and the byte-identical `line` without its trailing LF.

| Type | Other fields |
|---|---|
| lift | groups [{n,reps,kg,bw}], rpe, note |
| run | km, duration_s, rpe, note |
| martial | minutes, rpe, note |
| weight | kg |
| min | description |

For bodyweight lifts, `bw` is true and `kg` is added load, including zero or assistance. Optional values for each entry type are explicit nulls.

## CSV: text/csv; charset=utf-8

RFC 4180 quoting with LF endings, UTF-8 without BOM. The header is always:

```text
date,type,label,value,duration,rpe,note
```

Rows preserve line ordering. Value is GROUPS for lifts, km for runs, minutes for martial arts, one-decimal kg for weight, or description for MIN. Duration is formatted run time or empty; RPE is a number or empty. Fields containing commas, quotes or line endings are quoted, with internal quotes doubled.

The [golden input](../tests/fixtures/export/basic.json) and [expected lines](../tests/fixtures/export/basic.txt) remain unchanged. The shared formatter's tests also cover JSON, CSV and range filtering.

## Token lifecycle and vault synchronization

Each user generates their own token in Settings → Vault export. Creation shows plaintext once; only the hash is stored. At most three active tokens are allowed. Metadata listing contains ID, label, creation, last-use and revoked status, never the hash. Revoke takes effect on the next request. Revoke-and-regenerate shows a new token once; deleting an account revokes its tokens.

Pull the **full export without since**, at most hourly, typically daily. Send the last ETag with If-None-Match. On 304 do nothing. On 200 replace the **whole SPOTTER section**, including when lines are empty, so old edits, moves and deletions reach the vault. Never append. `since` remains available for previews only.

Canonical E6.2 Copy for my AI text (fill URL, header and format after deployment verification; supply the token separately through a secret store):

```text
SPOTTER export for {display_name}: my own training data, read-only. Never anyone else's.
GET {URL}   optional: ?format=lines|json|csv (my default: {FMT}) · ?since=YYYY-MM-DD (inclusive, by local date)
Auth: {HEADER} <MY_TOKEN>. The token is in env var SPOTTER_TOKEN. Never put it in a URL, a note, a log or a commit.
Lines format: newest date first, one line per exercise per day, LF endings, separators " · " (U+00B7) and "×" (U+00D7):
- 2026-10-24 · Bench · 3×5×80kg · RPE 8 · felt strong
- 2026-10-23 · Bench · 1×5×80kg + 2×3×85kg · RPE 9      (count×reps×kg groups, joined " + ", in set order)
- 2026-10-24 · Pull-up · 3×8×BW
- 2026-10-24 · Dip · 3×10×BW+10kg
- 2026-10-24 · Run · 5.2km · 27:40
- 2026-10-24 · BJJ · 60m · RPE 7 · drilled guard
- 2026-10-24 · Weight · 78.4kg
- 2026-10-24 · MIN · 20m walk
Sync: at most hourly. Pull the full export with If-None-Match: <last ETag>. 304 = no change.
On 200, REPLACE my whole SPOTTER section (past days can be edited or deleted). Never append.
200 with empty body = no entries. 401 = bad or revoked token. 429 = over 60 calls/hour (respect Retry-After).
```

## Runtime and verification

`verify_jwt = false` for export and health is already persisted in config. The endpoint authenticates the export credential itself. It reads injected SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, with SUPABASE_SECRET_KEYS.default as the newer-key fallback. Never set reserved SUPABASE_ secrets. These injected names are documented by [Supabase](https://supabase.com/docs/guides/functions/secrets), including the pre-existing E3.3 note in PLATFORM-NOTES.md.

`health` returns 200 `ok`. CI runs database tests, starts a fresh local Auth/API/function stack, then uses Deno tests to create synthetic users/tokens through the RPC, exercise every HTTP status, compare owner-only bytes, test both credential headers, paginate beyond 1,000 rows, revoke/regenerate, and race requests at the quota boundary. No hosted credentials or production database are used. E6.3 limits banned-UI-copy scans to UI/push copy; the required technical error `export failed` remains unchanged.
