export function isAndroidNative(capacitor = globalThis.Capacitor) {
  return capacitor?.isNativePlatform?.() === true && capacitor.getPlatform() === "android";
}

export function createNativeRecognition(plugin) {
  return class NativeRecognition {
    constructor() {
      this.sessionId = globalThis.crypto.randomUUID();
      this.closed = false;
      this.started = false;
      this.stopping = false;
      this.released = false;
    }

    async start() {
      try {
        this.listener = await plugin.addListener("recordingStopped", (event) => {
          if (event.sessionId !== this.sessionId) return;
          if (event.error) this.fail({ code: event.error });
          else this.stop();
        });
        if (this.closed) { this.cleanup(); return; }
        await plugin.startRecording({ sessionId: this.sessionId });
        if (this.closed) return;
        this.started = true;
        this.onstart?.();
        if (this.released) this.stop();
      } catch (error) {
        this.fail(error);
      }
    }

    async stop() {
      this.released = true;
      if (this.closed || !this.started || this.stopping) return;
      this.stopping = true;
      this.onprocessing?.();
      try {
        const { text } = await plugin.stopRecordingAndRecognize({ sessionId: this.sessionId });
        if (this.closed) return;
        if (text) {
          const result = [{ transcript: text, confidence: 0 }];
          result.isFinal = true;
          this.onresult?.({ resultIndex: 0, results: [result] });
        }
        this.closed = true;
        this.cleanup();
        this.onend?.();
      } catch (error) {
        this.fail(error);
      }
    }

    abort() {
      if (this.closed) return;
      this.closed = true;
      this.cleanup();
      void plugin.cancelRecording({ sessionId: this.sessionId }).catch(() => {});
    }

    cleanup() {
      if (this.listener) {
        void this.listener.remove().catch(() => {});
        this.listener = null;
      }
    }

    fail(error) {
      if (this.closed) return;
      this.closed = true;
      this.cleanup();
      const codes = { PERMISSION_DENIED: "not-allowed", MODEL_UNAVAILABLE: "model-unavailable", UNSUPPORTED: "unsupported", AUDIO_CAPTURE: "audio-capture", CANCELLED: "aborted" };
      this.onerror?.({ error: codes[error.code] || "native-failed" });
      this.onend?.();
    }
  };
}
