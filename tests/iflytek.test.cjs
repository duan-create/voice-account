const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHmac } = require('node:crypto');
const load = () => import('../js/iflytek.js');
const credentials = { appId: 'test-app', apiKey: 'test-key', apiSecret: 'test-secret' };

function socketBoundary(reply) {
  const sent = [], sockets = [];
  class Socket {
    readyState = 0;
    constructor(url) {
      this.url = url; sockets.push(this);
      queueMicrotask(() => { this.readyState = 1; this.onopen?.(); });
    }
    send(json) { const frame = JSON.parse(json); sent.push(frame); reply?.(this, frame); }
    message(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  return { Socket, sent, sockets };
}

test('signed URL follows official host/date/request-line HMAC and never transmits API_SECRET', async () => {
  const { signedIflytekURL } = await load();
  const url = new URL(await signedIflytekURL(credentials, new Date('2026-11-14T01:02:03Z')));
  assert.equal(url.origin, 'wss://iat-api.xfyun.cn');
  assert.equal(url.pathname, '/v2/iat');
  const date = 'Sat, 14 Nov 2026 01:02:03 GMT';
  const signature = createHmac('sha256', 'test-secret').update(`host: iat-api.xfyun.cn\ndate: ${date}\nGET /v2/iat HTTP/1.1`).digest('base64');
  assert.equal(url.searchParams.get('date'), date);
  assert.equal(Buffer.from(url.searchParams.get('authorization'), 'base64').toString(), `api_key="test-key",algorithm="hmac-sha256",headers="host date request-line",signature="${signature}"`);
  assert.ok(!url.href.includes('test-secret'));
});

test('PCM is paced into bounded frames and only final successful simplified Chinese is returned', async () => {
  const { recognizeIflytek } = await load();
  const boundary = socketBoundary((socket, frame) => {
    if (frame.data.status === 0) socket.message({ code: 0, data: { status: 1, result: { sn: 0, ws: [{ cw: [{ w: '午餐' }] }] } } });
    if (frame.data.status === 2) socket.message({ code: 0, data: { status: 2, result: { sn: 1, ws: [{ cw: [{ w: '28元' }] }] } } });
  });
  const pcm = new Uint8Array(2562).fill(12);
  assert.equal(await recognizeIflytek(pcm, credentials, { WebSocket: boundary.Socket }), '午餐28元');
  assert.deepEqual(boundary.sent.map(f => f.data.status), [0, 1, 1, 2]);
  assert.deepEqual(boundary.sent.slice(0, -1).map(f => Buffer.from(f.data.audio, 'base64').length), [1280, 1280, 2]);
  assert.deepEqual(boundary.sent[0].business, { language: 'zh_cn', domain: 'iat', accent: 'mandarin', rlang: 'zh-cn', ptt: 0, nunum: 1 });
  assert.deepEqual(boundary.sent[0].common, { app_id: 'test-app' });
  assert.ok(boundary.sent.slice(1).every(f => !f.common && !f.business));
  assert.ok(boundary.sent.every(f => !JSON.stringify(f).includes('test-secret')));
  assert.equal(boundary.sockets[0].readyState, 3);
});

test('service errors and premature socket close never return partial text', async () => {
  const { recognizeIflytek } = await load();
  for (const error of ['service', 'network', 'closed', 'malformed']) {
    const boundary = socketBoundary((socket, frame) => {
      if (frame.data.status !== 0) return;
      socket.message({ code: 0, data: { status: 1, result: { sn: 0, ws: [{ cw: [{ w: '不应填单' }] }] } } });
      if (error === 'service') socket.message({ code: 10105, message: 'SECRET should not appear in errors' });
      if (error === 'network') socket.onerror?.({ message: 'signed URL must not be logged' });
      if (error === 'closed') socket.close();
      if (error === 'malformed') socket.onmessage?.({ data: 'invalid json' });
    });
    await assert.rejects(recognizeIflytek(new Uint8Array(1280), credentials, { WebSocket: boundary.Socket }), e => e.code === 'CLOUD_FAILED' && !e.message.includes('SECRET'));
  }
});

test('aborting cloud upload closes the socket and suppresses later results', async () => {
  const { recognizeIflytek } = await load();
  const controller = new AbortController();
  const boundary = socketBoundary(() => controller.abort());
  await assert.rejects(recognizeIflytek(new Uint8Array(2560), credentials, { signal: controller.signal, WebSocket: boundary.Socket }), { name: 'AbortError' });
  const count = boundary.sent.length;
  boundary.sockets[0].message({ code: 0, data: { status: 2 } });
  await new Promise(r => setTimeout(r, 60));
  assert.equal(boundary.sent.length, count);
  assert.equal(boundary.sockets[0].readyState, 3);
});

test('cloud timeout rejects and closes the connection', async () => {
  const { recognizeIflytek } = await load();
  const boundary = socketBoundary();
  await assert.rejects(recognizeIflytek(new Uint8Array(1280), credentials, { WebSocket: boundary.Socket, timeoutMs: 60 }), { code: 'CLOUD_TIMEOUT' });
  assert.equal(boundary.sockets[0].readyState, 3);
});

test('empty or oversized/odd PCM does not create a cloud request', async () => {
  const { recognizeIflytek } = await load();
  const boundary = socketBoundary();
  assert.equal(await recognizeIflytek(new Uint8Array(), credentials, { WebSocket: boundary.Socket }), '');
  for (const size of [1, 960002]) await assert.rejects(recognizeIflytek(new Uint8Array(size), credentials, { WebSocket: boundary.Socket }));
  assert.equal(boundary.sockets.length, 0);
});

test('Android socket adapter filters sessions, sends native frames and removes listeners on close', async () => {
  const { createNativeSocket } = await load();
  const calls = [], listeners = new Set();
  const plugin = {
    async addListener(_event, listener) { listeners.add(listener); return { remove: async () => listeners.delete(listener) }; },
    async connect(options) { calls.push(['connect', options]); },
    async send(options) { calls.push(['send', options]); },
    async close(options) { calls.push(['close', options]); }
  };
  const Socket = createNativeSocket(plugin), socket = new Socket('wss://iat-api.xfyun.cn/v2/iat?test=1');
  let opened = 0, received;
  socket.onopen = () => opened++;
  socket.onmessage = event => { received = event.data; };
  await new Promise(r => setImmediate(r));
  const { sessionId } = calls[0][1];
  listeners.forEach(listener => listener({ sessionId: 'wrong', type: 'open' }));
  assert.equal(opened, 0);
  listeners.forEach(listener => listener({ sessionId, type: 'open' }));
  socket.send('{"data":{"status":2}}');
  listeners.forEach(listener => listener({ sessionId, type: 'message', data: '{"code":0}' }));
  assert.equal(opened, 1); assert.equal(received, '{"code":0}');
  socket.close(); await new Promise(r => setImmediate(r));
  assert.equal(listeners.size, 0);
  assert.deepEqual(calls.map(c => c[0]), ['connect', 'send', 'close']);
  assert.equal(calls[1][1].text, '{"data":{"status":2}}');
});

test('cancelling before native listener registration completes never starts a connection', async () => {
  const { createNativeSocket } = await load();
  let registered, connects = 0, removes = 0;
  const Socket = createNativeSocket({
    addListener: () => new Promise(resolve => { registered = resolve; }),
    async connect() { connects++; }, async close() {}
  });
  const socket = new Socket('wss://iat-api.xfyun.cn/v2/iat');
  socket.close(); registered({ remove: async () => removes++ });
  await new Promise(r => setImmediate(r));
  assert.equal(connects, 0); assert.equal(removes, 1);
});
