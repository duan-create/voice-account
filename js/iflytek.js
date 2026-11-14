const HOST = 'iat-api.xfyun.cn';
const cloudError = (code = 'CLOUD_FAILED') => Object.assign(new Error('讯飞识别未完成，请检查网络、服务授权及凭证。'), { code });

// Native networking prevents WebView from printing signed URLs on handshake errors.
export function createNativeSocket(plugin) {
  return class NativeSocket {
    constructor(url) {
      this.sessionId = crypto.randomUUID();
      this.readyState = 0;
      void this.connect(url);
    }
    async connect(url) {
      try {
        this.listener = await plugin.addListener('cloudSocket', event => {
          if (this.closed || event.sessionId !== this.sessionId) return;
          if (event.type === 'open') { this.readyState = 1; this.onopen?.(); }
          else if (event.type === 'message') this.onmessage?.({ data: event.data });
          else { this.readyState = 3; this.onerror?.(); this.close(); }
        });
        if (this.closed) { this.remove(); return; }
        await plugin.connect({ sessionId: this.sessionId, url });
      } catch { if (!this.closed) { this.onerror?.(); this.close(); } }
    }
    send(text) {
      if (this.readyState !== 1) throw cloudError();
      void plugin.send({ sessionId: this.sessionId, text }).catch(() => { if (!this.closed) { this.onerror?.(); this.close(); } });
    }
    remove() { if (this.listener) { void this.listener.remove().catch(() => {}); this.listener = null; } }
    close() {
      if (this.closed) return;
      this.closed = true; this.readyState = 3; this.remove();
      void plugin.close({ sessionId: this.sessionId }).catch(() => {});
    }
  };
}

export function validateSpeechConfig(config) {
  const value = { enabled: config?.enabled === true };
  for (const field of ['appId', 'apiKey', 'apiSecret']) {
    value[field] = String(config?.[field] || '').trim();
    if (value[field] && !/^[a-zA-Z0-9_-]{1,128}$/.test(value[field])) throw new Error('语音凭证格式不正确。');
  }
  if (value.enabled && (!value.appId || !value.apiKey || !value.apiSecret)) throw new Error('请填写完整的讯飞凭证。');
  return value;
}

export async function signedIflytekURL(credentials, now = new Date()) {
  const { apiKey, apiSecret } = validateSpeechConfig({ ...credentials, enabled: true });
  const date = now.toUTCString();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`host: ${HOST}\ndate: ${date}\nGET /v2/iat HTTP/1.1`));
  const signature = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const authorization = btoa(`api_key="${apiKey}",algorithm="hmac-sha256",headers="host date request-line",signature="${signature}"`);
  const url = new URL(`wss://${HOST}/v2/iat`);
  url.search = new URLSearchParams({ authorization, date, host: HOST }).toString();
  return url.href;
}

export async function recognizeIflytek(pcm, credentials, { signal, WebSocket: Socket = globalThis.WebSocket, timeoutMs = 45000 } = {}) {
  if (!(pcm instanceof Uint8Array) || pcm.length % 2 || pcm.length > 960000) throw cloudError();
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (!pcm.length) return '';
  const url = await signedIflytekURL(credentials);
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  return new Promise((resolve, reject) => {
    let socket, timer, connectTimer, frameTimer, settled = false, offset = 0, ended = false;
    const parts = new Map();
    function finish(error, text = '') {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(connectTimer); clearTimeout(frameTimer);
      signal?.removeEventListener('abort', abort);
      if (socket) {
        socket.onopen = socket.onerror = socket.onclose = socket.onmessage = null;
        try { socket.close(1000); } catch { /* A failed handshake can already be closed. */ }
      }
      if (error) reject(error); else resolve(text);
    }
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
    function sendFrame() {
      if (settled) return;
      try {
        if (offset >= pcm.length) {
          ended = true;
          socket.send(JSON.stringify({ data: { status: 2 } }));
          return;
        }
        const first = offset === 0;
        const audio = btoa(String.fromCharCode(...pcm.subarray(offset, offset + 1280)));
        offset += 1280;
        const frame = { data: { status: first ? 0 : 1, format: 'audio/L16;rate=16000', encoding: 'raw', audio } };
        if (first) {
          frame.common = { app_id: credentials.appId };
          frame.business = { language: 'zh_cn', domain: 'iat', accent: 'mandarin', rlang: 'zh-cn', ptt: 0, nunum: 1 };
        }
        socket.send(JSON.stringify(frame));
        if (!settled) frameTimer = setTimeout(sendFrame, 40);
      } catch { finish(cloudError()); }
    }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(cloudError('CLOUD_TIMEOUT')), timeoutMs);
    connectTimer = setTimeout(() => finish(cloudError('CLOUD_TIMEOUT')), 5000);
    try {
      socket = new Socket(url);
      socket.onopen = () => { clearTimeout(connectTimer); sendFrame(); };
      socket.onerror = socket.onclose = () => finish(cloudError());
      socket.onmessage = ({ data }) => {
        if (settled) return;
        try {
          if (typeof data !== 'string' || data.length > 65536) throw cloudError();
          const response = JSON.parse(data);
          if (response.code !== 0 || !response.data) throw cloudError();
          const result = response.data.result;
          if (result) {
            if (!Number.isInteger(result.sn) || !Array.isArray(result.ws)) throw cloudError();
            parts.set(result.sn, result.ws.map(word => word.cw?.[0]?.w || '').join(''));
          }
          if (response.data.status === 2) {
            if (!ended) throw cloudError();
            finish(null, [...parts].sort(([a], [b]) => a - b).map(([, text]) => text).join('').trim());
          }
        } catch { finish(cloudError()); }
      };
    } catch { finish(cloudError()); }
  });
}
