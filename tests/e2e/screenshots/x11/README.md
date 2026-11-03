# X11 visual evidence

Every PNG is 375×812 CSS pixels at device scale 1, with reduced motion and the
clock fixed to 3 November 2026, 13:00 in Europe/Amsterdam. Data comes from
`tests/e2e/fixtures/x11.tsx` (loaded by `x11-seed.ts`): three dated workouts, run and Muay Thai history,
weigh-ins, MIN, and a partner whose stored name is the legacy default. The fixture
uses the real Repo/outbox and mock server with injected chronological time, seeds
before mounting AppShell, and manually syncs before capture. Existing flight specs
continue to test automatic syncing independently.

- `before/`: base `1c75a52444c2fac4418eaaae7e2823161370fd12` (latest main at branch creation).
- `after/`: X11 carried fixes. Both comparison sets use the same system Chromium
  so differences show the UI changes without changing browser engines.
- The committed Playwright baselines are **iPhone 15 WebKit on Linux**, generated
  by the [repository CI runner](https://github.com/canb08/ironpact/actions/runs/41635038059) because this workspace blocks browser downloads.

Normal regression command (requires the pinned Playwright WebKit browser):

```sh
npx playwright test p9-visual-regression --project='iPhone 15'
```

Intentional baseline updates:

```sh
npx playwright test p9-visual-regression --project='iPhone 15' --update-snapshots
```

Every normal capture asserts WCAG A/AA axe results, width ≤375 px, and 44 px
interactive targets. Soft screenshot assertions collect all differences and
still fail the test. CI uploads actual/expected/diff PNGs as `x11-visual-diffs`.
The Pixel 7 project explicitly skips these WebKit baselines; it continues to run
the behavioural carry-over tests and the existing e2e suite.
