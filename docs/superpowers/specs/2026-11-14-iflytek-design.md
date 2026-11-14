# Optional iFlytek Dictation

Approved scope: Android only. PWA keeps its existing browser recognizer. Offline
Whisper remains the default and all bill parsing, confirmation and storage stay
unchanged.

## Recognition

Use the documented `wss://iat-api.xfyun.cn/v2/iat` API. Sign locally with
HMAC-SHA256; send APP_ID, API_KEY, signature and 16 kHz mono PCM16, never
API_SECRET or ledger data. Send 1280-byte frames at 40 ms intervals and require
a final successful server response. Keep the existing 30-second capture limit.
Carry frames over a native OkHttp WebSocket to avoid WebView automatic error
logging of signed URLs; do not log exceptions, enable redirects or add interceptors.
Keep one native recording in memory until cloud completion; any cloud/network/
authorization/timeout error uses that same recording with Whisper. Cancellation
must stop network transmission and erase retained native audio, not start fallback.
Silence never contacts the cloud. No automatic bill saving.

## Credentials and Settings

Android Keystore holds a non-exportable AES-GCM key. A separate IndexedDB database
`voice-account-speech` stores only a sealed configuration (enabled flag and three
credentials). Native code seals/unseals on demand without persisting plaintext.
This single authoritative copy avoids conflicting native/JS configuration copies.
No credentials enter ledger settings, JSON backups, logs, repository or APK.
Deleting credentials removes ciphertext and the Keystore key. Clearing app data
removes both. Keystore does not protect an already compromised running app.

The settings section offers offline/cloud selection, credential replacement and
deletion, explicit privacy consent, an authorization test using synthetic silence,
and a copyable accounting hotword list. The v2 API uses console-published
application-level hotwords; no unsupported hotword-ID request field is added.
Cloud use and tests can consume the user's provider quota. Provider retention is
governed by its terms, not promised by this app.

## Verification

Test signed requests, audio framing, final results, service errors, timeout and
abort. Test default zero cloud traffic, same-session fallback, late-result
suppression, listener/audio cleanup, encrypted persistence and backup exclusion.
Run existing unit/browser suites, check 320 px settings and offline reload, sync
web assets to Android. No SDK/NDK or real credentials are available locally;
native compilation, Keystore behavior and live dictation require separate cloud
build/device verification and must not be claimed from mocks.
