// Run: npm exec --yes --package=playwright -- node --test tests/manual-bills.test.cjs
const assert = require("node:assert/strict");
const { before, after, beforeEach, afterEach, test } = require("node:test");
const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const { join, extname, delimiter } = require("node:path");
const packagePaths = [__dirname, ...process.env.PATH.split(delimiter).map((entry) => join(entry, ".."))];
const { chromium } = require(require.resolve("playwright", { paths: packagePaths }));

let server;
let browser;
let context;
let page;
let origin;
const root = join(__dirname, "..");

before(async () => {
  const files = new Set(["index.html", "css/style.css", "js/app.js", "js/db.js", "js/db.selftest.js", "js/voice.js", "js/voice-parser.js", "js/vendor/nzh-cn.js", "manifest.json", "sw.js"]);
  const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };
  server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname.slice(1) || "index.html";
    if (!files.has(path)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": `${types[extname(path)]}; charset=utf-8`, "Cache-Control": "no-store" });
    response.end(await readFile(join(root, path)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 375, height: 812 }, timezoneId: "Asia/Shanghai" });
  page = await context.newPage();
  await page.goto(origin);
  await page.locator(".manual-button").waitFor();
});

afterEach(async () => { await context?.close(); });

async function waitForReady() {
  await page.waitForFunction(() => !document.querySelector(".manual-button").disabled);
}

async function readBills() {
  return page.evaluate(async () => (await import("./js/db.js")).getBills());
}

async function openForm({ amount = "28.50", type = "支出", category = "餐饮", remark = "午餐", date } = {}) {
  await waitForReady();
  await page.getByRole("button", { name: "手动记账", exact: true }).click();
  await page.locator("#bill-dialog[open]").waitFor({ timeout: 2000 });
  await page.getByRole("radio", { name: type, exact: true }).check();
  await page.getByLabel("金额（元）").fill(amount);
  await page.getByLabel("分类", { exact: true }).selectOption(category);
  await page.getByLabel("备注", { exact: true }).fill(remark);
  if (date) await page.getByLabel("日期", { exact: true }).fill(date);
}

async function save() {
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await page.locator("#bill-dialog").waitFor({ state: "hidden" });
  await waitForReady();
}

test("manual entry opens a form with today's local date; cancel does not write", async () => {
  await openForm();
  const today = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
  assert.equal(await page.getByLabel("日期", { exact: true }).inputValue(), today);
  assert.deepEqual(await page.getByLabel("分类", { exact: true }).locator("option").allTextContents(), ["餐饮", "交通", "购物", "住宿", "娱乐", "其他"]);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.deepEqual(await readBills(), []);
});

// Only the external recognition service is replaced; parsing, UI and IndexedDB stay real.
async function installSpeech({ prefixed = false, delayed = false, unsupported = false, startError = false } = {}) {
  await page.addInitScript(({ prefixed, delayed, unsupported, startError }) => {
    window.speechCalls = [];
    class TestRecognition {
      constructor() { window.speech = this; }
      start() {
        window.speechCalls.push("start");
        if (startError) throw new DOMException("Permission denied", "NotAllowedError");
        if (!delayed) queueMicrotask(() => this.onstart?.());
      }
      stop() { window.speechCalls.push("stop"); }
      abort() { window.speechCalls.push("abort"); }
      result(text, final = true) {
        const result = [{ transcript: text, confidence: 0.95 }];
        result.isFinal = final;
        this.onresult?.({ resultIndex: 0, results: [result] });
      }
      end() { this.onend?.(); }
      error(code) { this.onerror?.({ error: code }); this.onend?.(); }
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: !unsupported && !prefixed ? TestRecognition : undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: !unsupported && prefixed ? TestRecognition : undefined });
  }, { prefixed, delayed, unsupported, startError });
  await page.reload();
  await waitForReady();
}

