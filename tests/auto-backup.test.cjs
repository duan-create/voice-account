const assert = require('node:assert/strict');
const { test } = require('node:test');
const { IDBFactory } = require('fake-indexeddb');

test('automatic backups retain the latest three and read independent snapshots', async () => {
  const { createBackupStore } = await import('../js/auto-backup.js');
  const store = createBackupStore(new IDBFactory());
  const ids = [];
  for (let n = 1; n <= 4; n++) ids.push((await store.save({ bills: [{ amount: n }] })).id);
  const list = await store.list();
  assert.deepEqual(list.map(x => x.id), ids.slice(1).reverse());
  assert.deepEqual(await store.read(ids[3]), { bills: [{ amount: 4 }] });
  await assert.rejects(store.read(ids[0]));
  assert.equal(Object.hasOwn(list[0], 'snapshot'), false);
});

test('uncloneable backup does not evict any successful backup', async () => {
  const { createBackupStore } = await import('../js/auto-backup.js');
  const store = createBackupStore(new IDBFactory());
  for (let n = 0; n < 3; n++) await store.save({ value: n });
  const before = await store.list();
  await assert.rejects(store.save({ bad: () => {} }));
  assert.deepEqual(await store.list(), before);
});
