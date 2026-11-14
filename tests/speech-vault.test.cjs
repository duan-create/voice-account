const assert = require('node:assert/strict');
const { test } = require('node:test');
const { IDBFactory } = require('fake-indexeddb');
const config = { enabled: true, appId: 'private-app', apiKey: 'private-key', apiSecret: 'private-secret' };

async function cryptoBoundary() {
  let key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return {
    async seal({ json }) {
      key ??= await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json));
      return { sealed: `${Buffer.from(iv).toString('base64')}.${Buffer.from(bytes).toString('base64')}` };
    },
    async unseal({ sealed }) {
      if (!key) throw new Error('Key deleted');
      const [iv, bytes] = sealed.split('.').map(v => Buffer.from(v, 'base64'));
      return { json: new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes)) };
    },
    async clearKey() { key = null; }
  };
}

test('vault defaults offline, persists authenticated ciphertext separately and survives reopening', async () => {
  const { createSpeechVault } = await import('../js/speech-vault.js');
  const factory = new IDBFactory(), plugin = await cryptoBoundary();
  const vault = createSpeechVault(plugin, factory);
  assert.deepEqual(await vault.read(), { enabled: false, appId: '', apiKey: '', apiSecret: '' });
  await vault.save(config);
  assert.deepEqual(await createSpeechVault(plugin, factory).read(), config);
  const databases = await factory.databases();
  assert.deepEqual(databases.map(db => db.name), ['voice-account-speech']);
  const db = await new Promise(resolve => { const r = factory.open('voice-account-speech'); r.onsuccess = () => resolve(r.result); });
  const value = await new Promise(resolve => { const r = db.transaction('vault').objectStore('vault').get('config'); r.onsuccess = () => resolve(r.result); });
  for (const secret of ['private-app', 'private-key', 'private-secret']) assert.ok(!JSON.stringify(value).includes(secret));
  assert.deepEqual(Object.keys(value), ['sealed']);
  db.close();
});

test('clearing the vault destroys credentials; a new configuration can be saved afterwards', async () => {
  const { createSpeechVault } = await import('../js/speech-vault.js');
  const factory = new IDBFactory(), plugin = await cryptoBoundary(), vault = createSpeechVault(plugin, factory);
  await vault.save(config); await vault.clear();
  assert.equal((await vault.read()).enabled, false);
  assert.equal((await vault.read()).apiSecret, '');
  await vault.save(config); assert.deepEqual(await vault.read(), config);
});

test('corrupt or undecryptable credentials reject instead of silently enabling cloud', async () => {
  const { createSpeechVault } = await import('../js/speech-vault.js');
  const factory = new IDBFactory(), plugin = await cryptoBoundary(), vault = createSpeechVault(plugin, factory);
  await vault.save(config); await plugin.clearKey();
  await assert.rejects(vault.read());
});

test('tampering with persisted ciphertext is rejected by authenticated decryption', async () => {
  const { createSpeechVault } = await import('../js/speech-vault.js');
  const factory = new IDBFactory(), plugin = await cryptoBoundary(), vault = createSpeechVault(plugin, factory);
  await vault.save(config);
  const db = await new Promise(resolve => { const r = factory.open('voice-account-speech'); r.onsuccess = () => resolve(r.result); });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('vault', 'readwrite'), store = tx.objectStore('vault'), r = store.get('config');
    r.onsuccess = () => {
      const [iv, cipher] = r.result.sealed.split('.');
      const bytes = Buffer.from(cipher, 'base64'); bytes[0] ^= 1;
      store.put({ sealed: `${iv}.${bytes.toString('base64')}` }, 'config');
    };
    tx.oncomplete = resolve; tx.onabort = reject;
  });
  await assert.rejects(vault.read(), /无法解密/); db.close();
});
