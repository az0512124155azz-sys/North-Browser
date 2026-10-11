# North Browser

Standalone North Browser desktop app (Electron/Chromium) with a local Classroom scanner, Ollama/Qwen support, and Telegram integration.

## Status

- Windows: NSIS installer and portable EXE (unsigned).
- macOS: DMG and ZIP (unsigned and unnotarized).
- Linux: AppImage and DEB.
- Android/iOS: **not supported by this Electron desktop codebase**; a separate mobile implementation is required. No Android APK or iOS IPA is claimed here.

The desktop code originated from North v2.7. Classroom scanning, ChatGPT interactions, and Telegram messaging are **not yet verified end-to-end against real accounts**.

## Downloading installers

Go to **Actions → Build North desktop**. After a successful workflow run, download the artifacts for your operating system. A manually dispatched workflow can also publish a GitHub Release with binaries.

## Development

```sh
npm install
npm run check
npm start
```

Windows users may also use `INSTALL.bat` after the source files are present.

## Security

Never commit Telegram bot tokens, Google credentials, session cookies, or Chrome profile data. The application maintains its own browser profile and does not promise to import Chrome sign-in sessions.

## Source

Project source files are initialized by the bundled-source import workflow and then tracked normally in this repository.