async function holdVoice() {
  const box = await page.locator(".voice-button").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

test("press/release recognizes Chinese and fills the existing form without saving", async () => {
  await installSpeech();
  await holdVoice();
  assert.equal(await page.evaluate(() => window.speech.lang), "zh-CN");
  assert.match(await page.locator(".voice-button").innerText(), /录音中/);
  await page.evaluate(() => window.speech.result("中午吃面花了二十八块", false));
  assert.match(await page.locator("#voice-status").innerText(), /中午吃面/);
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await page.mouse.up();
  assert.deepEqual(await page.evaluate(() => window.speechCalls), ["start", "stop"]);
  await page.evaluate(() => { window.speech.result("中午吃面花了二十八块"); window.speech.end(); });
  await page.locator("#bill-dialog[open]").waitFor();
  assert.equal(await page.getByLabel("金额（元）").inputValue(), "28");
  assert.equal(await page.getByLabel("分类", { exact: true }).inputValue(), "餐饮");
  assert.equal(await page.getByLabel("备注", { exact: true }).inputValue(), "中午吃面");
  assert.deepEqual(await readBills(), []);
  await page.getByLabel("金额（元）").fill("29");
  await save();
  assert.equal((await readBills())[0].amount, 29);
});

test("touch release before recognition starts still stops and missing amount requires manual input", async () => {
  await installSpeech({ prefixed: true, delayed: true });
  await page.locator(".voice-button").dispatchEvent("pointerdown", { pointerId: 42, pointerType: "touch", button: 0, isPrimary: true });
  await page.locator(".voice-button").dispatchEvent("pointerup", { pointerId: 42, pointerType: "touch", button: 0 });
  await page.evaluate(() => window.speech.onstart());
  assert.deepEqual(await page.evaluate(() => window.speechCalls), ["start", "stop"]);
  await page.evaluate(() => { window.speech.result("昨天吃饭"); window.speech.end(); });
  assert.equal(await page.getByLabel("金额（元）").inputValue(), "");
  assert.match(await page.locator("#form-message").innerText(), /未识别到金额，请手动补充/);
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  assert.equal(await page.getByLabel("日期", { exact: true }).inputValue(), today);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  assert.deepEqual(await readBills(), []);
});

test("unsupported speech and denied microphone provide a manual-entry fallback", async () => {
  await installSpeech({ unsupported: true });
  await holdVoice();
  await page.mouse.up();
  assert.match(await page.locator("#voice-status").innerText(), /不支持.*手动记账/);
  await openForm();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await installSpeech();
  await holdVoice();
  await page.evaluate(() => window.speech.error("not-allowed"));
  await page.mouse.up();
  assert.match(await page.locator("#voice-status").innerText(), /权限.*手动记账/);
  assert.equal(await page.locator(".manual-button").isEnabled(), true);
  assert.equal(await page.locator(".voice-button").getAttribute("data-state"), "idle");
  assert.deepEqual(await readBills(), []);
});

test("network, silence, startup errors and pointer cancellation never open or save a bill", async () => {
  await installSpeech();
  for (const code of ["network", "no-speech", "audio-capture"]) {
    await holdVoice();
    await page.evaluate((code) => window.speech.error(code), code);
    await page.mouse.up();
    assert.match(await page.locator("#voice-status").innerText(), /手动记账/);
    assert.equal(await page.locator("dialog[open]").count(), 0);
  }
  await holdVoice();
  await page.locator(".voice-button").dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await page.evaluate(() => { window.speech.result("收入一百元"); window.speech.end(); });
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.equal(await page.locator(".manual-button").isEnabled(), true);
  await installSpeech({ startError: true });
  await holdVoice();
  await page.mouse.up();
  assert.match(await page.locator("#voice-status").innerText(), /权限.*手动记账/);
  assert.deepEqual(await readBills(), []);
});

test("only final results fill once; conflicting categories fall back to other", async () => {
  await installSpeech();
  await holdVoice();
  await page.evaluate(() => {
    window.speech.result("吃饭打车花了五十元");
    window.speech.result("吃饭打车花了五十元");
  });
  await page.mouse.up();
  await page.evaluate(() => window.speech.end());
  assert.equal(await page.getByLabel("金额（元）").inputValue(), "50");
  assert.equal(await page.getByLabel("分类", { exact: true }).inputValue(), "其他");
  assert.deepEqual(await readBills(), []);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await holdVoice();
  await page.evaluate(() => window.speech.result("花了一百元", false));
  await page.mouse.up();
  await page.evaluate(() => window.speech.end());
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.match(await page.locator("#voice-status").innerText(), /手动记账/);
});

test("recognition ending early waits for release; a new session ignores late events from the previous one", async () => {
  await installSpeech();
  await holdVoice();
  await page.evaluate(() => { window.oldSpeech = window.speech; window.speech.result("工资收入五千元"); window.speech.end(); });
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await page.mouse.up();
  assert.equal(await page.getByLabel("金额（元）").inputValue(), "5000");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await holdVoice();
  await page.evaluate(() => { window.oldSpeech.result("花了20元"); window.oldSpeech.end(); });
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await page.mouse.up();
  await page.evaluate(() => { window.speech.result("收入一百元"); window.speech.end(); });
  assert.equal(await page.getByLabel("金额（元）").inputValue(), "100");
  assert.deepEqual(await readBills(), []);
});

test("keyboard hold, focus loss and recognition timeout restore manual entry without writing", async () => {
  await installSpeech();
  await page.locator(".voice-button").focus();
  await page.keyboard.down("Space");
  assert.match(await page.locator(".voice-button").innerText(), /录音中/);
  await page.keyboard.up("Space");
  await page.evaluate(() => { window.speech.result("收入一百元"); window.speech.end(); });
  assert.equal(await page.getByRole("radio", { name: "收入", exact: true }).isChecked(), true);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await holdVoice();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  assert.equal(await page.locator(".manual-button").isEnabled(), true);
  assert.match(await page.locator("#voice-status").innerText(), /已取消/);
  await page.clock.install();
  await holdVoice();
  await page.mouse.up();
  await page.clock.fastForward(16000);
  assert.match(await page.locator("#voice-status").innerText(), /超时.*手动记账/);
  assert.equal(await page.locator(".manual-button").isEnabled(), true);
  assert.deepEqual(await readBills(), []);
});

test("add, reload, edit and delete keep the list and monthly totals consistent", async () => {
  await openForm();
  await save();
  assert.equal((await readBills()).length, 1);
  assert.match(await page.locator("#app-message").innerText(), /成功/);
  assert.match(await page.locator(".bill-item").innerText(), /28\.50/);
  assert.equal(await page.locator("#month-expense").innerText(), "28.50");
  await page.reload();
  await waitForReady();
  assert.equal(await page.locator(".bill-item").count(), 1);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  assert.equal(await page.getByLabel("金额（元）").inputValue(), "28.5");
  assert.equal(await page.getByLabel("备注", { exact: true }).inputValue(), "午餐");
  await page.getByRole("radio", { name: "收入", exact: true }).check();
  await page.getByLabel("金额（元）").fill("100.20");
  await page.getByLabel("分类", { exact: true }).selectOption("其他");
  await save();
  assert.match(await page.locator("#app-message").innerText(), /已更新/);
  assert.equal(await page.locator("#month-income").innerText(), "100.20");
  assert.equal(await page.locator("#month-expense").innerText(), "0.00");
  assert.equal((await readBills())[0].type, "收入");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "删除", exact: true }).click();
  assert.equal((await readBills()).length, 1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".bill-item").length === 0);
  assert.match(await page.locator("#app-message").innerText(), /已删除/);
  assert.deepEqual(await readBills(), []);
  assert.equal(await page.locator("#month-income").innerText(), "0.00");
  assert.match(await page.locator("#list-state").innerText(), /暂无账单/);
});

