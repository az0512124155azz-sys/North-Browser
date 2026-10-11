# North 2.11: remember sign-ins and simplify Telegram

North previously had no password manager. The persistent Chromium partition
also did not explicitly preserve session-only cookies when the app exited.

## Passwords and sign-ins

- Submitting a supported login form offers Save / Not now in North's existing
  menu area. Saving requires the user's explicit click; the website never gets
  the North shell bridge.
- Saved passwords are encrypted with Electron safeStorage in the user's profile.
  On Windows this uses DPAPI. No plaintext password file is written. See
  [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).
- A trusted click on a login input fills the saved account for that exact origin.
  It does not submit the form. Username-first/password-second forms are supported
  using a temporary hint bound to the tab and origin.
- The N profile button opens the saved-password list. It lists sites/usernames,
  not secret values, and allows entries to be removed.
- Session-only cookies are restored from an encrypted snapshot. Persistent
  cookies use Chromium's existing store. Cookie changes update the snapshot;
  quitting waits for a final write and cookies.flushStore. Explicit logout
  removes the session cookie from the snapshot and is respected on restart.
- Relaunching North raises the existing instance for that profile, preventing
  competing cookie/password writes and duplicate Telegram polling from the tray.
- Password storage refuses plain-text fallback when a Linux keyring is absent.

These changes do not import passwords from another browser, defeat a site's
session expiration or guarantee compatibility with every custom login form.
Remote iframe forms are excluded from the privileged password bridge. Storage
is per Windows user and device; this is not cross-device synchronization.

## Telegram

- The Study panel now has a clear Connect my Telegram button and live connection
  status. After one-time bot-key setup, Save and connect opens Telegram directly.
- The button opens a fixed-bot deep link with a random, single-use 192-bit nonce.
  Clicking Start completes pairing without typing a numeric code. Links expire
  after ten minutes and repeated clicks reuse the live link.
- Bot token and owner pairing survive restart. Linked users simply open the bot.
  Numeric codes remain in a collapsed fallback section.
- Only private chats can pair; commands remain restricted to the linked owner.
  The secret token is never embedded in the installer/source. The mechanism uses
  [Telegram's documented deep links](https://core.telegram.org/bots/features#deep-linking).

## Verification

`npm run test:electron` runs the existing 42 real Electron UI scenarios plus
eight new profile/Telegram scenarios. The latter use real Windows safeStorage,
preload/IPC/UI and three complete app launches with the same isolated profile:

1. Login form submission requests consent; encrypted files omit the plaintext.
2. A session-only HttpOnly cookie survives a complete process restart.
3. Password filling survives restart and exposes no shell bridge to the website.
4. Credentials do not fill on a different origin; deletion works.
5. Two-step forms save and fill the correct username and password.
6. Bot-key setup opens a deep link; a simulated private Start message links it.
7. Bot-key/owner state survives restart; explicit logout remains effective.
8. Launching a second process for the same profile exits and reuses the first.

Telegram HTTP responses and external program launch are simulated in this suite;
no real bot credential/message is used. Tests use local login pages, not actual
Google/ChatGPT account passwords. Installer execution and native title-bar/tray
controls are outside this suite. All profile test evidence is uploaded by the
Windows build under `Electron-Windows-tests/profile/`.
