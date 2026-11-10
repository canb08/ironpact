# Y9 review captures

All PNGs and the GIF are 375×812 at device scale 1 in system Chromium with the mock backend. `before-today.png` is the untouched main checkout (Proof did not have a screen yet). The filled wall and viewer use a synthetic barbell image selected through the real file chooser; no personal photos are included.

`photo-prompt.gif` records Muay Thai save → default together choice → photo prompt → camera file chooser → Proof card, with motion enabled. The three requested screen captures are `proof-empty.png`, `proof-filled.png`, and `proof-viewer.png`.

The frozen Playwright configuration discovers `p*-*.spec.ts`, so `p7-shell.spec.ts` imports `y9-proof.spec.ts`. Run the new scenarios with `npx playwright test p7-shell.spec.ts -g 'Y9 Proof'`. They check an offline photo, solo placeholder, both close defaults, caption, replace/remove, swipe/button navigation, the Crew deep link, axe AA, and target/viewport bounds.

WebKit downloads are denied by this environment's network policy. Existing WebKit snapshot PNGs are outside the ticket's allowed file list and need a Lead baseline refresh for the fifth tab and the run-save prompt.
