const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');

async function adapter() {
  return import(pathToFileURL(join(__dirname, '../js/native-voice.js')).href);
}

function boundary() {
  const calls = [];
  const listeners = new Set();
  let resolveStart;
  let resolveStop;
  const plugin = {
    addListener: async (event, listener) => {
      assert.equal(event, 'recordingStopped');
      listeners.add(listener);
      return { remove: async () => listeners.delete(listener) };
    },
    startRecording(options) {
      calls.push(['start', options]);
      return new Promise((resolve) => { resolveStart = resolve; });
    },
    stopRecordingAndRecognize(options) {
      calls.push(['stop', options]);
      return new Promise((resolve) => { resolveStop = resolve; });
    },
    async cancelRecording(options) { calls.push(['cancel', options]); }
  };
  return { plugin, calls, listeners,
    started: () => resolveStart(),
    recognized: (text) => resolveStop({ text }),
    autoStop: () => listeners.forEach((listener) => listener({ sessionId: calls[0][1].sessionId })) };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('only native Android selects offline recognition, never PWA or iOS', async () => {
  const { isAndroidNative } = await adapter();
  assert.equal(isAndroidNative({ getPlatform: () => 'android', isNativePlatform: () => true }), true);
  for (const platform of ['web', 'ios']) {
    assert.equal(isAndroidNative({ getPlatform: () => platform, isNativePlatform: () => platform === 'ios' }), false);
  }
  assert.equal(isAndroidNative(undefined), false);
});

test('native adapter returns one final result and releases its listener', async () => {
  const { createNativeRecognition } = await adapter();
  const native = boundary();
  const Recognition = createNativeRecognition(native.plugin);
  const recognition = new Recognition();
  const events = [];
  recognition.onstart = () => events.push('start');
  recognition.onprocessing = () => events.push('processing');
  recognition.onresult = ({ results }) => events.push([results[0].isFinal, results[0][0].transcript]);
  recognition.onend = () => events.push('end');
  recognition.start();
  await tick();
  native.started();
  await tick();
  recognition.stop();
  await tick();
  native.recognized('打车花了32元');
  await tick();
  assert.deepEqual(events, ['start', 'processing', [true, '打车花了32元'], 'end']);
  assert.equal(native.listeners.size, 0);
  assert.equal(native.calls[0][1].sessionId, native.calls[1][1].sessionId);
});

test('release before permission completes still stops exactly once after startup', async () => {
  const { createNativeRecognition } = await adapter();
  const native = boundary();
  const recognition = new (createNativeRecognition(native.plugin))();
  recognition.start();
  recognition.stop();
  recognition.stop();
  await tick();
  assert.deepEqual(native.calls.map(([method]) => method), ['start']);
  native.started();
  await tick();
  assert.deepEqual(native.calls.map(([method]) => method), ['start', 'stop']);
  native.recognized('');
  await tick();
  assert.equal(native.listeners.size, 0);
});

test('automatic silence stop completes once and ignores another stop', async () => {
  const { createNativeRecognition } = await adapter();
  const native = boundary();
  const recognition = new (createNativeRecognition(native.plugin))();
  let ends = 0;
  recognition.onend = () => ends++;
  recognition.start();
  await tick();
  native.started();
  await tick();
  native.autoStop();
  recognition.stop();
  await tick();
  native.recognized('');
  await tick();
  assert.equal(ends, 1);
  assert.deepEqual(native.calls.map(([method]) => method), ['start', 'stop']);
});

test('abort while permission is pending cancels only its own session and ignores late results', async () => {
  const { createNativeRecognition } = await adapter();
  const native = boundary();
  const recognition = new (createNativeRecognition(native.plugin))();
  const events = [];
  recognition.onstart = () => events.push('start');
  recognition.onresult = () => events.push('result');
  recognition.start();
  await tick();
  recognition.abort();
  native.started();
  await tick();
  assert.deepEqual(events, []);
  assert.equal(native.listeners.size, 0);
  assert.deepEqual(native.calls.map(([method]) => method), ['start', 'cancel']);
  assert.equal(native.calls[0][1].sessionId, native.calls[1][1].sessionId);
});

test('native failures surface as local errors without web/network fallback', async () => {
  const { createNativeRecognition } = await adapter();
  for (const [code, expected] of [['PERMISSION_DENIED', 'not-allowed'], ['MODEL_UNAVAILABLE', 'model-unavailable'], ['UNSUPPORTED', 'unsupported']]) {
    const native = boundary();
    native.plugin.startRecording = async () => { throw Object.assign(new Error('failed'), { code }); };
    const recognition = new (createNativeRecognition(native.plugin))();
    let error;
    let ended = false;
    recognition.onerror = (event) => { error = event.error; };
    recognition.onend = () => { ended = true; };
    recognition.start();
    await tick();
    assert.equal(error, expected);
    assert.equal(ended, true);
    assert.equal(native.listeners.size, 0);
  }
});

test('automatic microphone failure reports error instead of requesting inference', async () => {
  const { createNativeRecognition } = await adapter();
  const native = boundary();
  const recognition = new (createNativeRecognition(native.plugin))();
  let error;
  recognition.onerror = (event) => { error = event.error; };
  recognition.start();
  await tick();
  native.started();
  await tick();
  native.listeners.forEach((listener) => listener({sessionId: native.calls[0][1].sessionId, error: 'AUDIO_CAPTURE'}));
  await tick();
  assert.equal(error, 'audio-capture');
  assert.deepEqual(native.calls.map(([method]) => method), ['start']);
  assert.equal(native.listeners.size, 0);
});

test('abort while listener registration is pending does not start recording', async () => {
  const { createNativeRecognition } = await adapter();
  const native = boundary();
  let registered;
  let removed = false;
  native.plugin.addListener = () => new Promise((resolve) => { registered = resolve; });
  const recognition = new (createNativeRecognition(native.plugin))();
  recognition.start();
  recognition.abort();
  registered({ remove: async () => { removed = true; } });
  await tick();
  assert.equal(removed, true);
  assert.deepEqual(native.calls.map(([method]) => method), ['cancel']);
});

function cloudBoundary() {
  const native = boundary();
  const cancel = native.plugin.cancelRecording;
  native.plugin.cancelRecording = async options => {
    native.listeners.forEach(listener => listener({ sessionId: options.sessionId, error: 'CANCELLED' }));
    await cancel(options);
  };
  native.plugin.stopRecordingForCloud = async options => {
    native.calls.push(['pcm', options]); return { pcm: 'AAABAA==' };
  };
  return native;
}

test('cloud opt-in returns a final result then releases the retained native recording', async () => {
  const { createNativeRecognition } = await adapter();
  const native = cloudBoundary(), received = [];
  const config = { enabled: true, appId: 'test', apiKey: 'key', apiSecret: 'secret' };
  const recognition = new (createNativeRecognition(native.plugin, {
    readConfig: async () => config,
    recognizeCloud: async (pcm, credentials, { signal }) => {
      assert.deepEqual([...pcm], [0, 0, 1, 0]); assert.deepEqual(credentials, config);
      assert.equal(signal.aborted, false); return '午饭28元';
    }
  }))();
  recognition.onresult = e => received.push(e.results[0][0].transcript);
  recognition.start(); await tick(); native.started(); await tick(); recognition.stop(); await tick();
  assert.deepEqual(received, ['午饭28元']);
  assert.deepEqual(native.calls.map(([method]) => method), ['start', 'pcm', 'cancel']);
  assert.equal(native.calls[0][1].cloud, true);
  assert.equal(native.listeners.size, 0);
});

test('every cloud failure reuses exactly the same native recording for offline inference', async () => {
  const { createNativeRecognition } = await adapter();
  for (const code of ['CLOUD_FAILED', 'CLOUD_TIMEOUT', 'INVALID_KEY']) {
    const native = cloudBoundary(), received = [], notices = [];
    const recognition = new (createNativeRecognition(native.plugin, {
      readConfig: async () => ({ enabled: true }),
      recognizeCloud: async () => { throw Object.assign(new Error('private provider error'), { code }); }
    }))();
    recognition.onnotice = value => notices.push(value);
    recognition.onresult = e => received.push(e.results[0][0].transcript);
    recognition.start(); await tick(); native.started(); await tick(); recognition.stop(); await tick();
    assert.deepEqual(native.calls.map(([method]) => method), ['start', 'pcm', 'stop']);
    assert.equal(native.calls[0][1].sessionId, native.calls[2][1].sessionId);
    native.recognized('奶茶12元'); await tick();
    assert.deepEqual(received, ['奶茶12元']);
    assert.equal(notices.length, 1);
    assert.ok(!notices[0].includes('private'));
  }
});

test('offline default and unreadable vault never call cloud and preserve native behavior', async () => {
  const { createNativeRecognition } = await adapter();
  for (const readConfig of [async () => ({ enabled: false }), async () => { throw new Error('lost keystore'); }]) {
    const native = cloudBoundary(); let cloudCalls = 0;
    const recognition = new (createNativeRecognition(native.plugin, { readConfig, recognizeCloud: async () => { cloudCalls++; } }))();
    recognition.start(); await tick(); native.started(); await tick(); recognition.stop(); await tick(); native.recognized(''); await tick();
    assert.equal(cloudCalls, 0);
    assert.deepEqual(native.calls.map(([method]) => method), ['start', 'stop']);
    assert.notEqual(native.calls[0][1].cloud, true);
  }
});

test('aborting cloud recognition cancels upload, clears retained recording and never falls back', async () => {
  const { createNativeRecognition } = await adapter();
  const native = cloudBoundary(); let rejectCloud, signal, results = 0;
  const recognition = new (createNativeRecognition(native.plugin, {
    readConfig: async () => ({ enabled: true }),
    recognizeCloud: async (_pcm, _config, options) => {
      signal = options.signal; return new Promise((_resolve, reject) => { rejectCloud = reject; });
    }
  }))();
  recognition.onresult = () => results++;
  recognition.start(); await tick(); native.started(); await tick(); recognition.stop(); await tick();
  recognition.abort(); rejectCloud(new Error('late cloud failure')); await tick();
  assert.equal(signal.aborted, true);
  assert.equal(results, 0);
  assert.deepEqual(native.calls.map(([method]) => method), ['start', 'pcm', 'cancel']);
});

test('silent cloud capture finishes empty without network request or Whisper inference', async () => {
  const { createNativeRecognition } = await adapter();
  const native = cloudBoundary(); native.plugin.stopRecordingForCloud = async () => ({ pcm: '' });
  let cloudCalls = 0, ends = 0;
  const recognition = new (createNativeRecognition(native.plugin, {
    readConfig: async () => ({ enabled: true }), recognizeCloud: async () => cloudCalls++
  }))();
  recognition.onend = () => ends++;
  recognition.start(); await tick(); native.started(); await tick(); recognition.stop(); await tick();
  assert.equal(cloudCalls, 0); assert.equal(ends, 1);
  assert.deepEqual(native.calls.map(([method]) => method), ['start', 'cancel']);
});
