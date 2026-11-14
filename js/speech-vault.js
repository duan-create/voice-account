import { validateSpeechConfig } from './iflytek.js';

export function createSpeechVault(plugin, factory = globalThis.indexedDB) {
  let connection;
  async function transaction(mode, operation) {
    connection ??= new Promise((resolve, reject) => {
      const r = factory.open('voice-account-speech', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('vault');
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    const db = await connection;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('vault', mode);
      const request = operation(tx.objectStore('vault'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(new Error('语音配置存储失败。'));
    });
  }
  return {
    async read() {
      const value = await transaction('readonly', store => store.get('config'));
      if (!value) return validateSpeechConfig(null);
      try { return validateSpeechConfig(JSON.parse((await plugin.unseal({ sealed: value.sealed })).json)); }
      catch { throw new Error('语音配置无法解密，请清除后重新配置；当前使用离线识别。'); }
    },
    async save(config) {
      const value = validateSpeechConfig(config);
      const { sealed } = await plugin.seal({ json: JSON.stringify(value) });
      await transaction('readwrite', store => store.put({ sealed }, 'config'));
    },
    async clear() {
      await transaction('readwrite', store => store.delete('config'));
      await plugin.clearKey();
    }
  };
}
