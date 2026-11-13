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
  const files = new Set(["index.html", "capacitor.js", "css/style.css", "js/app.js", "js/ui.js", "js/db.js", "js/db.selftest.js", "js/budget-db.js", "js/finance.js", "js/finance-ui.js", "js/charts.js", "js/voice.js", "js/native-voice.js", "js/voice-parser.js", "js/vendor/nzh-cn.js", "manifest.json", "sw.js"]);
  const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };
  server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname.slice(1) || "index.html";
    if (!files.has(path) && !/^js\/[a-z][a-z-]*\.js$/.test(path) && !/^js\/vendor\/(?:papaparse|exceljs)\.min\.js$/.test(path)) {
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
  await page.waitForFunction(() => !document.querySelector(".summary-amount[data-animating]"));
}

async function confirmDeletion(button, accept = true) {
  await button.click();
  await page.locator("#delete-dialog[open]").waitFor({ timeout: 2000 });
  await page.locator(accept ? "#confirm-delete" : "#cancel-delete").click();
}

async function readBills() {
  return page.evaluate(async () => (await import("./js/db.js")).getBills());
}

async function openForm({ amount = "28.50", type = "支出", category = "餐饮", remark = "午餐", date } = {}) {
  await waitForReady();
  await page.getByRole("button", { name: "手动记账", exact: true }).click();
  await page.locator("#bill-dialog[open]").waitFor({ timeout: 2000 });
  await page.getByRole("radio", { name: type, exact: true }).check();
  await page.getByLabel("金额（元）", { exact: true }).fill(amount);
  await page.getByLabel("分类", { exact: true }).selectOption(category);
  await page.getByLabel("备注", { exact: true }).fill(remark);
  if (date) await page.getByLabel("日期", { exact: true }).fill(date);
}

test('assets form links a bill to an account and edit/delete restore its balance', async () => {
  await waitForReady();
  await page.locator('#assets-tab').click();
  await page.locator('#add-account').click();
  await page.locator('#account-name').fill('测试银行卡');
  await page.locator('#opening-balance').fill('1000');
  await page.locator('#asset-form [type=submit]').click();
  await page.locator('#asset-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#total-assets').textContent === '1,000.00');
  await page.locator('#home-tab').click();
  await openForm();
  await page.locator('#bill-account').selectOption({ label: '测试银行卡' });
  await page.locator('#bill-form [type=submit]').click();
  await page.locator('#bill-dialog').waitFor({ state: 'hidden' });
  await waitForReady();
  await page.locator('#assets-tab').click();
  assert.equal(await page.locator('#total-assets').textContent(), '971.50');
  await page.locator('#home-tab').click();
  await confirmDeletion(page.locator('.bill-delete'));
  await waitForReady();
  await page.locator('#assets-tab').click();
  assert.equal(await page.locator('#total-assets').textContent(), '1,000.00');
});

