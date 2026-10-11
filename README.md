# North Browser — Desktop / Study Assistant

North is an experimental desktop browser for Windows, macOS, and Linux with a **local Google Classroom scanner** and a **fixed Telegram companion @NorthStudyHelperBot**.

### Telegram setup — one bot only

North supports **@NorthStudyHelperBot exclusively**. You cannot select another bot.

**Security: the old token shared in the conversation was exposed.** Open BotFather, run `/revoke` for @NorthStudyHelperBot and obtain a fresh token. Never publish it in GitHub, issues, screenshots or chat messages.

1. Install and open North Browser.
2. Click **לימודים** in the address toolbar.
3. Paste the **new** token once. North checks `getMe` to reject tokens belonging to other bots and stores it through Electron `safeStorage` where secure storage is available. On platforms without secure storage, configure `NORTH_TELEGRAM_BOT_TOKEN` using OS secrets instead.
4. Click **הצג קוד צימוד**. Open [@NorthStudyHelperBot](https://t.me/NorthStudyHelperBot), send `/link 123456` using the six-digit code displayed locally.
5. Connect to [Google Classroom](https://classroom.google.com/) inside North. North scans internally every 5 minutes **while the application is running and the computer is awake**. Closing the window hides the app to the system tray when supported.

Only the paired private Telegram chat may control North. The bot never uses a public webhook and relies on long polling from the desktop app. A Telegram webhook or another bot process may conflict.

### Telegram commands

- `/scan` — request internal Classroom scan.
- `/tasks` — list detected assignments with action buttons.
- `/classes` — counts of submitted/missing/unknown assignments by course.
- `/messages` — recent detected Classroom announcements.
- `/new <text>` — create a task directly from Telegram.
- `/run <id>` — create a local draft with Ollama/Qwen 2.5.
- `/revise <id> <request>` — regenerate a draft using your revision instructions.
- `/status` — local bot status.
- `/gpt` — currently reports that automated ChatGPT web account integration is **not yet implemented**.

Install and start [Ollama](https://ollama.com/) and run `ollama pull qwen2.5` to enable drafts. No OpenAI API key is required for the Qwen path.

### Important limitations

- The Classroom scanner is **experimental**: page structure changes, inaccessible class content, login requirements, and cross-origin protections can prevent collection. Results are derived from pages visible to North's browser profile, not from Google Classroom's official API.
- Course completion icons appear **only when a status is explicitly detected**; otherwise an assignment is marked unknown, not incorrectly completed.
- New announcements and assignments are sent to Telegram after an initial baseline scan; `/messages` and `/tasks` list existing content without flooding your chat during setup.
- Attached Google Drive documents are currently referenced as links; the app **does not automatically download every attachment**.
- Automatic actions in the normal ChatGPT website, autonomous corrections through that website, and actual submission back to Classroom are **not implemented**. Revision with Qwen is available.
- The bot cannot operate with the computer off. macOS and Linux builds are unsigned. No Android or iPhone app exists yet.
- Google and school websites may restrict login from embedded Chromium.

### Builds

GitHub Actions packages unsigned Windows EXE/portable, macOS DMG/ZIP and Linux AppImage/DEB. Download successful artifacts and releases from [GitHub Actions](https://github.com/az0512124155azz-sys/North-Browser/actions/workflows/build-desktop.yml) or the [Releases page](https://github.com/az0512124155azz-sys/North-Browser/releases).

```sh
npm install
npm run check
npm start
```

On Windows, `INSTALL.bat` builds a setup executable.

### Security

Never commit bot tokens, Google passwords, Chrome cookies, or auth sessions. The only configurable token must belong to the fixed `NorthStudyHelperBot` username. Pairing code expires after ten minutes. State and tasks remain on the local machine.
