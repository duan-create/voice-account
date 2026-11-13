import { isAndroidNative } from './native-voice.js';

export function createBackupStore(factory = globalThis.indexedDB) {
  let connection;
  function open() {
    return connection ??= new Promise((resolve, reject) => {
      const r = factory.open('voice-account-backups', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('copies', { keyPath: 'id', autoIncrement: true });
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
  }
  async function transaction(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('copies', mode), store = tx.objectStore('copies'); let result;
      tx.oncomplete = () => resolve(result); tx.onabort = () => reject(tx.error || new Error('备份写入失败。'));
      try { operation(store, value => { result = value; }); }
      catch (e) { tx.abort(); reject(e); }
    });
  }
  return {
    save(snapshot) {
      return transaction('readwrite', (store, done) => {
        const createdAt = Date.now(), r = store.add({ createdAt, snapshot });
        r.onsuccess = () => {
          const id = r.result, all = store.getAllKeys();
          all.onsuccess = () => { for (const key of all.result.slice(0, -3)) store.delete(key); done({ id, createdAt }); };
        };
      });
    },
    list: () => transaction('readonly', (store, done) => { const r = store.getAll(); r.onsuccess = () => done(r.result.reverse().map(({ id, createdAt }) => ({ id, createdAt }))); }),
    async read(id) {
      const value = await transaction('readonly', (store, done) => { const r = store.get(Number(id)); r.onsuccess = () => done(r.result); });
      if (!value) throw new Error('备份不存在或已被轮换。'); return value.snapshot;
    },
    directory: async () => ({ authorized: false }),
    chooseDirectory: async () => { throw new Error('网页请通过导出备份保存到独立文件夹。'); }
  };
}

export function createAutoBackupStore() {
  if (!isAndroidNative()) return createBackupStore();
  const plugin = window.Capacitor.registerPlugin('DocumentsPlugin');
  return {
    save: data => plugin.backupSave({ json: JSON.stringify(data) }),
    list: async () => (await plugin.backupList()).items,
    read: async id => JSON.parse((await plugin.backupRead({ id: String(id) })).json),
    directory: () => plugin.backupDirectory(),
    chooseDirectory: () => plugin.backupChooseDirectory()
  };
}
