const assert = require('node:assert/strict');
const { test } = require('node:test');
const { indexedDB } = require('fake-indexeddb');
global.indexedDB = indexedDB;
async function setup() {
  const { createBillDB } = await import('../js/db.js');
  const { createLedger } = await import('../js/ledger.js');
  const { createPlans } = await import('../js/plans.js');
  const ledger = createLedger(createBillDB(`plans-${crypto.randomUUID()}`).initDB);
  return { ledger, plans: createPlans(ledger) };
}
test('saving check-in transfers real funds once per day, without generating income', async () => {
  const { ledger, plans } = await setup();
  const from = await ledger.saveAccount({ name: '现金', opening: 100 });
  const to = await ledger.saveAccount({ name: '存款', opening: 0 });
  const goal = await plans.saveGoal({ name: '旅行', target: 1000, daily: 10, from, to });
  await plans.checkIn(goal, new Date(2026, 10, 13).getTime());
  await assert.rejects(plans.checkIn(goal, new Date(2026, 10, 13, 12).getTime()));
  assert.deepEqual((await ledger.accounts()).map(a => a.balance), [90, 10]);
  assert.equal((await ledger.bills()).length, 0);
  assert.equal((await plans.goals())[0].saved, 10);
});
test('native occurrence imported twice commits exactly one bill and one account movement', async () => {
  const { ledger, plans } = await setup();
  const accountId = await ledger.saveAccount({ name: '银行卡', opening: 100 });
  const occurrence = { id: 'native:1:123', kind: 'bill', date: 123, bill: { type: '支出', amount: 10, category: '交通', remark: '定时', accountId, date: 123 } };
  assert.equal(await plans.accept(occurrence), true);
  assert.equal(await plans.accept(occurrence), false);
  assert.equal((await ledger.bills()).length, 1);
  assert.equal((await ledger.accounts())[0].balance, 90);
});
test('invalid pending occurrence does not mark consumed or mutate bills and can retry', async () => {
  const { ledger, plans } = await setup();
  const item = { id: 'bad', kind: 'bill', date: 123, bill: { type: '支出', amount: 5, category: '交通', remark: '', date: 123, accountId: 999 } };
  await assert.rejects(plans.accept(item));
  assert.equal((await ledger.all('occurrences')).length, 0);
  assert.equal((await ledger.bills()).length, 0);
});
test('daily and weekly advancement uses local calendar days, not fixed millisecond durations', async () => {
  const { nextTime } = await import('../js/plans.js');
  assert.equal(new Date(nextTime({ frequency: 'daily', time: '08:30' }, new Date(2026, 10, 13, 9).getTime())).getDate(), 14);
  const date = new Date(nextTime({ frequency: 'weekly', time: '08:30', weekday: 1 }, new Date(2026, 10, 13, 9).getTime()));
  assert.equal(date.getDay(), 1); assert.equal(date.getHours(), 8); assert.equal(date.getMinutes(), 30);
});
test('overdue auto bills catch up without duplicates and insufficient savings roll back', async () => {
  const { ledger, plans } = await setup();
  const from = await ledger.saveAccount({ name: '现金', opening: 5 });
  const to = await ledger.saveAccount({ name: '存款', opening: 0 });
  const goal = await plans.saveGoal({ name: '测试', target: 100, daily: 10, from, to });
  await assert.rejects(plans.checkIn(goal));
  assert.equal((await ledger.all('checkins')).length, 0);
  assert.deepEqual((await ledger.accounts()).map(a => a.balance), [5, 0]);
  const plan = await plans.saveSchedule({ kind: 'bill', frequency: 'daily', time: '08:30', bill: { type: '收入', amount: 2, category: '工资', remark: '', accountId: from } });
  await plans.catchUp(plan.next); await plans.catchUp(plan.next);
  assert.equal((await ledger.bills()).length, 1);
  assert.equal((await ledger.accounts())[0].balance, 7);
});
test('invalid or zero scheduled amounts and missing accounts are rejected', async () => {
  const { plans } = await setup();
  const draft = { kind: 'bill', frequency: 'daily', time: '08:30', bill: { type: '支出', amount: 0, category: '交通', remark: '', accountId: null } };
  await assert.rejects(plans.saveSchedule(draft));
  await assert.rejects(plans.saveSchedule({ ...draft, bill: { ...draft.bill, amount: 5, accountId: 999 } }));
});
