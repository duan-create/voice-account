export const CATEGORIES = [
  { name: "餐饮", icon: "🍜", color: "#c45c38", background: "#fff0e9" },
  { name: "交通", icon: "🚇", color: "#4274c4", background: "#edf3ff" },
  { name: "购物", icon: "🛍", color: "#ac5889", background: "#fceef6" },
  { name: "住宿", icon: "🏠", color: "#967126", background: "#faf3df" },
  { name: "娱乐", icon: "🎬", color: "#238779", background: "#e6f6f1" },
  { name: "其他", icon: "📌", color: "#717a8c", background: "#eff1f5" }
];

export const money = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
export const categoryFor = (name) => CATEGORIES.find((item) => item.name === name) ?? CATEGORIES[5];

export function calculateStatistics(bills, now = new Date()) {
  const key = monthKey(now);
  const categories = CATEGORIES.map((category) => ({ ...category, amount: 0 }));
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return { key: monthKey(date), label: `${date.getMonth() + 1}月`, income: 0, expense: 0 };
  });
  for (const bill of bills) {
    const billMonth = monthKey(new Date(bill.date));
    const month = months.find((item) => item.key === billMonth);
    const cents = Math.round(bill.amount * 100);
    if (month && bill.type === "收入") month.income += cents;
    if (month && bill.type === "支出") month.expense += cents;
    if (billMonth === key && bill.type === "支出") {
      categories.find((item) => item.name === categoryFor(bill.category).name).amount += cents;
    }
  }
  for (const item of categories) item.amount /= 100;
  for (const item of months) {
    item.income /= 100;
    item.expense /= 100;
  }
  return { key, income: months[5].income, expense: months[5].expense, categories, months };
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
