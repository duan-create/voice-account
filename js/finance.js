import { DEFAULT_CATEGORIES } from './categories.js';
export const CATEGORIES = DEFAULT_CATEGORIES.map(c => ({ ...c }));
export function setCategories(categories) { CATEGORIES.splice(0, CATEGORIES.length, ...categories); }

export const money = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
export const categoryFor = (name) => CATEGORIES.find((item) => item.name === name) ?? CATEGORIES.find(c => c.name === '其他');
const CHART_COLORS = ['#6586ba', '#579d9e', '#a69c76', '#8294a9', '#a8839b', '#6f9d81', '#a67f77', '#7a86ad', '#8fa3b6'];

export function calculateStatistics(bills, now = new Date(), yearly = false) {
  const key = yearly ? String(now.getFullYear()) : monthKey(now);
  const categories = CATEGORIES.map((category) => ({ ...category, amount: 0 }));
  const incomeCategories = CATEGORIES.map((category) => ({ ...category, amount: 0 }));
  const months = Array.from({ length: yearly ? 12 : 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), yearly ? index : now.getMonth() - 5 + index, 1);
    return { key: monthKey(date), label: `${date.getMonth() + 1}月`, income: 0, expense: 0 };
  });
  for (const bill of bills) {
    const billMonth = monthKey(new Date(bill.date));
    const month = months.find((item) => item.key === billMonth);
    const cents = Math.round(bill.amount * 100);
    if (month && bill.type === "收入") month.income += cents;
    if (month && bill.type === "支出") month.expense += cents;
    if (yearly ? billMonth.startsWith(`${key}-`) : billMonth === key) {
      const target = bill.type === '收入' ? incomeCategories : categories;
      target.find((item) => item.name === categoryFor(bill.category).name).amount += cents;
    }
  }
  const expense = categories.reduce((s, c) => s + c.amount, 0) / 100;
  const income = incomeCategories.reduce((s, c) => s + c.amount, 0) / 100;
  for (const item of [...categories, ...incomeCategories]) item.amount /= 100;
  categories.filter(c => c.amount > 0).forEach((c, i) => { c.chartColor = CHART_COLORS[i % CHART_COLORS.length]; });
  for (const item of months) {
    item.income /= 100;
    item.expense /= 100;
  }
  return { key, income, expense, categories, incomeCategories, months, yearly };
}

export function calculateBudgetUsage(settings, statistics) {
  const usage = (limit, spent) => {
    const limitCents = Math.round(limit * 100);
    const spentCents = Math.round(spent * 100);
    return {
      limit, spent, remaining: (limitCents - spentCents) / 100,
      percent: Math.round(spentCents / limitCents * 100), exceeded: spentCents > limitCents
    };
  };
  const categories = {};
  for (const category of statistics.categories) {
    const limit = settings.categories[category.name];
    if (limit != null) categories[category.name] = usage(limit, category.amount);
  }
  return { total: settings.total == null ? null : usage(settings.total, statistics.expense), categories };
}
