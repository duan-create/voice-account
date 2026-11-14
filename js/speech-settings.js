import { isAndroidNative } from './native-voice.js';
import { createSpeechVault } from './speech-vault.js';
import { recognizeIflytek, validateSpeechConfig, createNativeSocket } from './iflytek.js';

export function setupSpeechSettings({ showMessage }) {
  const native = isAndroidNative();
  const form = document.querySelector('#speech-form');
  const mode = document.querySelector('#speech-mode');
  const cloud = document.querySelector('#speech-cloud-fields');
  const consent = document.querySelector('#speech-consent');
  const status = document.querySelector('#speech-settings-status');
  const inputs = ['appId', 'apiKey', 'apiSecret'].map(name => form.elements.namedItem(name));
  let vault, Socket, running = false, controller;
  if (native) window.Capacitor.isLoggingEnabled = false;
  function store() {
    // Capacitor debug logging can otherwise print bridge arguments and results.
    window.Capacitor.isLoggingEnabled = false;
    return vault ??= createSpeechVault(window.Capacitor.registerPlugin('SpeechVaultPlugin'));
  }
  const readConfig = () => store().read();
  function recognizeCloud(pcm, config, options = {}) {
    Socket ??= createNativeSocket(window.Capacitor.registerPlugin('CloudSpeechPlugin'));
    return recognizeIflytek(pcm, config, { ...options, WebSocket: Socket });
  }
  function clearInputs() { inputs.forEach(input => { input.value = ''; }); }
  function renderMode() {
    cloud.hidden = mode.value !== 'cloud';
    cloud.disabled = mode.value !== 'cloud';
    consent.required = mode.value === 'cloud';
  }
  async function render() {
    clearInputs(); consent.checked = false;
    try {
      const config = await readConfig();
      mode.value = config.enabled ? 'cloud' : 'offline';
      status.textContent = config.apiSecret ? '已配置凭证；留空保留原值，填写可替换。' : '默认使用本地 Whisper，未配置云端凭证。';
    } catch (error) { mode.value = 'offline'; status.textContent = error.message; }
    renderMode();
  }
  async function configFromForm() {
    let previous;
    try { previous = await readConfig(); } catch { previous = {}; }
    const value = { ...previous, enabled: mode.value === 'cloud' };
    inputs.forEach(input => { if (input.value.trim()) value[input.name] = input.value.trim(); });
    return validateSpeechConfig(value);
  }
  async function run(action) {
    if (running) return;
    running = true;
    form.setAttribute('aria-busy', 'true');
    for (const button of form.querySelectorAll('button')) button.disabled = true;
    try { await action(); }
    catch (error) {
      if (error.name !== 'AbortError') {
        status.textContent = error.code?.startsWith('CLOUD') ? '连接测试失败：请检查网络、凭证、服务额度和设备时间。离线识别不受影响。' : '配置操作未完成，请检查输入或清除凭证后重试。';
        showMessage(status.textContent, true);
      }
    } finally {
      running = false; controller = null;
      form.removeAttribute('aria-busy');
      for (const button of form.querySelectorAll('button')) button.disabled = false;
    }
  }
  form.hidden = !native;
  document.querySelector('#speech-platform-note').hidden = native;
  mode.addEventListener('change', renderMode);
  document.querySelector('#open-settings').addEventListener('click', () => { if (native && !running) void render(); });
  function close() { clearInputs(); consent.checked = false; controller?.abort(); }
  document.querySelector('#close-settings').addEventListener('click', close);
  window.addEventListener('pagehide', close);
  document.addEventListener('visibilitychange', () => { if (document.hidden) close(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    void run(async () => {
      await store().save(await configFromForm());
      clearInputs(); consent.checked = false;
      status.textContent = '语音识别设置已保存。'; showMessage(status.textContent);
    });
  });
  document.querySelector('#speech-test').addEventListener('click', () => {
    if (!consent.checked) { consent.required = true; consent.reportValidity(); return; }
    void run(async () => {
      controller = new AbortController();
      const signal = controller.signal;
      const config = validateSpeechConfig({ ...await configFromForm(), enabled: true });
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      status.textContent = '正在验证服务授权...';
      const pcm = new Uint8Array(6400);
      try { await recognizeCloud(pcm, config, { signal }); }
      finally { pcm.fill(0); }
      status.textContent = '连接测试成功，服务已授权；实际录音效果需试录验证。'; showMessage(status.textContent);
    });
  });
  document.querySelector('#speech-clear').addEventListener('click', () => void run(async () => {
    await store().clear(); clearInputs(); mode.value = 'offline'; consent.checked = false; renderMode();
    status.textContent = '云端凭证已清除，已切回离线 Whisper。'; showMessage(status.textContent);
  }));
  document.querySelector('#speech-copy-hotwords').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(document.querySelector('#speech-hotwords').textContent.trim().split('、').join('\n')); showMessage('推荐热词已复制，请在讯飞控制台上传并发布。'); }
    catch { showMessage('复制失败，请长按选择推荐热词。', true); }
  });
  renderMode();
  return { readConfig, recognizeCloud };
}
