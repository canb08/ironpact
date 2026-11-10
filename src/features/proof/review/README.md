# Y9 review captures

All PNGs and the GIF are 375×812 at device scale 1 in system Chromium with the mock backend. `before-today.png` is the untouched main checkout (Proof did not have a screen yet). The filled wall and viewer use a synthetic barbell image selected through the real file chooser; no personal photos are included.

`photo-prompt.gif` records Muay Thai save → default together choice → photo prompt → camera file chooser → Proof card, with motion enabled. The three requested screen captures are `proof-empty.png`, `proof-filled.png`, and `proof-viewer.png`.

The frozen Playwright configuration discovers `p*-*.spec.ts`, so `p7-shell.spec.ts` imports `y9-proof.spec.ts`. Run the new scenarios with `npx playwright test p7-shell.spec.ts -g 'Y9 Proof'`. They check an offline photo, solo placeholder, both close defaults, caption, replace/remove, swipe/button navigation, the Crew deep link, axe AA, and target/viewport bounds.

WebKit downloads are denied by this environment's network policy. The Lead authorized the WebKit baseline refresh after CI run 42729327099. At that point, all 34 replacements were byte-for-byte copies of its x11-visual-diffs retry actual PNGs: 30 differ only in the tab bar; two Crew images additionally have eight one-level RGB rasterization differences on an unchanged SVG grip; two run-save images show the required Y9 together prompt instead of the previous confirmation sheet. No screenshot assertions or tolerances changed.

The photo-input follow-up keeps camera/library selections alive through async card creation and image decoding, including viewer replacement. A shared helper resets only after the consumer settles; three unit cases cover pending readers, failed readers, and cancelled selection.

The name follow-up shares `proofDisplayName` between the prompt and Proof profile/card presentation: blank names and the legacy default become Partner (or You for the viewer's own profile). Eight name cases include rendered “With Partner” assertions. Run cards and their viewer now use a static dotted route with red/green endpoints. The prompt, filled wall, and GIF were recaptured at 375×812.

Both run-save WebKit baselines were refreshed with native WebKit revision 2370, packaged with Playwright 1.64.1 in Browserless v2.59.0 and run in an isolated runtime. All pixels outside the button label are identical to the previous CI baselines; the changed rectangle is (139, 621) to (236, 635) for both themes. Both populated-screen suites and both onboarding suites passed unchanged. Local photo-flow validation in that isolated runtime is limited by a generic IndexedDB Blob-storage error: a separate probe fails for plain, canvas-created, and copied Blobs both online and offline. Chromium Proof flows pass; CI remains responsible for photo storage verification on its configured runtime.
