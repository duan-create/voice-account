import { initDB, addBill, getBills, updateBill, deleteBill, getMonthSummary } from "./db.js";
import { setupVoiceInput } from "./voice.js";

const manualButton = document.querySelector(".manual-button");
const voiceButton = document.querySelector(".voice-button");
const voiceStatus = document.querySelector("#voice-status");
const offlineStatus = document.querySelector("#offline-status");
const exportButton = document.querySelector("#export-backup");
const dialog = document.querySelector("#bill-dialog");
const form = document.querySelector("#bill-form");
const fields = form.elements;
const formMessage = document.querySelector("#form-message");
const appMessage = document.querySelector("#app-message");
const list = document.querySelector(".bill-list");
const listState = document.querySelector("#list-state");
const incomeAmount = document.querySelector("#month-income");
const expenseAmount = document.querySelector("#month-expense");
const money = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let bills = [];
let editingId = null;
let busy = false;
let ready = false;
let voiceActive = false;

function localDate(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function showMessage(message, error = false) {
  appMessage.textContent = message;
  appMessage.dataset.error = String(error);
}

function setBusy(value) {
  busy = value;
  manualButton.disabled = value || !ready || voiceActive;
  voiceButton.disabled = value || !ready || !navigator.onLine;
  exportButton.disabled = value || !ready || voiceActive;
  fields.namedItem("form-fields").disabled = value;
  list.querySelectorAll("button").forEach((button) => { button.disabled = value || !ready || voiceActive; });
  form.setAttribute("aria-busy", String(value));
}

function renderBills(records) {
  const fragment = document.createDocumentFragment();
  const template = document.querySelector("#bill-template");
  const today = localDate();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = localDate(yesterday);
  const groups = new Map([ ["今天", []], ["昨天", []], ["更早", []] ]);
  for (const bill of records) {
    const item = template.content.firstElementChild.cloneNode(true);
    item.dataset.id = bill.id;
    item.classList.toggle("bill-item-income", bill.type === "收入");
    item.querySelector(".bill-category").textContent = bill.category;
    const date = item.querySelector("time");
    date.dateTime = localDate(bill.date);
    date.textContent = date.dateTime;
    item.querySelector(".bill-amount").textContent = `${bill.type === "收入" ? "+" : "-"}¥${money.format(bill.amount)}`;
    item.querySelector(".bill-type").textContent = bill.type;
    const remark = item.querySelector(".bill-remark");
    remark.textContent = bill.remark;
    remark.hidden = !bill.remark;
    const group = date.dateTime === today ? "今天" : date.dateTime === yesterdayDate ? "昨天" : "更早";
    groups.get(group).push(item);
  }
  for (const [title, items] of groups) {
    if (!items.length) continue;
    const group = document.createElement("section");
    group.className = "bill-group";
    group.setAttribute("aria-label", title);
    const heading = document.createElement("h3");
    heading.className = "bill-group-title";
    heading.textContent = title;
    const rows = document.createElement("ul");
    rows.append(...items);
    group.append(heading, rows);
    fragment.append(group);
  }
  list.replaceChildren(fragment);
}

async function refreshBills() {
  try {
    const [records, summary] = await Promise.all([getBills(), getMonthSummary()]);
    renderBills(records);
    bills = records;
    incomeAmount.textContent = money.format(summary.income);
    expenseAmount.textContent = money.format(summary.expense);
    listState.textContent = records.length ? "" : "暂无账单";
    listState.hidden = records.length > 0;
    ready = true;
  } catch (error) {
    // Do not leave stale totals or actionable stale rows after a failed refresh.
    ready = false;
    bills = [];
    list.replaceChildren();
    incomeAmount.textContent = "--";
    expenseAmount.textContent = "--";
    listState.textContent = "账单加载失败，请刷新页面重试。";
    listState.hidden = false;
    throw error;
  }
}

function openForm(bill = null) {
  if (busy || !ready || voiceActive) return;
  form.reset();
  editingId = bill?.id ?? null;
  document.querySelector("#form-title").textContent = bill ? "编辑账单" : "手动记账";
  fields.namedItem("type").value = bill?.type ?? "支出";
  fields.namedItem("amount").value = bill?.amount ?? "";
  fields.namedItem("category").value = bill?.category ?? "餐饮";
  fields.namedItem("remark").value = bill?.remark ?? "";
  fields.namedItem("date").value = localDate(bill?.date);
  formMessage.textContent = "";
  dialog.showModal();
  updateDialogViewport();
  fields.namedItem("amount").focus();
}

setupVoiceInput({
  button: voiceButton,
  status: voiceStatus,
  isAvailable: () => navigator.onLine && ready && !busy && !dialog.open,
  setActive(active) {
    voiceActive = active;
    setBusy(busy);
  },
  onDraft(draft) {
    openForm();
    if (!dialog.open) return;
    fields.namedItem("type").value = draft.type ?? "";
    fields.namedItem("amount").value = draft.amount ?? "";
    fields.namedItem("category").value = draft.category;
    fields.namedItem("remark").value = draft.remark;
    document.querySelector("#form-title").textContent = "确认语音账单";
    const messages = [];
    if (draft.amount === null) messages.push("未识别到金额，请手动补充");
    if (draft.type === null) messages.push("收支类型不明确，请手动选择");
    formMessage.textContent = messages.join("；");
  }
});

function updateConnection() {
  if (!navigator.onLine && voiceActive) voiceButton.dispatchEvent(new Event("pointercancel"));
  voiceButton.hidden = !navigator.onLine;
  voiceStatus.hidden = !navigator.onLine;
  offlineStatus.hidden = navigator.onLine;
  setBusy(busy);
}

window.addEventListener("online", updateConnection);
window.addEventListener("offline", updateConnection);
updateConnection();

function updateDialogViewport() {
  if (!dialog.open) return;
  const viewport = window.visualViewport;
  dialog.style.setProperty("--dialog-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
  dialog.style.setProperty("--dialog-viewport-top", `${viewport?.offsetTop ?? 0}px`);
  requestAnimationFrame(() => {
    if (dialog.open && form.contains(document.activeElement)) {
      document.activeElement.scrollIntoView({ block: "nearest" });
    }
  });
}

window.visualViewport?.addEventListener("resize", updateDialogViewport);
window.visualViewport?.addEventListener("scroll", updateDialogViewport);
window.addEventListener("resize", updateDialogViewport);
form.addEventListener("focusin", updateDialogViewport);

exportButton.addEventListener("click", async () => {
  if (busy || !ready || voiceActive) return;
  setBusy(true);
  try {
    const records = await getBills();
    const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `voice-account-bills-${localDate()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    // Leave time for the browser to begin reading the download before releasing its URL.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    showMessage("备份文件已生成，请妥善保存下载的 JSON 文件。");
  } catch (error) {
    console.error("[Bills] Export failed:", error);
    showMessage("导出失败，请重试；本地账单未受影响。", true);
  } finally {
    setBusy(false);
  }
});

manualButton.addEventListener("click", () => openForm());
document.querySelector("#cancel-bill").addEventListener("click", () => {
  if (!busy) dialog.close();
});
dialog.addEventListener("cancel", (event) => {
  if (busy) event.preventDefault();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !ready) return;
  formMessage.textContent = "";
  const amount = Number(fields.namedItem("amount").value);
  if (!Number.isFinite(amount) || amount <= 0 || !fields.namedItem("amount").checkValidity()
    || !Number.isSafeInteger(Math.round(amount * 100))) {
    formMessage.textContent = "请输入大于 0 且最多两位小数的有效金额。";
    fields.namedItem("amount").focus();
    return;
  }
  const dateValue = fields.namedItem("date").value;
  const date = new Date(`${dateValue}T00:00:00`).getTime();
  if (!dateValue || !Number.isFinite(date) || !fields.namedItem("date").checkValidity()) {
    formMessage.textContent = "请选择有效日期。";
    fields.namedItem("date").focus();
    return;
  }
  if (!form.checkValidity()) {
    formMessage.textContent = "请选择收支类型和分类。";
    return;
  }
  const bill = {
    type: fields.namedItem("type").value,
    amount,
    category: fields.namedItem("category").value,
    remark: fields.namedItem("remark").value.trim(),
    date
  };
  const editing = editingId !== null;
  let committed = false;
  setBusy(true);
  try {
    if (editing) {
      const updated = await updateBill(editingId, bill);
      if (!updated) throw new Error("Bill no longer exists.");
    } else {
      await addBill(bill);
    }
    committed = true;
    dialog.close();
    await refreshBills();
    showMessage(editing ? "账单已更新。" : "记账成功。");
  } catch (error) {
    console.error("[Bills] Save failed:", error);
    if (committed) {
      showMessage("账单已保存，但刷新失败，请刷新页面；请勿重复记账。", true);
    } else {
      formMessage.textContent = "保存失败，请重试；已填写内容已保留。";
    }
  } finally {
    setBusy(false);
  }
});

list.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || busy || !ready) return;
  const bill = bills.find((item) => item.id === Number(button.closest(".bill-item").dataset.id));
  if (!bill) return;
  if (button.dataset.action === "edit") {
    openForm(bill);
    return;
  }
  if (!window.confirm(`确认删除这笔${bill.category}账单（¥${money.format(bill.amount)}）？`)) {
    showMessage("已取消删除。");
    return;
  }
  let committed = false;
  setBusy(true);
  try {
    await deleteBill(bill.id);
    committed = true;
    await refreshBills();
    showMessage("账单已删除。");
  } catch (error) {
    console.error("[Bills] Delete failed:", error);
    showMessage(committed ? "账单已删除，但刷新失败，请刷新页面。" : "删除失败，账单未删除，请重试。", true);
  } finally {
    setBusy(false);
  }
});

try {
  setBusy(true);
  const db = await initDB();
  console.info(`[DB] Initialized: ${db.name}, version ${db.version}`);
  await refreshBills();
} catch (error) {
  console.error("[DB] Initialization or loading failed:", error);
  listState.textContent = "账单加载失败，请刷新页面重试。";
  showMessage("数据加载失败，暂时无法记账，请刷新页面重试。", true);
} finally {
  setBusy(false);
}

if (new URLSearchParams(location.search).get("db-self-test") === "1") {
  try {
    const { runDBSelfTest } = await import("./db.selftest.js");
    await runDBSelfTest();
  } catch (error) {
    console.error("[DB self-test] Failed:", error);
  }
}
