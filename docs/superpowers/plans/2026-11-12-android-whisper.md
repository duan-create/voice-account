# Android Offline Whisper Implementation Plan

**Goal:** Ship native recording and offline Chinese Whisper inference inside the existing Capacitor Android app.

**Approved design:** AudioRecord -> in-memory 16 kHz mono PCM -> JNI / whisper.cpp CPU inference -> existing voice parser -> existing confirmation form. Android ignores network availability for voice input; web/PWA retains Web Speech API. No database, parser, CSS or save-flow changes.

**Dependencies:** whisper.cpp v1.8.2 (4979e04f5dcaccb36057e059bbaed8a2f5288315), multilingual ggml-base-q5_1.bin (59,707,625 bytes, SHA256 422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898), JDK 21, SDK 36, NDK r28, CMake. No automatic SDK installation.

## Execution Checklist

- [x] Native recording/inference: Java recorder, bounded PCM/silence detector, Capacitor permission and lifecycle handling, JNI cancellation, CMake and bundled-model validation. Pure Java PCM tests passed; SDK/device validation is unavailable and explicitly documented.
- [x] Adapter: tested native session promises, early release, cancellation, stale results and permission-sheet focus. Reused existing voice state machine. Browser boundary tests verify Android remains usable offline without web recognition fallback.
- [x] Packaging: downloaded pinned source/model on the development machine; verified checksums and ignore rules. Native-inclusive ZIP inspected for model hash, source, portable configuration and excluded artifacts. Native compilation remains unverified.
- [x] Regression: npm 94/94, browser 48/48, cloud permissions 3/3, Python 23/23, JDK PCM runner passed. cap sync succeeded; 19 copied web asset hashes match; native-inclusive ZIP has 758 checked entries with matching model hash. Database, parser, CSS and HTML are unchanged. Final commit uses the user-specified message.

## Files And Contracts

- `android/app/src/main/java/com/duancreate/voiceaccount/WhisperPlugin.java`: `startRecording({sessionId})`, `stopRecordingAndRecognize({sessionId}) -> {text}`, `cancelRecording({sessionId})`; `recordingStopped` event identifies automatic stop. Session IDs prevent late permission/results affecting a newer recording.
- `PcmCapture.java`: bounded 30-second PCM buffer; 3 seconds initial silence or 1.5 seconds trailing silence; empty silence never reaches inference.
- `WhisperNative.java`, `android/app/src/main/cpp/whisper-jni.cpp`: model loaded from APK assets, Chinese CPU-only inference on one worker, cooperative cancellation; no audio files or network.
- `js/native-voice.js`: Recognition-compatible adapter and Android environment predicate. `js/voice.js` keeps gestures/rendering/parser; native processing gets a longer bounded timeout. `js/app.js` changes only native offline availability. `sw.js` caches adapter and bumps shell version.
- `scripts/prepare-android-whisper.ps1`: explicit build-machine-only downloads and checksums. `scripts/package-voltbuilder.ps1`: native-inclusive clean archive with portable Gradle properties.
- `README.md`: setup, assets, build prerequisites, performance/privacy, unsupported-device and real-device airplane-mode acceptance checks. No claim of a compiled APK without actual build evidence.

## Validation Commands

```powershell
npm.cmd test
node --test tests/native-voice.test.cjs tests/cloud-android.test.cjs
npm.cmd exec --yes --package=playwright -- node --test tests/manual-bills.test.cjs
npx.cmd cap sync android
cd server
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Native PCM tests compile the production Java buffer with the installed JDK and a small standalone assertion runner, without Android SDK stubs. Native microphone/JNI/ABI and APK asset acceptance require Android Studio and an actual device; record those gaps explicitly.
