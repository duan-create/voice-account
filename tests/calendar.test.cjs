const assert = require('node:assert/strict');
const { test } = require('node:test');
test('calendar includes leap day and sums in cents without adjacent months', async () => {
  const { calendarMonth } = await import('../js/calendar.js');
  const bills = [{ date: new Date(2024, 1, 29).getTime(), amount: 0.1, type: '收入' }, { date: new Date(2024, 1, 29).getTime(), amount: 0.2, type: '收入' }, { date: new Date(2024, 2, 1).getTime(), amount: 99, type: '支出' }];
  const month = calendarMonth(bills, new Date(2024, 1, 1));
  assert.equal(month.days.length, 29); assert.equal(month.days[28].income, 0.3); assert.equal(month.expense, 0);
});
test('search combines text money dates and type with inclusive end date and reverse order', async () => {
  const { searchBills } = await import('../js/calendar.js');
  const bills = [1, 2, 3].map(id => ({ id, date: new Date(2026, 0, id, 23, 59).getTime(), remark: '午餐', category: '餐饮', amount: id * 10, type: '支出' }));
  assert.deepEqual(searchBills(bills, { keyword: '午餐', min: '20', max: '30', start: '2026-01-02', end: '2026-01-03', type: '支出' }).map(b => b.id), [3, 2]);
  assert.deepEqual(searchBills(bills, { type: '收入' }), []);
});
test('search isolates exact category and account without losing equal-date ordering', async () => {
  const { searchBills } = await import('../js/calendar.js');
  const bills = [1, 2, 3].map(id => ({ id, date: 1000, category: id === 3 ? '交通' : '餐饮', accountId: id === 1 ? 2 : null, amount: 10, type: '支出', remark: '午餐' }));
  assert.deepEqual(searchBills(bills, { category: '餐饮', accountId: 'unassigned' }).map(b => b.id), [2]);
  assert.deepEqual(searchBills(bills, { accountId: '2' }).map(b => b.id), [1]);
  assert.deepEqual(searchBills([{ ...bills[0], category: '旧分类', categoryGroup: '其他' }], { category: '其他' }).map(b => b.id), [1]);
});