test('calendar selects a day, search returns editable rows and annual chart fits twelve months', async () => {
  await openForm({ remark: '日历午餐', amount: '18' }); await save();
  const today = await page.locator('#bill-date').inputValue();
  await page.locator(`.calendar-day[data-date="${today}"]`).click();
  assert.match(await page.locator('#bills-title').textContent(), /明细/);
  assert.equal(await page.locator('.bill-item').count(), 1);
  await page.locator('#open-search').click();
  await page.locator('#search-keyword').fill('日历午餐');
  await page.locator('#search-form [type=submit]').click();
  assert.match(await page.locator('#bills-title').textContent(), /搜索结果/);
  await page.locator('.bill-action[data-action=edit]').click();
  assert.equal(await page.locator('#bill-amount').inputValue(), '18');
  await page.locator('#bill-amount').fill('19'); await save();
  assert.match(await page.locator('#bills-title').textContent(), /搜索结果/);
  assert.match(await page.locator('.bill-list').textContent(), /19\.00/);
  await page.locator('#statistics-tab').click();
  await page.locator('#statistics-mode').selectOption('year');
  assert.equal(await page.locator('#trend-data tr').count(), 12);
  for (const width of [320, 375, 1024]) {
    await page.setViewportSize({ width, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
});

test('calendar day backgrounds follow net income and expense and retain their color when selected', async () => {
  await waitForReady();
  const dates = await page.evaluate(async () => {
    const { ledger } = await import('./js/ledger-api.js');
    const now = new Date(), dates = [];
    for (let day = 1; day <= 5; day++) {
      const date = new Date(now.getFullYear(), now.getMonth(), day);
      dates.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      const amounts = [[20, 5], [5, 20], [10, 10], [0, 0], [0.3, 0.1 + 0.2]][day - 1];
      for (const [index, amount] of amounts.entries()) if (amount) await ledger.saveBill(null, { type: index ? '支出' : '收入', amount: Math.round(amount * 100) / 100, category: '其他', remark: '日期配色验证', date: date.getTime() });
    }
    return dates;
  });
  await page.reload(); await waitForReady();
  const day = index => page.locator(`.calendar-day[data-date="${dates[index]}"]`);
  const background = index => day(index).evaluate(element => getComputedStyle(element).backgroundColor);
  const red = await background(0), green = await background(1), neutral = await background(2);
  const channels = color => color.match(/[\d.]+/g).map(Number);
  assert.ok(channels(red)[0] > channels(red)[1] && channels(red)[0] > channels(red)[2], 'net income needs a red-tinted background');
  assert.ok(channels(green)[1] > channels(green)[0] && channels(green)[1] > channels(green)[2], 'net expense needs a green-tinted background');
  assert.equal(neutral, await background(3));
  assert.equal(neutral, await background(4), 'equal fractional amounts must remain neutral');
  await day(0).click();
  assert.equal(await day(0).getAttribute('aria-pressed'), 'true');
  assert.equal(await background(0), red);
  assert.equal(await page.locator('.bill-item').count(), 2);
  for (const width of [320, 375, 1024]) {
    await page.setViewportSize({ width, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: join(root, `.cache/calendar-colors-${width}.png`), fullPage: true });
  }
});

test('complete backup and CSV/Excel exports work offline and CSV import previews before writing', async () => {
  await openForm({ remark: '导出,"备注"', amount: '12.50' }); await save();
  for (const extension of ['json', 'csv', 'xlsx']) {
    const download = page.waitForEvent('download');
    await page.locator(`[data-export="${extension}"]`).click();
    const file = await download; assert.ok(file.suggestedFilename().endsWith(`.${extension}`));
    if (extension === 'json') { const data = JSON.parse(await readFile(await file.path(), 'utf8')); assert.equal(data.format, 'voice-account'); assert.equal(data.stores.bills.length, 1); }
    if (extension === 'xlsx') { const bytes = await readFile(await file.path()); assert.equal(bytes.toString('ascii', 0, 2), 'PK'); }
  }
  await page.locator('#import-file').setInputFiles({ name: 'bills.csv', mimeType: 'text/csv', buffer: Buffer.from('日期,类型,金额,分类,备注,账户\n2026-11-13,支出,5,交通,导入地铁,未指定账户') });
  await page.locator('#import-dialog[open]').waitFor();
  assert.match(await page.locator('#import-preview').textContent(), /通过/);
  assert.equal((await readBills()).length, 1);
  await page.locator('#confirm-import').click();
  await page.locator('#import-dialog').waitFor({ state: 'hidden' });
  assert.equal((await readBills()).length, 2);
});

async function save() {
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await page.locator("#bill-dialog").waitFor({ state: "hidden" });
  await waitForReady();
}

test('savings goals move funds without extra bills and scheduled plans survive reload', async () => {
  await waitForReady();
  await page.evaluate(async () => {
    const { ledger } = await import('./js/ledger-api.js');
    const cash = (await ledger.accounts()).find(a => a.name === '现金');
    await ledger.saveAccount({ ...cash, opening: 100 }); await ledger.saveAccount({ name: '存款', opening: 0 });
  });
  await page.reload(); await waitForReady();
  await page.locator('#plans-tab').click(); await page.locator('#add-goal').click();
  await page.locator('#goal-name').fill('旅行'); await page.locator('#goal-target').fill('1000'); await page.locator('#goal-daily').fill('10');
  await page.locator('#goal-from').selectOption({ label: '现金' }); await page.locator('#goal-to').selectOption({ label: '存款' });
  await page.locator('#plan-form [type=submit]').click(); await page.locator('#plan-dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '今日存钱', exact: true }).click();
  await page.getByRole('button', { name: '今日已打卡', exact: true }).waitFor();
  assert.equal((await readBills()).length, 0);
  assert.deepEqual(await page.evaluate(async () => (await (await import('./js/ledger-api.js')).ledger.accounts()).filter(a => ['现金', '存款'].includes(a.name)).map(a => a.balance)), [90, 10]);
  await page.locator('#add-schedule').click(); await page.locator('#plan-kind').selectOption('bill');
  await page.locator('#schedule-amount').fill('5'); await page.locator('#schedule-category').selectOption('交通');
  await page.locator('#schedule-account').selectOption({ label: '现金' });
  await page.locator('#plan-form [type=submit]').click(); await page.locator('#plan-dialog').waitFor({ state: 'hidden' });
  await page.reload(); await waitForReady(); await page.locator('#plans-tab').click();
  assert.match(await page.locator('#schedule-list').textContent(), /自动记账/);
  for (const width of [320, 375, 1024]) { await page.setViewportSize({ width, height: 812 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
});

test("manual entry opens a form with today's local date; cancel does not write", async () => {
  await openForm();
  const today = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
  assert.equal(await page.getByLabel("日期", { exact: true }).inputValue(), today);
  const categories = await page.getByLabel('分类', { exact: true }).locator('option').evaluateAll(options => options.map(o => o.value));
  for (const name of ['餐饮', '交通', '购物', '住宿', '娱乐', '其他', '医疗', '工资']) assert.ok(categories.includes(name));
  await page.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.deepEqual(await readBills(), []);
});

test("the bundled Capacitor runtime loads on the web without changing manual entry", async () => {
  await waitForReady();
  assert.equal(await page.evaluate(() => window.Capacitor?.getPlatform()), "web");
  assert.equal(await page.evaluate(() => typeof window.Capacitor?.registerPlugin), "function");
  assert.equal(await page.evaluate(() => window.Capacitor?.isNativePlatform()), false);
  await openForm();
  await save();
  assert.equal((await readBills()).length, 1);
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
  await page.locator('.voice-button').hover();
  await page.mouse.down();
}

async function installNativeVoice({ denied = false, delayed = false } = {}) {
  await page.route('**/capacitor.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    const listeners = new Set();
    window.nativeCalls = [];
    window.nativeVoice = {
      addListener: async (_, callback) => { listeners.add(callback); return { remove: async () => listeners.delete(callback) }; },
      startRecording: async (options) => {
        window.nativeCalls.push(['start', options]);
        if (${denied}) throw Object.assign(new Error('denied'), {code: 'PERMISSION_DENIED'});
        if (${delayed}) await new Promise((resolve) => { window.allowNative = resolve; });
      },
      stopRecordingAndRecognize: (options) => {
        window.nativeCalls.push(['stop', options]);
        return new Promise((resolve) => { window.nativeResult = (text) => resolve({text}); });
      },
      cancelRecording: async (options) => { window.nativeCalls.push(['cancel', options]); }
    };
    window.nativeAutoStop = () => listeners.forEach((listener) => listener({sessionId: window.nativeCalls[0][1].sessionId}));
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', registerPlugin: (name) => name === 'PlannerPlugin' ? { configure: async () => {}, pending: async () => ({items: []}), acknowledge: async () => {}, requestNotifications: async () => ({granted: true}) } : window.nativeVoice };
    window.SpeechRecognition = class { constructor() { throw new Error('Native must never use web recognition'); } };
  ` }));
  await page.reload();
  await waitForReady();
}

test('Android voice remains available offline, fills the original form and saves only after confirmation', async () => {
  await installNativeVoice();
  await context.setOffline(true);
  await page.waitForFunction(() => !navigator.onLine);
  assert.equal(await page.locator('.voice-button').isVisible(), true);
  assert.equal(await page.locator('.voice-button').isEnabled(), true);
  await holdVoice();
  await page.waitForFunction(() => document.querySelector('.voice-button').dataset.state === 'recording');
  await page.mouse.up();
  await page.waitForFunction(() => typeof window.nativeResult === 'function');
  await page.evaluate(() => window.nativeResult('中午吃面花了二十八块'));
  await page.locator('#bill-dialog[open]').waitFor();
  assert.equal(await page.getByLabel('金额（元）', { exact: true }).inputValue(), '28');
  assert.equal(await page.getByLabel('分类', {exact: true}).inputValue(), '餐饮');
  assert.deepEqual(await readBills(), []);
  await save();
  assert.equal((await readBills())[0].amount, 28);
});

test('Android automatic silence and permission rejection restore manual entry without saving', async () => {
  await installNativeVoice();
  await holdVoice();
  await page.waitForFunction(() => document.querySelector('.voice-button').dataset.state === 'recording');
  await page.evaluate(() => window.nativeAutoStop());
  await page.waitForFunction(() => typeof window.nativeResult === 'function');
  await page.evaluate(() => window.nativeResult(''));
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.voice-button').dataset.state === 'idle');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  await installNativeVoice({denied: true});
  await holdVoice();
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#voice-status').textContent.includes('权限'));
  assert.equal(await page.locator('.manual-button').isEnabled(), true);
  assert.deepEqual(await readBills(), []);
});

test('native schedule outbox is acknowledged only after a committed bill and retries idempotently', async () => {
  await page.route('**/capacitor.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    const item = {id:'native-plan:123',kind:'bill',date:Date.now(),bill:{type:'支出',amount:8,category:'交通',remark:'原生定时',accountId:null}};
    window.plannerAcks = [];
    const planner = {configure:async()=>{},pending:async()=>({items:[item,item]}),acknowledge:async({id})=>{
      const db=await (await import('./js/ledger-api.js')).ledger.bills();
      if(db.length!==1) throw new Error('acknowledged before commit'); window.plannerAcks.push(id);
    }};
    window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>'android',registerPlugin:()=>planner};
  ` }));
  await page.reload(); await waitForReady();
  assert.equal((await readBills()).length, 1);
  assert.deepEqual(await page.evaluate(() => window.plannerAcks), ['native-plan:123', 'native-plan:123']);
  await page.reload(); await waitForReady();
  assert.equal((await readBills()).length, 1);
});

test('Android release during permission startup and late result after cancel never double fill', async () => {
  await installNativeVoice({delayed: true});
  await holdVoice();
  await page.mouse.up();
  await page.waitForFunction(() => typeof window.allowNative === 'function');
  await page.evaluate(() => window.allowNative());
  await page.waitForFunction(() => typeof window.nativeResult === 'function');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.evaluate(() => window.nativeResult('收入一百元'));
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.locator('.manual-button').isEnabled(), true);
  assert.deepEqual(await readBills(), []);
});

test('Android system permission focus change does not cancel a pending first recording', async () => {
  await installNativeVoice({delayed: true});
  await holdVoice();
  await page.waitForFunction(() => typeof window.allowNative === 'function');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.evaluate(() => window.allowNative());
  await page.waitForFunction(() => document.querySelector('.voice-button').dataset.state === 'recording');
  await page.mouse.up();
  await page.waitForFunction(() => typeof window.nativeResult === 'function');
  await page.evaluate(() => window.nativeResult('打车花了三十二元'));
  await page.locator('#bill-dialog[open]').waitFor();
  assert.equal(await page.getByLabel('金额（元）', { exact: true }).inputValue(), '32');
  assert.deepEqual(await readBills(), []);
});

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
  assert.equal(await page.getByLabel("金额（元）", { exact: true }).inputValue(), "28");
  assert.equal(await page.getByLabel("分类", { exact: true }).inputValue(), "餐饮");
  assert.equal(await page.getByLabel("备注", { exact: true }).inputValue(), "中午吃面");
  assert.deepEqual(await readBills(), []);
  await page.getByLabel("金额（元）", { exact: true }).fill("29");
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
  assert.equal(await page.getByLabel("金额（元）", { exact: true }).inputValue(), "");
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
  assert.equal(await page.getByLabel("金额（元）", { exact: true }).inputValue(), "50");
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
  assert.equal(await page.getByLabel("金额（元）", { exact: true }).inputValue(), "5000");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await holdVoice();
  await page.evaluate(() => { window.oldSpeech.result("花了20元"); window.oldSpeech.end(); });
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await page.mouse.up();
  await page.evaluate(() => { window.speech.result("收入一百元"); window.speech.end(); });
  assert.equal(await page.getByLabel("金额（元）", { exact: true }).inputValue(), "100");
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
  assert.equal(await page.getByLabel("金额（元）", { exact: true }).inputValue(), "28.5");
  assert.equal(await page.getByLabel("备注", { exact: true }).inputValue(), "午餐");
  await page.getByRole("radio", { name: "收入", exact: true }).check();
  await page.getByLabel("金额（元）", { exact: true }).fill("100.20");
  await page.getByLabel("分类", { exact: true }).selectOption("其他");
  await save();
  assert.match(await page.locator("#app-message").innerText(), /已更新/);
  assert.equal(await page.locator("#month-income").innerText(), "100.20");
  assert.equal(await page.locator("#month-expense").innerText(), "0.00");
  assert.equal((await readBills())[0].type, "收入");
  await confirmDeletion(page.getByRole("button", { name: "删除", exact: true }), false);
  assert.equal((await readBills()).length, 1);
  await confirmDeletion(page.getByRole("button", { name: "删除", exact: true }));
  await page.waitForFunction(() => document.querySelectorAll(".bill-item").length === 0);
  await waitForReady();
  assert.match(await page.locator("#app-message").innerText(), /已删除/);
  assert.deepEqual(await readBills(), []);
  assert.equal(await page.locator("#month-income").innerText(), "0.00");
  assert.match(await page.locator("#list-state").innerText(), /暂无/);
});

test("invalid amounts and empty dates stay in the form and never write", async () => {
  await openForm();
  for (const amount of ["", "0", "-1", "1.001"]) {
    await page.getByLabel("金额（元）", { exact: true }).fill(amount);
    await page.getByRole("button", { name: "确认", exact: true }).click();
    assert.equal(await page.locator("#bill-dialog[open]").count(), 1);
    assert.ok((await page.locator("#form-message").innerText()).length > 0);
    assert.deepEqual(await readBills(), []);
  }
  await page.getByLabel("金额（元）", { exact: true }).fill("1.20");
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
  assert.deepEqual(await page.locator(".bill-item time").evaluateAll((items) => items.map((item) => item.dateTime)), [dates.today, dates.today]);
  assert.deepEqual((await readBills()).map(b => b.date).sort((a, b) => b - a), [dates.today, dates.today, dates.old].map(d => new Date(`${d}T00:00:00+08:00`).getTime()));
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
  assert.equal(await page.getByLabel("金额（元）", { exact: true }).inputValue(), "28.50");
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
  await page.getByLabel("金额（元）", { exact: true }).fill("99");
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
  await confirmDeletion(page.getByRole("button", { name: "删除", exact: true }));
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
  await page.getByLabel("金额（元）", { exact: true }).fill("99");
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#form-message").textContent.includes("失败"));
  assert.equal(await page.locator("#bill-dialog[open]").count(), 1);
  assert.equal(await page.getByLabel("金额（元）", { exact: true }).inputValue(), "99");
  assert.deepEqual(await readBills(), []);
});

async function waitForOfflineShell() {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await waitForReady();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

test("offline reload serves the full shell and manual CRUD without network", async () => {
  await waitForOfflineShell();
  await openForm();
  await save();
  await context.setOffline(true);
  const response = await page.goto(`${origin}/index.html?offline=1`);
  assert.equal(response.fromServiceWorker(), true);
  await waitForReady();
  assert.equal(await page.locator(".voice-button").isVisible(), false);
  assert.match(await page.locator("#offline-status").innerText(), /离线.*手动记账/);
  assert.equal(await page.locator(".bill-item").count(), 1);
  assert.equal(await page.locator(".summary-grid").evaluate((element) => getComputedStyle(element).display), "grid");
  assert.equal(await page.evaluate(() => window.Capacitor?.getPlatform()), "web");
  const parser = await page.evaluate(async () => (await import("./js/voice-parser.js")).parseVoiceBill("吃饭花了二十八块"));
  assert.equal(parser.amount, 28);
  await openForm({ amount: "10", type: "收入" });
  await save();
  await page.locator(".bill-item-income").getByRole("button", { name: "编辑" }).click();
  await page.getByLabel("金额（元）", { exact: true }).fill("12");
  await save();
  assert.equal(await page.locator("#month-income").innerText(), "12.00");
  await confirmDeletion(page.locator(".bill-item-income").getByRole("button", { name: "删除" }));
  await page.waitForFunction(() => document.querySelectorAll(".bill-item").length === 1);
  assert.equal(await page.locator("#month-income").innerText(), "0.00");
  await page.reload();
  await waitForReady();
  assert.equal(await page.locator("#month-expense").innerText(), "28.50");
  const offlinePage = await context.newPage();
  assert.equal((await offlinePage.goto(origin)).fromServiceWorker(), true);
  await offlinePage.waitForFunction(() => !document.querySelector(".manual-button").disabled);
  await offlinePage.waitForFunction(() => !document.querySelector(".summary-amount[data-animating]"));
  assert.equal(await offlinePage.locator("#month-expense").innerText(), "28.50");
  assert.equal(await offlinePage.locator(".voice-button").isVisible(), false);
});

test("going offline cancels active voice input and reconnecting restores its entry", async () => {
  await installSpeech();
  await holdVoice();
  await context.setOffline(true);
  await page.waitForFunction(() => document.querySelector(".voice-button").hidden, null, { timeout: 2000 });
  assert.equal(await page.locator(".voice-button").isVisible(), false);
  assert.equal(await page.locator(".manual-button").isEnabled(), true);
  await page.mouse.up();
  await page.evaluate(() => { window.speech.result("收入一百元"); window.speech.end(); });
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await context.setOffline(false);
  await page.waitForFunction(() => !document.querySelector(".voice-button").hidden);
  assert.equal(await page.locator(".voice-button").isVisible(), true);
  assert.equal(await page.locator("#offline-status").isVisible(), false);
  await holdVoice();
  await page.mouse.up();
  await page.evaluate(() => { window.speech.result("收入一百元"); window.speech.end(); });
  assert.equal(await page.getByLabel("金额（元）", { exact: true }).inputValue(), "100");
  assert.deepEqual(await readBills(), []);
});

test("JSON backup reads every persisted field fresh and downloads offline without mutation", async () => {
  await waitForReady();
  const fixtures = [
    { type: "收入", amount: 123.45, category: "其他", remark: "工资 <备份>", date: 1704038400000 },
    { type: "支出", amount: 6, category: "交通", remark: "地铁", date: 1706716800000 }
  ];
  await page.evaluate(async (bills) => {
    const { addBill } = await import("./js/db.js");
    for (const bill of bills) await addBill(bill);
  }, fixtures);
  const records = await readBills();
  await context.setOffline(true);
  const downloading = page.waitForEvent("download", { timeout: 3000 });
  await page.getByRole("button", { name: "导出备份", exact: true }).click({ timeout: 2000 });
  const download = await downloading;
  assert.match(download.suggestedFilename(), /^voice-account-bills-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(backup.length, 2);
  assert.deepEqual(backup.map(({ id, createdAt, ...bill }) => bill), [fixtures[1], fixtures[0]]);
  assert.deepEqual(backup, records);
  assert.deepEqual(await readBills(), records);
  assert.match(await page.locator("#app-message").innerText(), /备份.*生成/);
  assert.equal(await page.getByText("数据仅保存在本地浏览器，清除缓存会丢失，建议定期导出备份", { exact: true }).isVisible(), true);
});

test("empty backup is valid JSON and read failure reports an error without downloading", async () => {
  await waitForReady();
  const downloading = page.waitForEvent("download", { timeout: 3000 });
  await page.getByRole("button", { name: "导出备份", exact: true }).click({ timeout: 2000 });
  assert.deepEqual(JSON.parse(await readFile(await (await downloading).path(), "utf8")), []);
  await page.evaluate(() => {
    IDBDatabase.prototype.transaction = () => { throw new Error("Forced backup read failure"); };
  });
  let downloaded = false;
  page.on("download", () => { downloaded = true; });
  await page.getByRole("button", { name: "导出备份", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#app-message").dataset.error === "true");
  assert.match(await page.locator("#app-message").innerText(), /导出失败/);
  assert.equal(downloaded, false);
  assert.equal(await page.locator(".manual-button").isEnabled(), true);
});

test("date groups use local calendar days and disappear when their last bill is removed", async () => {
  await page.clock.install({ time: new Date("2026-11-01T08:00:00+08:00") });
  await openForm({ amount: "1", date: "2026-10-30" });
  await save();
  await openForm({ amount: "2", date: "2026-10-31" });
  await save();
  await openForm({ amount: "3", date: "2026-11-01" });
  await save();
  assert.deepEqual(await page.locator('.bill-group-title').allTextContents(), ['今天']);
  await page.locator('#open-search').click();
  await page.locator('#search-form [type=submit]').click();
  assert.deepEqual(await page.locator(".bill-group-title").allTextContents(), ["今天", "昨天", "更早"]);
  assert.deepEqual(await page.locator(".bill-group").evaluateAll((groups) => groups.map((group) => [...group.querySelectorAll("time")].map((time) => time.dateTime))), [["2026-11-01"], ["2026-10-31"], ["2026-10-30"]]);
  await confirmDeletion(page.locator(".bill-group").first().getByRole("button", { name: "删除" }));
  await page.waitForFunction(() => document.querySelectorAll(".bill-item").length === 2);
  assert.deepEqual(await page.locator(".bill-group-title").allTextContents(), ["昨天", "更早"]);
});

test("dialog follows a reduced visual viewport and keeps focused fields reachable", async () => {
  await openForm();
  await page.evaluate(() => {
    Object.defineProperties(visualViewport, {
      height: { configurable: true, value: 340 },
      offsetTop: { configurable: true, value: 70 }
    });
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.getByLabel("备注", { exact: true }).focus();
  await page.waitForFunction(() => {
    const bounds = document.querySelector("#bill-dialog").getBoundingClientRect();
    return bounds.top >= 70 && bounds.bottom <= 410;
  }, null, { timeout: 2000 });
  const field = await page.getByLabel("备注", { exact: true }).boundingBox();
  assert.ok(field.y >= 70 && field.y + field.height <= 410);
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await page.locator("#bill-dialog").waitFor({ state: "hidden" });
  assert.equal((await readBills()).length, 1);
});

test("v1 database upgrades without losing bill fields or the auto-increment key", async () => {
  await context.close();
  context = await browser.newContext({ viewport: { width: 375, height: 812 }, timezoneId: "Asia/Shanghai" });
  page = await context.newPage();
  await page.goto(`${origin}/manifest.json`);
  const legacy = { id: 17, type: "支出", amount: 36.5, category: "餐饮", remark: "升级前账单", date: 1793448000000, createdAt: 1793448000123 };
  await page.evaluate((bill) => new Promise((resolve, reject) => {
    const request = indexedDB.open("voice-account-db", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("bills", { keyPath: "id", autoIncrement: true });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("bills", "readwrite");
      transaction.objectStore("bills").add(bill);
      transaction.oncomplete = () => { db.close(); resolve(); };
    };
  }), legacy);
  await page.goto(origin);
  await waitForReady();
  assert.deepEqual(await readBills(), [legacy]);
  const schema = await page.evaluate(async () => {
    const db = await (await import("./js/db.js")).initDB();
    const store = db.transaction("bills").objectStore("bills");
    return { version: db.version, stores: [...db.objectStoreNames], keyPath: store.keyPath, autoIncrement: store.autoIncrement };
  });
  assert.equal(schema.version, 3);
  assert.ok(schema.stores.includes('bills') && schema.stores.includes('budgets') && schema.stores.includes('accounts'));
  assert.equal(schema.keyPath, 'id');
  assert.equal(schema.autoIncrement, true);
  await openForm();
  await save();
  assert.ok((await readBills()).some((bill) => bill.id === 18));
});

test("budget persistence is independent, validates values and survives reload without altering bills", async () => {
  await openForm();
  await save();
  const before = await readBills();
  const results = await page.evaluate(async () => {
    const api = await import("./js/budget-db.js");
    const initial = await api.getBudget();
    await api.saveBudget({ total: 1000.5, categories: { 餐饮: 300, 交通: 50 } });
    const saved = await api.getBudget();
    let rejected = 0;
    for (const total of [-1, 0, NaN, Infinity, 1.001, 0.0000000001, 1.0000000001]) {
      try { await api.saveBudget({ total, categories: {} }); } catch { rejected += 1; }
    }
    return { initial, saved, rejected, after: await api.getBudget() };
  });
  assert.deepEqual(results.initial, { total: null, categories: {} });
  assert.deepEqual(results.saved, { total: 1000.5, categories: { 餐饮: 300, 交通: 50 } });
  assert.equal(results.rejected, 7);
  assert.deepEqual(results.after, results.saved);
  await page.reload();
  await waitForReady();
  assert.deepEqual(await page.evaluate(async () => (await import("./js/budget-db.js")).getBudget()), results.saved);
  assert.deepEqual(await readBills(), before);
});

async function openBudget() {
  await waitForReady();
  await page.locator("#open-budget").click({ timeout: 2000 });
  await page.locator("#budget-dialog[open]").waitFor();
}

async function saveBudgetForm() {
  await page.locator("#budget-form").getByRole("button", { name: "保存预算" }).click();
  await page.locator("#budget-dialog").waitFor({ state: "hidden" });
}

test("budget form persists limits, validates and warns only for this month's expense categories", async () => {
  await openBudget();
  await page.getByLabel("月度总预算（元）").fill("0");
  await page.locator("#budget-form").getByRole("button", { name: "保存预算" }).click();
  assert.match(await page.locator("#budget-message").innerText(), /大于 0/);
  await page.getByLabel("月度总预算（元）").fill("1000");
  await page.getByLabel("餐饮预算（元）").fill("20");
  await saveBudgetForm();
  await openForm({ amount: "25" });
  await save();
  assert.match(await page.locator("#budget-overview").innerText(), /975\.00/);
  assert.match(await page.locator(".bill-item.budget-exceeded").innerText(), /餐饮.*|分类超支/);
  await openForm({ amount: "6", category: "交通" });
  await save();
  await openForm({ amount: "10", type: "收入" });
  await save();
  await openForm({ amount: "99", date: "2020-01-01" });
  await save();
  assert.equal(await page.locator(".bill-item.budget-exceeded").count(), 1);
  await page.reload();
  await openBudget();
  assert.equal(await page.getByLabel("餐饮预算（元）").inputValue(), "20");
  await page.getByLabel("餐饮预算（元）").fill("");
  await saveBudgetForm();
  assert.equal(await page.locator(".bill-item.budget-exceeded").count(), 0);
  await openBudget();
  await page.getByLabel("月度总预算（元）").fill("2");
  await page.locator("#cancel-budget").click();
  assert.equal((await page.evaluate(async () => (await import("./js/budget-db.js")).getBudget())).total, 1000);
});

test("statistics charts render pixels, select slices and legends, and filter monthly expense details", async () => {
  await openForm({ amount: "30", remark: "当月餐饮" });
  await save();
  await openForm({ amount: "10", category: "交通", remark: "当月地铁" });
  await save();
  await openForm({ amount: "100", type: "收入", remark: "收入不进饼图" });
  await save();
  await openForm({ amount: "99", date: "2020-01-01", remark: "历史不进明细" });
  await save();
  await page.getByRole("tab", { name: "统计", exact: true }).click({ timeout: 2000 });
  assert.equal(await page.locator("#home-view").isVisible(), false);
  for (const id of ["#category-chart", "#trend-chart"]) {
    await page.waitForFunction((id) => {
      const canvas = document.querySelector(id);
      return canvas.width > 0 && canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0);
    }, id);
  }
  assert.match(await page.locator("#category-legend").innerText(), /75%/);
  await page.locator('#category-legend button[data-category="餐饮"]').click();
  assert.match(await page.locator("#category-details").innerText(), /当月餐饮/);
  assert.doesNotMatch(await page.locator("#category-details").innerText(), /收入不进饼图|历史不进明细|当月地铁/);
  // The 25% traffic slice is at the upper-left of a clockwise pie starting at 12 o'clock.
  await page.locator("#category-chart").scrollIntoViewIfNeeded();
  const bounds = await page.locator("#category-chart").boundingBox();
  await page.mouse.click(bounds.x + bounds.width * 0.28, bounds.y + bounds.height * 0.28);
  assert.match(await page.locator("#category-details").innerText(), /当月地铁/);
  assert.doesNotMatch(await page.locator("#category-details").innerText(), /当月餐饮/);
  await page.getByRole("tab", { name: "首页", exact: true }).click();
  assert.equal(await page.locator(".manual-button").isVisible(), true);
});

test("failed budget saves preserve values and limits; budget read failures do not block billing", async () => {
  await openBudget();
  await page.getByLabel("月度总预算（元）").fill("100");
  await page.evaluate(() => {
    window.originalTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (name, mode, ...rest) {
      if (name === "budgets" && mode === "readwrite") throw new Error("Forced budget save failure");
      return window.originalTransaction.call(this, name, mode, ...rest);
    };
  });
  await page.locator("#budget-form").getByRole("button", { name: "保存预算" }).click();
  await page.waitForFunction(() => document.querySelector("#budget-message").textContent.includes("失败"));
  assert.equal(await page.getByLabel("月度总预算（元）").inputValue(), "100");
  assert.equal((await page.evaluate(async () => (await import("./js/budget-db.js")).getBudget())).total, null);
  await page.locator("#cancel-budget").click();
  await page.addInitScript(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (name, mode, ...rest) {
      if (name === "budgets" && mode === "readonly") throw new Error("Forced budget read failure");
      return original.call(this, name, mode, ...rest);
    };
  });
  await page.reload();
  await openForm();
  await save();
  assert.equal((await readBills()).length, 1);
  assert.match(await page.locator("#budget-overview").innerText(), /预算.*加载失败/);
});

test("month rollover retains budget limits with no carryover and refreshes an open page", async () => {
  await page.clock.install({ time: new Date("2026-01-31T23:59:50+08:00") });
  await openBudget();
  await page.getByLabel("月度总预算（元）").fill("100");
  await saveBudgetForm();
  await openForm({ amount: "120" });
  await save();
  assert.match(await page.locator("#budget-overview").innerText(), /超支[\s\S]*20\.00/);
  await page.clock.fastForward(20000);
  await page.waitForFunction(() => document.querySelector("#month-expense").textContent === "0.00");
  assert.match(await page.locator("#budget-overview").innerText(), /100\.00/);
  assert.equal((await page.evaluate(async () => (await import("./js/budget-db.js")).getBudget())).total, 100);
});

test("budgets and Canvas statistics remain available on an offline reload", async () => {
  await waitForOfflineShell();
  await openBudget();
  await page.getByLabel("月度总预算（元）").fill("100");
  await saveBudgetForm();
  await openForm({ amount: "20" });
  await save();
  await context.setOffline(true);
  await page.reload();
  await waitForReady();
  assert.match(await page.locator("#budget-overview").innerText(), /80\.00/);
  await page.getByRole("tab", { name: "统计", exact: true }).click();
  assert.match(await page.locator("#category-legend").innerText(), /20\.00/);
  await page.getByRole("tab", { name: "首页", exact: true }).click();
  await openBudget();
  await page.getByLabel("月度总预算（元）").fill("200");
  await saveBudgetForm();
  assert.match(await page.locator("#budget-overview").innerText(), /180\.00/);
});

test("summary amounts fit on one line across small mobile and desktop viewports", async () => {
  await openForm({ amount: "8500", type: "收入" });
  await save();
  await openForm({ amount: "2533.50" });
  await save();
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    await page.waitForFunction(() => [...document.querySelectorAll(".summary-amount")].every((element) => {
      const bounds = element.getBoundingClientRect();
      const card = element.closest(".summary-card").getBoundingClientRect();
      return bounds.height <= parseFloat(getComputedStyle(element).fontSize) * 1.4 && bounds.right <= card.right - 8;
    }), null, { timeout: 2000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
});

test("budget fields follow the keyboard viewport and reduced motion disables decorative animations", async () => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openForm();
  await save();
  assert.equal(await page.locator(".bill-item").evaluate((element) => getComputedStyle(element).animationName), "none");
  await openBudget();
  await page.evaluate(() => {
    Object.defineProperties(visualViewport, {
      height: { configurable: true, value: 340 }, offsetTop: { configurable: true, value: 70 }
    });
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.getByLabel("其他预算（元）").focus();
  await page.waitForFunction(() => {
    const field = document.querySelector('[name="其他"]').getBoundingClientRect();
    return field.top >= 70 && field.bottom <= 410;
  }, null, { timeout: 2000 });
  await page.locator("#cancel-budget").click();
});

test("legacy database console self-test remains isolated and passes all checks", async () => {
  await waitForReady();
  const before = await readBills();
  const result = await page.evaluate(async () => (await import("./js/db.selftest.js")).runDBSelfTest());
  assert.equal(result.passed, 17);
  assert.deepEqual(await readBills(), before);
});

test("an aborted budget transaction keeps all previously committed limits intact", async () => {
  await waitForReady();
  const result = await page.evaluate(async () => {
    const api = await import("./js/budget-db.js");
    const original = { total: 1000, categories: { 餐饮: 300, 交通: 50 } };
    await api.saveBudget(original);
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (this.name === "budgets") this.transaction.abort();
      return request;
    };
    let rejected = false;
    try { await api.saveBudget({ total: 2000, categories: { 购物: 500 } }); }
    catch { rejected = true; }
    finally { IDBObjectStore.prototype.put = put; }
    return { rejected, saved: await api.getBudget() };
  });
  assert.equal(result.rejected, true);
  assert.deepEqual(result.saved, { total: 1000, categories: { 餐饮: 300, 交通: 50 } });
});

test("historical month selection filters charts and details without changing current budgets or records", async () => {
  await page.clock.install({ time: new Date("2026-01-15T12:00:00+08:00") });
  await openBudget();
  await page.getByLabel("月度总预算（元）").fill("100");
  await saveBudgetForm();
  await openForm({ amount: "20", date: "2026-01-15", remark: "一月餐饮" });
  await save();
  await openForm({ amount: "75", date: "2025-12-31", remark: "十二月餐饮" });
  await save();
  await openForm({ amount: "200", type: "收入", date: "2025-12-01" });
  await save();
  const before = await readBills();
  await page.getByRole("tab", { name: "统计", exact: true }).click();
  assert.equal(await page.locator("#next-month").isDisabled(), true);
  await page.getByRole("button", { name: "上个月", exact: true }).click({ timeout: 2000 });
  assert.equal(await page.locator("#statistics-month").innerText(), "2025年12月");
  assert.equal(await page.locator("#category-total").innerText(), "¥75.00");
  await page.locator('#category-legend button[data-category="餐饮"]').click();
  assert.match(await page.locator("#category-selection").innerText(), /75\.00[\s\S]*100%/);
  assert.match(await page.locator("#category-details").innerText(), /十二月餐饮/);
  assert.doesNotMatch(await page.locator("#category-details").innerText(), /一月餐饮/);
  assert.deepEqual(await page.locator("#trend-data tr td:first-child").allTextContents(), ["2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12"]);
  await page.getByRole("tab", { name: "首页", exact: true }).click();
  assert.match(await page.locator("#budget-overview").innerText(), /80\.00/);
  assert.equal(await page.locator("#month-expense").innerText(), "20.00");
  assert.deepEqual(await readBills(), before);
  await page.getByRole("tab", { name: "统计", exact: true }).click();
  await page.locator("#previous-month").click();
  assert.equal(await page.locator("#category-total").innerText(), "¥0.00");
  assert.equal(await page.locator("#chart-empty").isVisible(), true);
  await page.locator("#next-month").click();
  await page.locator("#next-month").click();
  assert.equal(await page.locator("#statistics-month").innerText(), "2026年1月");
  assert.equal(await page.locator("#next-month").isDisabled(), true);
});

test("custom deletion is modal, keyboard-cancellable and deletes only after confirmation", async () => {
  await openForm({ remark: '<img src=x onerror="window.injected=true">' });
  await save();
  let nativeDialogs = 0;
  page.on("dialog", async (dialog) => { nativeDialogs += 1; await dialog.dismiss(); });
  await page.locator('[data-action="delete"]').click();
  await page.locator("#delete-dialog[open]").waitFor({ timeout: 2000 });
  assert.match(await page.locator("#delete-description").innerText(), /餐饮[\s\S]*28\.50/);
  assert.equal((await readBills()).length, 1);
  await page.keyboard.press("Escape");
  await page.locator("#delete-dialog").waitFor({ state: "hidden" });
  assert.equal((await readBills()).length, 1);
  await confirmDeletion(page.locator('[data-action="delete"]'));
  await waitForReady();
  await page.waitForFunction(() => document.querySelectorAll(".bill-item").length === 0);
  assert.deepEqual(await readBills(), []);
  assert.equal(nativeDialogs, 0);
  assert.equal(await page.locator("#empty-bills svg").isVisible(), true);
});

test("amount animation counts upward, finishes exactly, and skips motion when requested", async () => {
  await waitForReady();
  const samples = await page.evaluate(async () => {
    const { animateAmount } = await import("./js/ui.js");
    const element = document.querySelector("#month-income");
    const animation = animateAmount(element, 1234.56);
    const first = element.textContent;
    await new Promise((resolve) => setTimeout(resolve, 150));
    const middle = element.textContent;
    await animation;
    return { first, middle, last: element.textContent };
  });
  assert.equal(samples.first, "0.00");
  assert.ok(Number(samples.middle.replaceAll(",", "")) > 0 && Number(samples.middle.replaceAll(",", "")) < 1234.56);
  assert.equal(samples.last, "1,234.56");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.evaluate(async () => {
    const { animateAmount } = await import("./js/ui.js");
    const element = document.querySelector("#month-income");
    await animateAmount(element, 0.3);
    return element.textContent;
  }), "0.30");
});

test("monthly detail disclosure supports rapid reversals and accessible expanded state", async () => {
  await waitForReady();
  await page.getByRole("tab", { name: "统计", exact: true }).click();
  const toggle = page.locator("#trend-disclosure");
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  await page.locator("#trend-data").waitFor({ state: "visible" });
  await toggle.click();
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  await toggle.click();
  await page.locator("#trend-data").waitFor({ state: "hidden" });
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
});

test("selected pie slice protrudes with working hit testing and trend has a filled area", async () => {
  await openForm({ amount: "20" });
  await save();
  await openForm({ amount: "20", category: "交通" });
  await save();
  await page.getByRole("tab", { name: "统计", exact: true }).click();
  const sample = () => page.locator("#category-chart").evaluate((canvas) => {
    const x = Math.round(canvas.width * 0.91);
    const y = Math.round(canvas.height * 0.5);
    return [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
  });
  const before = await sample();
  await page.locator('#category-legend button[data-category="餐饮"]').click();
  assert.notDeepEqual(await sample(), before);
  const selectedPixel = await sample();
  assert.ok(selectedPixel[0] > selectedPixel[1] && selectedPixel[1] > selectedPixel[2] && selectedPixel[3] > 150, 'selected warm category gradient must be painted');
  const bounds = await page.locator("#category-chart").boundingBox();
  await page.mouse.click(bounds.x + bounds.width * 0.91, bounds.y + bounds.height * 0.5);
  assert.equal(await page.locator('#category-legend button[data-category="餐饮"]').getAttribute("aria-pressed"), "true");
  const area = await page.locator("#trend-chart").evaluate((canvas) => {
    const ratio = canvas.width / canvas.getBoundingClientRect().width;
    return [...canvas.getContext("2d").getImageData(Math.round(canvas.width * 0.9), Math.round(135 * ratio), 1, 1).data];
  });
  assert.ok(area[3] > 0, "area under trend line should be painted, not only the line/grid");
});

test("historical statistics work offline and stay within small-screen boundaries", async () => {
  await page.clock.install({ time: new Date("2026-01-15T12:00:00+08:00") });
  await waitForOfflineShell();
  await openForm({ amount: "12345.67", date: "2025-12-31", remark: "历史账单与较长的备注文字" });
  await save();
  await context.setOffline(true);
  await page.reload();
  await waitForReady();
  await page.getByRole("tab", { name: "统计", exact: true }).click();
  await page.locator("#previous-month").click();
  assert.equal(await page.locator("#category-total").innerText(), "¥12,345.67");
  await page.locator('#category-legend button[data-category="餐饮"]').click();
  assert.match(await page.locator("#category-details").innerText(), /历史账单/);
  await page.locator("#trend-disclosure").click();
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    const issues = await page.evaluate(() => [...document.querySelectorAll("#category-legend button, #category-selection, #detail-list li, #trend-panel, .month-switcher")].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.left < 0 || box.right > innerWidth || element.scrollWidth > element.clientWidth + 1;
    }).map((element) => element.id || element.className || element.tagName));
    assert.deepEqual(issues, [], `overflow at ${width}px`);
  }
});

test("a newer amount animation cancels the previous target without stale final values", async () => {
  await waitForReady();
  const value = await page.evaluate(async () => {
    const { animateAmount } = await import("./js/ui.js");
    const element = document.querySelector("#month-income");
    const old = animateAmount(element, 9000);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const current = animateAmount(element, 12.34);
    await Promise.all([old, current]);
    return { text: element.textContent, running: element.dataset.animating };
  });
  assert.deepEqual(value, { text: "12.34", running: undefined });
});

test("resizing during a summary animation still fits its final formatted amount", async () => {
  await waitForReady();
  await page.evaluate(async () => {
    const { animateAmount } = await import("./js/ui.js");
    window.summaryAnimation = animateAmount(document.querySelector("#month-income"), 12345678.90);
  });
  await page.waitForTimeout(150);
  await page.setViewportSize({ width: 320, height: 812 });
  await page.evaluate(() => window.summaryAnimation);
  assert.equal(await page.locator("#month-income").innerText(), "12,345,678.90");
  assert.equal(await page.locator("#month-income").evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true);
});

test("a single-category pie has no artificial radial divider through its center", async () => {
  await openForm({ amount: "20" });
  await save();
  await page.getByRole("tab", { name: "统计", exact: true }).click();
  const pixel = await page.locator("#category-chart").evaluate((canvas) =>
    [...canvas.getContext("2d").getImageData(Math.round(canvas.width / 2), Math.round(canvas.height * 0.25), 1, 1).data]);
  assert.ok(pixel[0] > pixel[1] && pixel[1] > pixel[2] && pixel[3] > 150, 'single slice must be filled across the former radial divider');
});

test("bill signs and large amounts remain together on narrow screens", async () => {
  await openForm({ amount: "8500", type: "收入" });
  await save();
  await openForm({ amount: "12345678.90" });
  await save();
  await page.setViewportSize({ width: 320, height: 812 });
  await page.waitForFunction(() => [...document.querySelectorAll(".bill-amount")].every((element) => {
    const style = getComputedStyle(element);
    return element.getBoundingClientRect().height <= parseFloat(style.fontSize) * 1.6 && element.scrollWidth <= element.clientWidth + 1;
  }), null, { timeout: 2000 });
});

test("rapid successive bill refreshes fit the new total rather than the previous animation target", async () => {
  await page.setViewportSize({ width: 320, height: 812 });
  await openForm({ amount: "1" });
  await page.evaluate(() => document.querySelector("#bill-form").requestSubmit());
  await page.waitForFunction(() => !document.querySelector(".manual-button").disabled);
  await page.evaluate(() => {
    document.querySelector(".manual-button").click();
    document.querySelector("#bill-amount").value = "12345678.90";
    document.querySelector("#bill-form").requestSubmit();
  });
  await waitForReady();
  assert.equal(await page.locator("#month-expense").innerText(), "12,345,679.90");
  assert.equal(await page.locator("#month-expense").evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true);
});
