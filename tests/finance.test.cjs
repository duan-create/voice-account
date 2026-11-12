const assert = require("node:assert/strict");
const { test } = require("node:test");
const { pathToFileURL } = require("node:url");
const { join } = require("node:path");

const load = () => import(pathToFileURL(join(__dirname, "../js/finance.js")).href);
const bill = (type, amount, category, date) => ({ type, amount, category, date: new Date(date).getTime() });

test("statistics sum cents, exclude other months from the pie, and map unknown categories to other", async () => {
  const { calculateStatistics } = await load();
  const data = calculateStatistics([
    bill("支出", 0.1, "餐饮", "2026-01-01T00:00:00"),
    bill("支出", 0.2, "餐饮", "2026-01-31T23:59:59"),
    bill("支出", 6, "旧分类", "2026-01-10T12:00:00"),
    bill("收入", 1000, "其他", "2026-01-02T00:00:00"),
    bill("支出", 999, "餐饮", "2025-12-31T23:59:59"),
    bill("支出", 888, "餐饮", "2026-02-01T00:00:00")
  ], new Date("2026-01-15T12:00:00"));
  assert.equal(data.expense, 6.3);
  assert.equal(data.income, 1000);
  assert.equal(data.categories.find((item) => item.name === "餐饮").amount, 0.3);
  assert.equal(data.categories.find((item) => item.name === "其他").amount, 6);
  assert.deepEqual(data.months.map((item) => item.key), ["2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01"]);
  assert.deepEqual(data.months.map(({ income, expense }) => [income, expense]), [[0, 0], [0, 0], [0, 0], [0, 0], [0, 999], [1000, 6.3]]);
});

test("new month reuses limits but recalculates usage with no carryover", async () => {
  const { calculateStatistics, calculateBudgetUsage } = await load();
  const bills = [bill("支出", 120, "餐饮", "2026-01-31T12:00:00"), bill("支出", 10, "餐饮", "2026-02-01T12:00:00")];
  const settings = { total: 100, categories: { 餐饮: 50 } };
  const january = calculateBudgetUsage(settings, calculateStatistics(bills, new Date("2026-01-31T12:00:00")));
  const february = calculateBudgetUsage(settings, calculateStatistics(bills, new Date("2026-02-01T12:00:00")));
  assert.deepEqual(january.total, { limit: 100, spent: 120, remaining: -20, percent: 120, exceeded: true });
  assert.deepEqual(february.total, { limit: 100, spent: 10, remaining: 90, percent: 10, exceeded: false });
  assert.equal(january.categories.餐饮.exceeded, true);
  assert.equal(february.categories.餐饮.remaining, 40);
  assert.equal(february.categories.交通, undefined);
  assert.deepEqual(settings, { total: 100, categories: { 餐饮: 50 } });
});

test("empty statistics and unset budgets have no warnings; reaching a limit is not overspending", async () => {
  const { calculateStatistics, calculateBudgetUsage } = await load();
  const empty = calculateStatistics([], new Date("2026-02-01T00:00:00"));
  assert.equal(empty.categories.length, 6);
  assert.equal(empty.months.length, 6);
  assert.equal(empty.expense, 0);
  assert.deepEqual(calculateBudgetUsage({ total: null, categories: {} }, empty), { total: null, categories: {} });
  const full = calculateStatistics([bill("支出", 0.3, "餐饮", "2026-02-01T00:00:00")], new Date("2026-02-01T00:00:00"));
  assert.deepEqual(calculateBudgetUsage({ total: 0.3, categories: {} }, full).total, { limit: 0.3, spent: 0.3, remaining: 0, percent: 100, exceeded: false });
});
