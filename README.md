# North Browser — Desktop / Study Assistant

North is an experimental desktop browser for Windows, macOS, and Linux with a **local Google Classroom scanner** and a **fixed Telegram companion @NorthStudyHelperBot**.

### Telegram setup — one bot only

North supports **@NorthStudyHelperBot exclusively**. You cannot select another bot.

**Security: the old token shared in the conversation was exposed.** Open BotFather, run `/revoke` for @NorthStudyHelperBot and obtain a fresh token. Never publish it in GitHub, issues, screenshots or chat messages.

1. Install and open North Browser.
2. Click **לימודים** in the address toolbar.
3. Paste the **new** token once. North checks `getMe` to reject tokens belonging to other bots and stores it through Electron `safeStorage` where secure storage is available. On platforms without secure storage, configure `NORTH_TELEGRAM_BOT_TOKEN` using OS secrets instead.
4. Click **חבר אותי בטלגרם** and press Start in the bot. The single-use link pairs your private chat without typing a code. The displayed `/link` code remains an alternative.
5. Connect to [Google Classroom](https://classroom.google.com/) inside North. North scans internally every 5 minutes **while the application is running and the computer is awake**. Closing the window hides the app to the system tray when supported.

Only the paired private Telegram chat may control North. The bot never uses a public webhook and relies on long polling from the desktop app. A Telegram webhook or another bot process may conflict.

### Telegram commands

- `/scan` — request internal Classroom scan.
- `/tasks` — list detected assignments with action buttons.
- `/classes` — counts of submitted/missing/unknown assignments by course.
- `/messages` — recent detected Classroom announcements.
- `/new <text>` — create a task directly from Telegram.
- `/run <id>` — prepare a prompt and attachments for your approval before sending to GPT.
- `/revise <id> <request>` — propose a correction in the same GPT conversation, requiring fresh approval.
- `/status` — local bot status.
- `/שיחה` — list numbered, named conversations.
- `/שיחה 3` — select and open conversation 3; the next message continues it.
- `/שיחה חדשה <name>` — create a separate conversation.

Install and start [Ollama](https://ollama.com/) and run `ollama pull qwen2.5`. Qwen only decides how to present source material and prepares prompts; GPT on the ChatGPT website answers. Sign in to ChatGPT inside North. There is no OpenAI API key or API billing; your ChatGPT account limits still apply.

You can write normal messages, send an original PDF/document/photo, and ask for corrections. North shows the exact prompt and selected files before each send. Editing invalidates the prior approval. Study Assistant's **השיחות שלי עם GPT** window preserves source material, proposed/approved prompts, website responses, available generated files and the saved `/c/` conversation link across restarts. Old local Qwen conversations are retained in a clearly labeled archive. An interrupted send requires checking/recovering the existing answer; it is never automatically repeated.

### Important limitations

- The Classroom scanner is **experimental**: page structure changes, inaccessible class content, login requirements, and cross-origin protections can prevent collection. Results are derived from pages visible to North's browser profile, not from Google Classroom's official API.
- Course completion icons appear **only when a status is explicitly detected**; otherwise an assignment is marked unknown, not incorrectly completed.
- New announcements and assignments are sent to Telegram after an initial baseline scan; `/messages` and `/tasks` list existing content without flooding your chat during setup.
- Attached Google Drive documents are currently referenced as links; the app **does not automatically download every attachment**.
- The ChatGPT website adapter uses visible page controls and may stop if the website changes, requires sign-in, presents a challenge, or reaches account/file limits. It does not bypass these checks. Generated-file capture is limited to accessible download links; failures are reported without losing the answer. Scanned PDFs may require sending page images when your account cannot interpret embedded PDF images.
- Real Electron tests exercise approvals, raw file upload, response capture, downloads, conversations and restart with both legacy and modern website fixtures. The modern fixture uses the editor/message attributes observed in the live website and tests virtualized replies. One explicitly approved prompt was sent to the user's signed-in ChatGPT tab and its real answer was collected after updating the response parser. Real file uploads/downloads, Telegram delivery and private Classroom contents have not been verified against the user's accounts.
- North does not submit assignments back to Classroom.
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
