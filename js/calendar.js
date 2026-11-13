export function dateKey(value = Date.now()) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function calendarMonth(bills, selected) {
  const year = selected.getFullYear(), month = selected.getMonth();
  const days = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => ({ date: dateKey(new Date(year, month, i + 1)), day: i + 1, income: 0, expense: 0 }));
  for (const bill of bills) {
    const day = days.find(d => d.date === dateKey(bill.date));
    if (day) day[bill.type === '收入' ? 'income' : 'expense'] += Math.round(bill.amount * 100);
  }
  const income = days.reduce((s, d) => s + d.income, 0) / 100, expense = days.reduce((s, d) => s + d.expense, 0) / 100;
  for (const day of days) { day.income /= 100; day.expense /= 100; }
  return { days, offset: (new Date(year, month, 1).getDay() + 6) % 7, income, expense, balance: Math.round((income - expense) * 100) / 100 };
}
export function searchBills(bills, filters) {
  const keyword = (filters.keyword || '').trim().toLocaleLowerCase();
  return bills.filter(b => (!keyword || `${b.remark} ${b.category} ${b.categoryLabel || ''}`.toLocaleLowerCase().includes(keyword))
    && (!filters.type || b.type === filters.type)
    && (!filters.category || (b.categoryGroup || b.category) === filters.category)
    && (!filters.accountId || (filters.accountId === 'unassigned' ? b.accountId == null : Number(b.accountId) === Number(filters.accountId)))
    && (filters.min === '' || filters.min == null || b.amount >= Number(filters.min))
    && (filters.max === '' || filters.max == null || b.amount <= Number(filters.max))
    && (!filters.start || dateKey(b.date) >= filters.start) && (!filters.end || dateKey(b.date) <= filters.end))
    .sort((a, b) => b.date - a.date || b.id - a.id);
}