test("invalid amounts and empty dates stay in the form and never write", async () => {
  await openForm();
  for (const amount of ["", "0", "-1", "1.001"]) {
    await page.getByLabel("金额（元）").fill(amount);
    await page.getByRole("button", { name: "确认", exact: true }).click();
    assert.equal(await page.locator("#bill-dialog[open]").count(), 1);
    assert.ok((await page.locator("#form-message").innerText()).length > 0);
    assert.deepEqual(await readBills(), []);
  }
  await page.getByLabel("金额（元）").fill("1.20");
  await page.getByLabel("日期", { exact: true }).fill("");
  await page.getByRole("button", { name: "确认", exact: true }).click();
  assert.match(await page.locator("#form-message").innerText(), /日期/);
  assert.deepEqual(await readBills(), []);
});

test("older months are excluded from totals, dates sort descending, and remarks are plain text", async () => {
  const dates = await page.evaluate(() => {
    const now = new Date();
    const format = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { old: format(new Date(now.getFullYear(), now.getMonth(), 0)), today: format(now) };
  });
  await openForm({ amount: "999", date: dates.old });
  await save();
  await openForm({ amount: "0.10", date: dates.today, remark: '<img src=x onerror="window.injected=true">' });
  await save();
  await openForm({ amount: "0.20", date: dates.today });
  await save();
  assert.equal(await page.locator("#month-expense").innerText(), "0.30");
  assert.deepEqual(await page.locator(".bill-item time").evaluateAll((items) => items.map((item) => item.dateTime)), [dates.today, dates.today, dates.old]);
  assert.equal(await page.locator(".bill-item img").count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.match(await page.locator(".bill-list").innerText(), /<img src=x/);
});

test("write failures keep form data and committed writes are not retried after refresh failure", async () => {
  await openForm();
  await page.evaluate(() => {
    window.originalTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (name, mode, ...rest) {
      if (mode === "readwrite") throw new Error("Forced write failure");
      return window.originalTransaction.call(this, name, mode, ...rest);
    };
  });
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#form-message").textContent.includes("失败"));
  assert.equal(await page.getByLabel("金额（元）").inputValue(), "28.50");
  assert.deepEqual(await readBills(), []);
  await page.evaluate(() => {
    IDBDatabase.prototype.transaction = function (name, mode, ...rest) {
      if (mode === "readonly") throw new Error("Forced refresh failure");
      return window.originalTransaction.call(this, name, mode, ...rest);
    };
  });
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await page.locator("#bill-dialog").waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.querySelector("#app-message").textContent.includes("刷新失败"));
  assert.equal(await page.locator(".manual-button").isDisabled(), true);
  await page.evaluate(() => { IDBDatabase.prototype.transaction = window.originalTransaction; });
  assert.equal((await readBills()).length, 1);
  await page.reload();
  await waitForReady();
  assert.equal(await page.locator(".bill-item").count(), 1);
  assert.equal(await page.locator("#month-expense").innerText(), "28.50");
});

