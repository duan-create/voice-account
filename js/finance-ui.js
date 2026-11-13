import { getBudget, saveBudget } from "./budget-db.js";
import { CATEGORIES, calculateStatistics, calculateBudgetUsage, categoryFor, money, monthKey } from "./finance.js";
import { setupCharts } from "./charts.js";
import { setupDisclosure } from "./ui.js";

export function setupFinanceUI({ showMessage, updateDialogViewport }) {
  const budgetDialog = document.querySelector("#budget-dialog");
  const budgetForm = document.querySelector("#budget-form");
  const budgetMessage = document.querySelector("#budget-message");
  const budgetButton = document.querySelector("#open-budget");
  const overview = document.querySelector("#budget-overview");
  const categoryBudgets = document.querySelector("#category-budgets");
  const legend = document.querySelector("#category-legend");
  const details = document.querySelector("#category-details");
  const tabs = [...document.querySelectorAll("[role=tab]")];
  const previousMonth = document.querySelector("#previous-month");
  const nextMonth = document.querySelector("#next-month");
  let records = [];
  let statistics = calculateStatistics([]);
  let currentStatistics = statistics;
  let selectedMonth = null;
  let settings = null;
  let selected = null;
  let available = false;
  let saving = false;

  const charts = setupCharts(document.querySelector("#category-chart"), document.querySelector("#trend-chart"), selectCategory);
  setupDisclosure(document.querySelector("#trend-disclosure"), document.querySelector("#trend-panel"));
  function buildBudgetFields() {
  document.querySelector('#budget-category-fields').replaceChildren();
  for (const [index, category] of CATEGORIES.entries()) {
    const field = document.createElement("div");
    field.className = "form-field";
    const label = document.createElement("label");
    label.htmlFor = `budget-category-${index}`;
    label.textContent = `${category.name}预算（元）`;
    const input = document.createElement("input");
    Object.assign(input, { id: label.htmlFor, name: category.name, type: "number", inputMode: "decimal", min: "0.01", step: "0.01", placeholder: "未设置" });
    field.append(label, input);
    document.querySelector("#budget-category-fields").append(field);
  }
  }
  buildBudgetFields();

  function selectCategory(name) {
    selected = name;
    renderDetails();
    for (const button of legend.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.category === name));
    charts.update(statistics, selected);
  }

  function renderDetails() {
    details.hidden = !selected;
    const selection = document.querySelector("#category-selection");
    selection.hidden = !selected;
    if (!selected) return;
    const category = statistics.categories.find((item) => item.name === selected);
    const share = statistics.expense ? Math.round(category.amount / statistics.expense * 100) : 0;
    selection.style.setProperty("--category-color", category.color);
    document.querySelector("#selection-name").textContent = `${category.icon} ${selected}`;
    document.querySelector("#selection-amount").textContent = `¥${money.format(category.amount)}`;
    document.querySelector("#selection-percent").textContent = `${share}%`;
    document.querySelector("#details-title").textContent = `${selected} · ${statistics.key} 支出`;
    const list = document.querySelector("#detail-list");
    const rows = records.filter((bill) => bill.type === "支出" && monthKey(new Date(bill.date)) === statistics.key && categoryFor(bill.category).name === selected);
    list.replaceChildren(...rows.map((bill) => {
      const row = document.createElement("li");
      const description = document.createElement("div");
      const title = document.createElement("span");
      title.textContent = bill.remark || bill.category;
      const date = document.createElement("time");
      date.textContent = new Date(bill.date).toLocaleDateString("zh-CN");
      const amount = document.createElement("strong");
      amount.textContent = `¥${money.format(bill.amount)}`;
      description.append(title, date);
      row.append(description, amount);
      return row;
    }));
    document.querySelector("#detail-empty").hidden = rows.length > 0;
  }

  function renderStatistics() {
    const date = selectedMonth ?? new Date();
    document.querySelector("#statistics-month").textContent = `${date.getFullYear()}年${date.getMonth() + 1}月`;
    document.querySelector("#category-chart-title").textContent = statistics.key === monthKey(new Date()) ? "本月分类支出" : "分类支出";
    nextMonth.disabled = !available || statistics.key >= monthKey(new Date());
    document.querySelector("#chart-empty").hidden = statistics.expense > 0;
    document.querySelector("#detail-empty").textContent = "该月该分类暂无支出";
    document.querySelector("#category-total").textContent = `¥${money.format(statistics.expense)}`;
    legend.replaceChildren(...statistics.categories.map((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.category = category.name;
      button.disabled = !category.amount;
      button.setAttribute("aria-pressed", String(selected === category.name));
      const dot = document.createElement("i");
      dot.className = "category-dot";
      dot.style.background = category.color;
      const name = document.createElement("span");
      name.textContent = category.name;
      const percent = document.createElement("span");
      percent.className = "category-percent";
      percent.textContent = `${statistics.expense ? Math.round(category.amount / statistics.expense * 100) : 0}%`;
      const amount = document.createElement("strong");
      amount.textContent = `¥${money.format(category.amount)}`;
      button.append(dot, name, percent, amount);
      button.addEventListener("click", () => selectCategory(category.name));
      return button;
    }));
    const table = document.querySelector("#trend-data");
    table.replaceChildren(...statistics.months.map((month) => {
      const row = document.createElement("tr");
      for (const value of [month.key, money.format(month.income), money.format(month.expense)]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    }));
    renderDetails();
    charts.update(statistics, selected);
  }

  function renderBudgets() {
    const usage = settings ? calculateBudgetUsage(settings, currentStatistics) : { total: null, categories: {} };
    overview.replaceChildren();
    if (!settings) {
      overview.textContent = "预算加载失败，请稍后重试。";
    } else if (!usage.total) {
      overview.textContent = "总预算未设置";
    } else {
      const { remaining, percent, limit, spent, exceeded } = usage.total;
      const status = document.createElement("p");
      status.className = "budget-balance";
      const amount = document.createElement("strong");
      amount.textContent = `¥${money.format(Math.abs(remaining))}`;
      status.append(exceeded ? "本月超支 " : "本月剩余 ", amount);
      const progress = document.createElement("progress");
      progress.max = 100;
      progress.value = Math.min(100, percent);
      progress.setAttribute("aria-label", `预算已使用 ${percent}%`);
      const caption = document.createElement("p");
      caption.className = "budget-caption";
      caption.textContent = `已用 ${percent}% · ¥${money.format(spent)} / ¥${money.format(limit)}`;
      overview.append(status, progress, caption);
    }
    overview.classList.toggle("budget-exceeded", Boolean(usage.total?.exceeded));
    categoryBudgets.replaceChildren(...Object.entries(usage.categories).map(([name, category]) => {
      const row = document.createElement("div");
      row.className = `category-budget${category.exceeded ? " budget-exceeded" : ""}`;
      const label = document.createElement("span");
      label.textContent = `${categoryFor(name).icon} ${name}`;
      const amount = document.createElement("span");
      amount.textContent = `${category.exceeded ? "超支" : "剩余"} ¥${money.format(Math.abs(category.remaining))}`;
      amount.title = `已使用 ${category.percent}% · 预算 ¥${money.format(category.limit)}`;
      row.append(label, amount);
      return row;
    }));
    for (const item of document.querySelectorAll(".bill-item")) {
      const bill = records.find((record) => record.id === Number(item.dataset.id));
      const exceeded = bill?.type === "支出" && monthKey(new Date(bill.date)) === currentStatistics.key && usage.categories[categoryFor(bill.category).name]?.exceeded;
      item.classList.toggle("budget-exceeded", Boolean(exceeded));
      item.querySelector(".bill-warning").hidden = !exceeded;
    }
  }

  budgetButton.addEventListener("click", async () => {
    if (!available || saving) return;
    budgetButton.disabled = true;
    try {
      settings = await getBudget();
      renderBudgets();
      if (!available) return;
      budgetForm.reset();
      budgetForm.elements.namedItem("total").value = settings.total ?? "";
      for (const { name } of CATEGORIES) budgetForm.elements.namedItem(name).value = settings.categories[name] ?? "";
      budgetMessage.textContent = "";
      budgetDialog.showModal();
      updateDialogViewport();
      budgetForm.elements.namedItem("total").focus();
    } catch (error) {
      showMessage("预算加载失败，请稍后重试；账单不受影响。", true);
    } finally {
      budgetButton.disabled = !available;
    }
  });

  document.querySelector("#cancel-budget").addEventListener("click", () => { if (!saving) budgetDialog.close(); });
  budgetDialog.addEventListener("cancel", (event) => { if (saving) event.preventDefault(); });
  budgetForm.addEventListener("focusin", updateDialogViewport);
  budgetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    const draft = { total: null, categories: {} };
    for (const name of ["total", ...CATEGORIES.map((category) => category.name)]) {
      const input = budgetForm.elements.namedItem(name);
      if (!input.value && !input.validity.badInput) continue;
      if (!input.checkValidity() || !Number.isSafeInteger(Math.round(Number(input.value) * 100))) {
        budgetMessage.textContent = "预算请输入大于 0 且最多两位小数的金额，留空表示未设置。";
        input.focus();
        return;
      }
      if (name === "total") draft.total = Number(input.value);
      else draft.categories[name] = Number(input.value);
    }
    saving = true;
    budgetForm.querySelector("fieldset").disabled = true;
    budgetForm.setAttribute("aria-busy", "true");
    try {
      settings = await saveBudget(draft);
      currentStatistics = calculateStatistics(records);
      renderBudgets();
      budgetDialog.close();
      showMessage("预算已保存。");
    } catch (error) {
      budgetMessage.textContent = "预算保存失败，请重试；已填写内容已保留。";
    } finally {
      saving = false;
      budgetForm.querySelector("fieldset").disabled = false;
      budgetForm.setAttribute("aria-busy", "false");
    }
  });

  function switchTab(tab) {
    if (!available) return;
    const previous = tabs.findIndex((button) => button.getAttribute("aria-selected") === "true");
    for (const button of tabs) {
      const active = button === tab;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      document.getElementById(button.getAttribute("aria-controls")).hidden = !active;
    }
    const view = document.getElementById(tab.getAttribute("aria-controls"));
    if (tabs.indexOf(tab) !== previous && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      view.getAnimations().forEach((animation) => animation.cancel());
      view.animate([{ opacity: 0, transform: `translateX(${tabs.indexOf(tab) > previous ? 12 : -12}px)` },
        { opacity: 1, transform: "translateX(0)" }], { duration: 220, easing: "ease-out" });
    }
    charts.update(statistics, selected);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => switchTab(tab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      switchTab(next);
      next.focus();
    });
  });

  function changeMonth(offset) {
    if (!available) return;
    const date = selectedMonth ?? new Date();
    const next = new Date(date.getFullYear(), date.getMonth() + offset, 1);
    if (monthKey(next) > monthKey(new Date())) return;
    selectedMonth = monthKey(next) === monthKey(new Date()) ? null : next;
    statistics = calculateStatistics(records, selectedMonth ?? new Date());
    renderStatistics();
  }
  previousMonth.addEventListener("click", () => changeMonth(-1));
  nextMonth.addEventListener("click", () => changeMonth(1));

  return {
    setAvailable(value) {
      available = value;
      budgetButton.disabled = !value;
      tabs.forEach((tab) => { tab.disabled = !value; });
      previousMonth.disabled = !value;
      nextMonth.disabled = !value || statistics.key >= monthKey(new Date());
    },
    async update(bills) {
      if (!budgetDialog.open) buildBudgetFields();
      records = bills;
      currentStatistics = calculateStatistics(bills);
      statistics = selectedMonth ? calculateStatistics(bills, selectedMonth) : currentStatistics;
      renderStatistics();
      try { settings = await getBudget(); }
      catch (error) { settings = null; }
      renderBudgets();
    },
    clear() {
      records = [];
      statistics = calculateStatistics([]);
      currentStatistics = statistics;
      settings = null;
      renderStatistics();
      renderBudgets();
    }
  };
}
