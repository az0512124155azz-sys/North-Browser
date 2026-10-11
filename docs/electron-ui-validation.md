# Windows UI regression: North 2.10.1

## Failure reproduced in Electron

Electron's contextBridge exposes `window.north` as a non-configurable property.
The global lexical declaration `const north = window.north` in `renderer.js`
raised `SyntaxError: Identifier 'north' has already been declared`. This stopped
the script before any event handlers were installed. The initial tab was absent
and a mouse click on New tab did nothing. `node --check` could not detect this
runtime collision. The renderer and study panel now keep their bridge aliases
inside a function scope.

The remote favicon endpoint redirected to `*.gstatic.com`, outside the existing
image CSP. All five quick-access icons are now local SVGs using the approved
fallback colors and symbols. Unknown sites use the local compass. The browser
shell needs no remote image allowance; the study panel has its stylesheet in a
local file and an explicit CSP.

## Additional fixes

- Navigating a tab to/from Home preserves its identity and does not create extra
  tabs. Same-document navigation and load failures update the address/UI.
- Renderer reload requests a current tab snapshot through IPC.
- New window creates an independent browser window and tab collection.
- Downloads displays actual Chromium download events and updates live. Completed
  files can be revealed in the system file manager.
- History/bookmark/download menus restore the original browser menu correctly.
  Invalid stored history/bookmark JSON no longer breaks the menu handlers.
- Native embedded views reserve space for browser/Study menus; closing a menu
  restores the view bounds. Browser IPC resolves the originating window and
  checks that the request comes from its main frame.

The existing browser stylesheet and layout are unchanged.

## Run the real UI suite

```sh
npm ci
npm run check
npm run test:electron
```

The suite launches the installed Electron binary with the real main/preload/
renderer and clicks using Playwright mouse input. It uses a temporary fresh
profile, clears the bot-token environment variable and runs a local HTTP server
for reproducible navigation/download/failure tests. It never uses the user's
signed-in browser profile. The test bootstrap is not included in the packaged app.

Coverage includes all browser/rail controls, both sets of five site shortcuts,
selecting/closing the final and inactive tabs, Home/search/address submission,
back/forward/reload, bookmarks/history/downloads, new window, Study submenus,
panel refresh/pairing/invalid-token feedback/scan, renderer reload, keyboard
shortcuts and Exit. Runtime logs, actual Electron screenshots and a JSON report
are saved under `test-results/electron/`. The Windows build job runs this suite
before creating NSIS and portable executables and uploads the evidence even
if the suite fails.

## Limits

- Live navigation records the remote URL/title/load status. A redirect to a
  public Classroom page or a site's anti-bot page is not an authenticated test.
- Google and ChatGPT sign-in, private classes/assignments, full authenticated
  scans, Ollama/Qwen and real Telegram messages are not covered by the UI suite.
- The fixed Telegram link and file-manager reveal calls are captured by the test
  bootstrap instead of opening external programs. Invalid-token validation is
  real; no valid Telegram credential is supplied or committed.
- Screenshots capture Electron web contents. Native Windows title-bar buttons,
  tray interaction, Windows installer UI and installation are not automated by
  this suite.
- A successful Windows build confirms artifact generation, not successful
  installation or execution on every Windows machine.