test("duplicate submits write once; failed edit and delete leave the bill unchanged", async () => {
  await openForm();
  await page.evaluate(() => {
    document.querySelector("#bill-form").requestSubmit();
    document.querySelector("#bill-form").requestSubmit();
  });
  await page.locator("#bill-dialog").waitFor({ state: "hidden" });
  await waitForReady();
  assert.equal((await readBills()).length, 1);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("金额（元）").fill("99");
  await page.evaluate(() => {
    window.originalTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (name, mode, ...rest) {
      if (mode === "readwrite") throw new Error("Forced mutation failure");
      return window.originalTransaction.call(this, name, mode, ...rest);
    };
  });
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#form-message").textContent.includes("失败"));
  assert.equal((await readBills())[0].amount, 28.5);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#app-message").textContent.includes("失败"));
  assert.equal((await readBills())[0].amount, 28.5);
  assert.match(await page.locator(".bill-item").innerText(), /28\.50/);
});

test("initial read failure shows unavailable data and prevents writes", async () => {
  await page.addInitScript(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (name, mode, ...rest) {
      if (mode === "readonly") throw new Error("Forced initial read failure");
      return transaction.call(this, name, mode, ...rest);
    };
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelector("#app-message").textContent.includes("失败"));
  assert.equal(await page.locator(".manual-button").isDisabled(), true);
  assert.equal(await page.locator("#month-income").innerText(), "--");
  assert.equal(await page.locator("#month-expense").innerText(), "--");
  assert.equal(await page.locator(".bill-item").count(), 0);
});

test("editing a record deleted elsewhere reports failure instead of silently inserting", async () => {
  await openForm();
  await save();
  const [bill] = await readBills();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.evaluate(async (id) => (await import("./js/db.js")).deleteBill(id), bill.id);
  await page.getByLabel("金额（元）").fill("99");
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#form-message").textContent.includes("失败"));
  assert.equal(await page.locator("#bill-dialog[open]").count(), 1);
  assert.equal(await page.getByLabel("金额（元）").inputValue(), "99");
  assert.deepEqual(await readBills(), []);
});
