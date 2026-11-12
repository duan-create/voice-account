# Voice Account PWA / Android Shell

The HTML, CSS and JavaScript sources remain in the repository root. There is no
frontend compiler or bundler.

## Setup And Sync

Requires Node.js 22 or newer (Capacitor 8).

```sh
npm ci
npx cap sync
```

`npm ci` prepares the local Capacitor runtime and the ignored `www/` directory.
The Capacitor copy hook refreshes these assets before every native copy,
including copies triggered by sync.
Run `npm run prepare:web` to refresh them manually. Serve the repository over
localhost or HTTPS to use the PWA; do not open `index.html` with `file://`.

Only `index.html`, `css/`, `js/`, `manifest.json`, `sw.js` and the official
Capacitor runtime are copied into `www/`. This directory and copied native
assets are generated, not source files. Commit the Android project and lockfile.

## Capacitor Configuration

- App name: 语音记账
- App ID: `com.duancreate.voiceaccount`
- Web directory: `www`
- `bundledWebRuntime: true` is retained for the requested configuration, but
  Capacitor 8 no longer consumes this legacy option. The preparation script
  explicitly copies `@capacitor/core/dist/capacitor.js` instead.

Capacitor rejects `webDir: "./"`. Copying the project root would also include
development files and recursively copy the Android output. The staging step
avoids both problems without moving the web sources or adding a build tool.

## Verification Scope

```sh
npm test
npx cap doctor android
```

Resource synchronization does not compile or install an Android application.
An APK build additionally requires Android Studio, Android SDK 36 and JDK 21,
with valid `ANDROID_HOME` and `JAVA_HOME` paths. The minimum Android API is 24.
No APK, signing key or release build is generated in this step.
Android WebView speech recognition and JSON downloads must be tested on a
device later; browser support does not guarantee the same native behavior.
