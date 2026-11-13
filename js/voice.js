import { parseVoiceBill } from "./voice-parser.js";
import { createNativeRecognition, isAndroidNative } from "./native-voice.js";
import { enrichVoiceCategory } from './voice-category.js';
import { CATEGORIES } from './finance.js';

export function setupVoiceInput({ button, status, isAvailable, setActive, onDraft }) {
  const native = isAndroidNative();
  const Recognition = native
    ? createNativeRecognition(window.Capacitor.registerPlugin("WhisperPlugin"))
    : window.SpeechRecognition || window.webkitSpeechRecognition;
  const label = button.querySelector("span");
  let session = null;

  function render(state, message) {
    button.dataset.state = state;
    button.setAttribute("aria-pressed", String(state === "recording"));
    label.textContent = state === "recording" ? "录音中，松开结束" : state === "starting" ? "正在启动麦克风..." : state === "processing" ? "正在识别..." : "按住说话 记账";
    status.textContent = message;
  }

  function finish(current) {
    if (session !== current) return false;
    clearTimeout(current.timer);
    session = null;
    render("idle", "");
    setActive(false);
    return true;
  }

  function cancel(message = "已取消语音输入，请重试或使用手动记账。") {
    const current = session;
    if (!current || !finish(current)) return;
    current.recognition.abort();
    status.textContent = message;
  }

  function stop() {
    const current = session;
    if (!current || current.released) return;
    current.released = true;
    if (current.ended) {
      complete(current);
      return;
    }
    render("processing", "正在识别，请稍候...");
    // Permission and startup may finish after the user's finger has already lifted.
    if (current.started) current.recognition.stop();
    current.timer = setTimeout(() => cancel("识别超时，请重试或使用手动记账。"), native ? 150000 : 15000);
  }

  function complete(current) {
    if (!finish(current)) return;
    const transcript = current.results.join("").trim();
    if (!transcript) {
      status.textContent = "未识别到有效语音，请重试或使用手动记账。";
      return;
    }
    status.textContent = `已识别：${transcript}`;
    onDraft(enrichVoiceCategory(transcript, parseVoiceBill(transcript), CATEGORIES));
  }

  function start() {
    if (session || !isAvailable()) return;
    if (!Recognition || (!native && !window.isSecureContext)) {
      render("idle", !Recognition ? "当前浏览器不支持语音识别，请使用手动记账。" : "语音识别需要 HTTPS 或 localhost，请使用手动记账。");
      return;
    }
    const current = { recognition: new Recognition(), started: false, released: false, results: [] };
    session = current;
    const recognition = current.recognition;
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    if (native) recognition.onprocessing = () => {
      if (session === current) render("processing", "正在识别，请稍候...");
    };
    recognition.onstart = () => {
      if (session !== current) return;
      current.started = true;
      if (current.released) recognition.stop();
      else render("recording", "正在听，请说出这一笔账单...");
    };
    recognition.onresult = (event) => {
      if (session !== current) return;
      const preview = [];
      for (let index = 0; index < event.results.length; index++) {
        const result = event.results[index];
        preview.push(result[0].transcript);
        current.results[index] = result.isFinal ? result[0].transcript : "";
      }
      status.textContent = `识别中：${preview.join("")}`;
    };
    recognition.onerror = (event) => {
      if (!finish(current)) return;
      const errors = {
        "not-allowed": "麦克风权限被拒绝，请允许麦克风权限或使用手动记账。",
        "service-not-allowed": "语音服务权限被拒绝，请使用手动记账。",
        "audio-capture": "未检测到可用麦克风，请检查设备或使用手动记账。",
        "no-speech": "没有听到语音，请重试或使用手动记账。",
        "model-unavailable": "本地语音模型加载失败，请重新安装完整安装包或使用手动记账。",
        "unsupported": "当前设备不支持本地语音识别，请使用手动记账。",
        "native-failed": "本地语音识别失败，请重试或使用手动记账。",
        network: "语音服务连接失败，请检查网络或使用手动记账。"
      };
      status.textContent = errors[event.error] || "语音识别失败，请重试或使用手动记账。";
    };
    recognition.onend = () => {
      if (session !== current) return;
      current.ended = true;
      if (current.released) complete(current);
      else render("processing", "识别已结束，松开后核对账单。");
    };
    setActive(true);
    render("starting", "正在请求麦克风权限...");
    try {
      recognition.start();
    } catch (error) {
      recognition.onerror({ error: error.name === "NotAllowedError" ? "not-allowed" : "unknown" });
    }
  }

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    if (event.isTrusted) button.setPointerCapture(event.pointerId);
    start();
  });
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", () => cancel());
  button.addEventListener("lostpointercapture", () => {
    if (session && !session.released) cancel();
  });
  button.addEventListener("contextmenu", (event) => event.preventDefault());
  button.addEventListener("keydown", (event) => {
    if ((event.code === "Space" || event.code === "Enter") && !event.repeat) {
      event.preventDefault();
      start();
    }
  });
  button.addEventListener("keyup", (event) => {
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      stop();
    }
  });
  window.addEventListener("blur", () => {
    // Android's system permission sheet can take focus before recording starts.
    if (!native || session?.started) cancel();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (!native || session?.started)) cancel();
  });
  render("idle", "");
}
