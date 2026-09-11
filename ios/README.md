# ICE MAN — iPhone app

A native wrapper around the same game the web build produces. The whole game is one self-contained HTML
file bundled into the app, so it runs offline with no server and no network permission.

## Build and run

1. Open `ICEMAN.xcodeproj` in Xcode.
2. Select the `ICEMAN` target and your iPhone (or a simulator) as the destination.
3. Set your own team under **Signing & Capabilities** — the bundle id is `com.looktwice.iceman`,
   change it if that one is taken on your account.
4. Press Run.

Deployment target is iOS 16. No packages, no dependencies, nothing to install.

## After changing the game

The bundled copy is a snapshot. To pick up game changes:

```sh
./refresh-game.sh
```

That rebuilds `dist/app/index.html` and copies it into `ICEMAN/Resources/`. Then build again in Xcode.

## What the wrapper does

`GameView.swift` hosts a `WKWebView` with everything that fights a game turned off: no scrolling, bounce,
pinch or double-tap zoom, no selection or callout, and audio allowed to start without a tap so the
soundtrack plays. `ICEMANApp.swift` runs it edge to edge with the status bar hidden and the home indicator
dimmed. The project is landscape-only and full screen.

## If the project file ever misbehaves

There is an [XcodeGen](https://github.com/yonaskolb/XcodeGen) spec as a fallback:

```sh
brew install xcodegen
cd ios && xcodegen generate
```

That regenerates `ICEMAN.xcodeproj` from `project.yml` with the same settings.

## Before shipping to the App Store

The bundled soundtrack is a commercial track and is not licensed for redistribution. Replace it with
music you own or have cleared before submitting, or the build will not survive review. Swap the file at
`audio/track.mp3` in the repo root and re-run `./refresh-game.sh`.
