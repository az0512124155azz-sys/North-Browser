# North Browser

North is an experimental independent Chromium desktop browser. The repository was initialized from an empty GitHub repo and currently contains a **desktop browsing foundation**, not the earlier full North 2.7 Classroom automation implementation.

## Supported builds

| System | GitHub Actions output | Notes |
| --- | --- | --- |
| Windows x64 | NSIS Setup EXE, portable EXE | Unsigned |
| macOS | DMG, ZIP | Unsigned / not notarized; Gatekeeper warning possible |
| Linux x64 | AppImage, DEB | AppImage may need FUSE |
| Android | Not available | Needs a separately developed mobile browser |
| iPhone/iPad | Not available | Requires iOS-specific app, Xcode, provisioning and signing |

## Download

In [Actions](https://github.com/az0512124155azz-sys/North-Browser/actions/workflows/build-desktop.yml), select the latest **successful** “Build North desktop” run and download the Windows / macOS / Linux artifacts. Builds are not considered available until the corresponding job succeeds.

## Develop

Install Node.js 22+:

```sh
npm install
npm run check
npm start
```

To package on your own machine:

```sh
npm run dist:win
npm run dist:mac
npm run dist:linux
```

Use the command matching your operating system, or the Windows `INSTALL.bat`.

## Status and limitations

The current desktop foundation has tabs, real Chromium web views, a persistent browser partition (`persist:north-main`), and Google Search. It **does not yet include** the original North v2.7 internal Classroom scanning, Qwen/Ollama automation, Telegram pipeline, Chrome profile importer, detailed scanner log, bookmarks/history persistence, or Windows background tray monitoring. Those features must be ported and verified before claiming parity with 2.7.

Do not store API keys, tokens, passwords, cookies, or Chrome profile data in the repository. Google and school websites may reject embedded browser login.

Native macOS installers require code signing and notarization for a smooth user install. Windows binaries are not code signed.

## Security

No bot tokens or real account credentials are included.
