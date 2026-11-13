const assert = require('node:assert/strict');
const { test } = require('node:test');
const { indexedDB } = require('fake-indexeddb');
global.indexedDB = indexedDB;
global.Papa = require('papaparse');
async function setup() {
  const { createBillDB } = await import('../js/db.js');
  const { createLedger } = await import('../js/ledger.js');
  return createLedger(createBillDB(`backup-${crypto.randomUUID()}`).initDB);
}
test('CSV round trip preserves quoted multiline notes and validates invalid rows', async () => {
  const { encodeCSV, previewCSV } = await import('../js/backup.js');
  const ledger = await setup();
  const csv = encodeCSV([{ type: '支出', amount: 12.5, category: '餐饮', remark: '午餐,"好吃"\n第二行', date: new Date(2026, 0, 2).getTime(), accountId: null }], []);
  const result = await previewCSV(csv, ledger);
  assert.equal(result[0].bill.remark, '午餐,"好吃"\n第二行'); assert.deepEqual(result[0].errors, []);
  assert.ok((await previewCSV('日期,类型,金额,分类,备注,账户\n2026-02-30,支出,abc,餐饮,,未知', ledger))[0].errors.length >= 2);
});
test('full restore preserves IDs and balances; invalid references leave existing data untouched', async () => {
  const { snapshot, restore } = await import('../js/backup.js');
  const ledger = await setup();
  const id = await ledger.saveAccount({ name: '现金', opening: 100 });
  await ledger.saveBill(null, { type: '支出', amount: 20, category: '餐饮', remark: '', date: Date.now(), accountId: id });
  const before = await snapshot(ledger);
  await restore(before, ledger);
  assert.equal((await ledger.accounts())[0].balance, 80);
  const bad = structuredClone(before); bad.stores.billAccounts[0].accountId = 999;
  await assert.rejects(restore(bad, ledger));
  assert.deepEqual(await snapshot(ledger), before);
});
test('legacy array restore keeps bills unassigned and cannot silently erase assets', async () => {
  const { restore } = await import('../js/backup.js');
  const ledger = await setup();
  await restore([{ id: 17, type: '收入', amount: 10, category: '其他', remark: '', date: 1234, createdAt: 1234 }], ledger);
  assert.equal((await ledger.bills())[0].id, 17); assert.equal((await ledger.bills())[0].accountId, null);
});
