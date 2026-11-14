export function isAndroidNative(capacitor = globalThis.Capacitor) {
  return capacitor?.isNativePlatform?.() === true && capacitor.getPlatform() === "android";
}

export function createNativeRecognition(plugin, { readConfig, recognizeCloud } = {}) {
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
          if (this.closed || this.releasing) return;
          if (event.sessionId !== this.sessionId) return;
          if (event.error) this.fail({ code: event.error });
          else this.stop();
        });
        if (this.closed) { this.cleanup(); return; }
        if (readConfig) {
          try {
            const config = await readConfig();
            if (this.closed) return;
            this.config = config;
          }
          catch { this.onnotice?.('语音配置无法读取，已使用离线识别，请到设置重新配置。'); }
        }
        if (this.closed) return;
        this.cloud = this.config?.enabled === true && Boolean(recognizeCloud);
        await plugin.startRecording({ sessionId: this.sessionId, ...(this.cloud ? { cloud: true } : {}) });
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
        let text;
        if (this.cloud) {
          const { pcm } = await plugin.stopRecordingForCloud({ sessionId: this.sessionId });
          if (this.closed) return;
          const audio = Uint8Array.from(atob(pcm), character => character.charCodeAt(0));
          this.controller = new AbortController();
          try {
            text = audio.length ? await recognizeCloud(audio, this.config, { signal: this.controller.signal }) : '';
            if (this.closed) return;
            this.releasing = true;
            await plugin.cancelRecording({ sessionId: this.sessionId });
          } catch (error) {
            if (this.closed || error.name === 'AbortError') return;
            this.onnotice?.('云端识别未完成，正在使用本地 Whisper，无需重新录音。');
            ({ text } = await plugin.stopRecordingAndRecognize({ sessionId: this.sessionId }));
          } finally { audio.fill(0); }
        } else {
          ({ text } = await plugin.stopRecordingAndRecognize({ sessionId: this.sessionId }));
        }
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
      this.controller?.abort();
      this.config = null;
      if (this.listener) {
        void this.listener.remove().catch(() => {});
        this.listener = null;
      }
    }

    fail(error) {
      if (this.closed) return;
      this.closed = true;
      this.cleanup();
      if (this.cloud) void plugin.cancelRecording({ sessionId: this.sessionId }).catch(() => {});
      const codes = { PERMISSION_DENIED: "not-allowed", MODEL_UNAVAILABLE: "model-unavailable", UNSUPPORTED: "unsupported", AUDIO_CAPTURE: "audio-capture", CANCELLED: "aborted" };
      this.onerror?.({ error: codes[error.code] || "native-failed" });
      this.onend?.();
    }
  };
}
