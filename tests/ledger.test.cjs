const assert = require('node:assert/strict');
const { test } = require('node:test');
const { indexedDB } = require('fake-indexeddb');
global.indexedDB = indexedDB;

async function setup() {
  const { createBillDB } = await import('../js/db.js');
  const { createLedger } = await import('../js/ledger.js');
  const bills = createBillDB(`test-${crypto.randomUUID()}`);
  return { bills, ledger: createLedger(bills.initDB) };
}
const draft = { type: '支出', amount: 28.5, category: '餐饮', remark: '午餐', date: 1794528000000 };

test('v2 upgrade preserves bill bytes, key path, auto increment and budget', async () => {
  const name = `legacy-${crypto.randomUUID()}`;
  const legacy = { ...draft, id: 17, createdAt: 123 };
  await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('bills', { keyPath: 'id', autoIncrement: true }).add(legacy);
      request.result.createObjectStore('budgets').put({ total: 1000, categories: {} }, 'monthly');
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
  const { createBillDB } = await import('../js/db.js');
  const api = createBillDB(name);
  assert.deepEqual(await api.getBills(), [legacy]);
  const db = await api.initDB();
  const tx = db.transaction(['bills', 'budgets']);
  assert.equal(tx.objectStore('bills').keyPath, 'id');
  assert.equal(tx.objectStore('bills').autoIncrement, true);
  const budget = await new Promise(resolve => { const r = tx.objectStore('budgets').get('monthly'); r.onsuccess = () => resolve(r.result); });
  assert.equal(budget.total, 1000);
  assert.ok(await api.addBill(draft) > 17);
});

test('bill edits and deletions reverse account movements atomically with journal history', async () => {
  const { bills, ledger } = await setup();
  const a = await ledger.saveAccount({ name: '工商银行', opening: 1000 });
  const id = await ledger.saveBill(null, { ...draft, accountId: a });
  assert.equal((await ledger.accounts())[0].balance, 971.5);
  await ledger.saveBill(id, { ...draft, amount: 30, accountId: a });
  assert.equal((await ledger.accounts())[0].balance, 970);
  await ledger.removeBill(id);
  assert.equal((await ledger.accounts())[0].balance, 1000);
  assert.equal((await bills.getBills()).length, 0);
  assert.equal((await ledger.journal()).length, 5);
});

test('invalid account cannot leave a partial bill and transfers do not create income', async () => {
  const { bills, ledger } = await setup();
  await assert.rejects(ledger.saveBill(null, { ...draft, accountId: 999 }));
  assert.deepEqual(await bills.getBills(), []);
  const a = await ledger.saveAccount({ name: '现金', opening: 1000 });
  const b = await ledger.saveAccount({ name: '农业银行', opening: 0 });
  await ledger.transfer({ from: a, to: b, amount: 100, date: draft.date, remark: '划转' });
  assert.deepEqual((await ledger.accounts()).map(a => a.balance), [900, 100]);
  assert.deepEqual(await bills.getBills(), []);
  await ledger.archiveAccount(a);
  assert.equal((await ledger.accounts()).find(x => x.id === a).archived, true);
  assert.equal((await ledger.journal()).length, 4);
});

test('moving a bill restores previous account and leaves legacy unassigned bills alone', async () => {
  const { bills, ledger } = await setup();
  const old = await bills.addBill(draft);
  const a = await ledger.saveAccount({ name: '甲', opening: 100 });
  const b = await ledger.saveAccount({ name: '乙', opening: 200 });
  const id = await ledger.saveBill(null, { ...draft, accountId: a });
  await ledger.saveBill(id, { ...draft, accountId: b });
  assert.deepEqual((await ledger.accounts()).map(a => a.balance), [100, 171.5]);
  assert.equal((await ledger.bills()).find(x => x.id === old).accountId, null);
  await assert.rejects(ledger.transfer({ from: b, to: a, amount: 1000, date: draft.date }));
  assert.deepEqual((await ledger.accounts()).map(a => a.balance), [100, 171.5]);
});

test('category renaming preserves historical bill category and archived categories stay readable', async () => {
  const { bills, ledger } = await setup();
  await bills.addBill(draft);
  await ledger.saveCategory({ name: '餐饮', label: '吃喝', type: '支出', icon: '餐', color: '#cc5533', aliases: '吃饭,午餐' });
  await ledger.archiveCategory('餐饮');
  assert.equal((await bills.getBills())[0].category, '餐饮');
  assert.equal((await ledger.categories()).find(c => c.name === '餐饮').label, '吃喝');
});
test('accounts used by active goals or schedules cannot be archived underneath them', async () => {
  const { ledger } = await setup();
  const id = await ledger.saveAccount({ name: '计划账户', opening: 100 });
  await ledger.put('schedules', { id: 'active', enabled: true, bill: { accountId: id } });
  await assert.rejects(ledger.archiveAccount(id));
  assert.equal((await ledger.accounts())[0].archived, false);
});

test('default accounts initialize once without touching existing funds or legacy bills', async () => {
  const { bills, ledger } = await setup();
  const legacy = await bills.addBill(draft);
  const cash = await ledger.saveAccount({ name: '现金', opening: 123.45 });
  await Promise.all([ledger.ensureDefaultAccounts(), ledger.ensureDefaultAccounts()]);
  const accounts = await ledger.accounts();
  assert.equal(accounts.length, 8);
  assert.equal(accounts.find(a => a.id === cash).balance, 123.45);
  assert.equal(accounts.filter(a => a.id !== cash).every(a => a.balance === 0), true);
  assert.equal((await ledger.bills()).find(b => b.id === legacy).accountId, null);
  await ledger.archiveAccount(accounts.find(a => a.name === '微信').id);
  await ledger.ensureDefaultAccounts();
  assert.equal((await ledger.accounts()).length, 8);
  assert.equal((await ledger.accounts()).find(a => a.name === '微信').archived, true);
});

test('an archived matching account is not duplicated by the one-time migration', async () => {
  const { ledger } = await setup();
  const id = await ledger.saveAccount({ name: '支付宝', opening: 80 });
  await ledger.archiveAccount(id);
  await ledger.ensureDefaultAccounts();
  assert.equal((await ledger.accounts()).filter(a => a.name === '支付宝').length, 1);
  assert.equal((await ledger.accounts()).find(a => a.id === id).balance, 80);
});
