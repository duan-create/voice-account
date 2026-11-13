import { DEFAULT_CATEGORIES } from './categories.js';

export const EXTRA_STORES = ['accounts', 'journal', 'billAccounts', 'categories', 'transfers', 'goals', 'checkins', 'schedules', 'occurrences', 'settings'];
export const ALL_STORES = ['bills', 'budgets', ...EXTRA_STORES];
export function cents(value, positive = false) {
  const n = Number(value);
  const result = Math.round(n * 100);
  if (value === '' || !Number.isFinite(n) || !Number.isSafeInteger(result) || Math.abs(n * 100 - result) > 0.00001 || (positive && result <= 0)) throw new TypeError('金额须为有效数字，最多两位小数。');
  return result;
}
export function request(r) {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
export function validBill(bill) {
  cents(bill.amount);
  if (!Number.isFinite(bill.amount) || bill.amount < 0 || !['收入', '支出'].includes(bill.type) || !Number.isFinite(bill.date) || !Number.isFinite(new Date(bill.date).getTime()) || typeof bill.category !== 'string' || !bill.category.trim() || typeof bill.remark !== 'string') throw new TypeError('账单类型、分类或日期无效。');
}

export function createLedger(openDB) {
  async function transact(names, mode, operation) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode);
      const stores = Object.fromEntries(names.map(name => [name, tx.objectStore(name)]));
      let result;
      let failure;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || new Error('本地事务失败，未写入任何数据。'));
      Promise.resolve().then(() => operation(stores)).then(value => { result = value; }).catch(error => {
        failure = error;
        try { tx.abort(); } catch { reject(error); }
      });
    });
  }
  const all = name => transact([name], 'readonly', s => request(s[name].getAll()));
  const put = (name, value) => transact([name], 'readwrite', s => request(s[name].put(value)));
  async function account(s, id, active = true) {
    const value = await request(s.accounts.get(Number(id)));
    if (!value || (active && value.archived)) throw new Error('账户不存在或已归档，请重新选择。');
    return value;
  }
  async function append(s, accountId, delta, kind, reference, date = Date.now()) {
    await request(s.journal.add({ accountId, delta, kind, reference, date, createdAt: Date.now() }));
  }
  async function balance(s, id) {
    return (await request(s.journal.getAll())).filter(x => x.accountId === id).reduce((sum, x) => sum + x.delta, 0);
  }
  async function mutateBill(s, id, draft, remove = false) {
    const old = id == null ? null : await request(s.bills.get(id));
    if (id != null && !old) return null;
    const metadata = old ? await request(s.billAccounts.get(id)) : null;
    if (!remove) {
      draft = { ...old, ...draft };
      validBill(draft);
      const nextAccount = Object.hasOwn(draft, 'accountId') ? draft.accountId : metadata?.accountId;
      draft.accountId = nextAccount == null || nextAccount === '' ? null : Number(nextAccount);
      if (draft.accountId !== null) await account(s, draft.accountId, draft.accountId !== metadata?.accountId);
    }
    if (metadata?.accountId != null) {
      await account(s, metadata.accountId, false);
      await append(s, metadata.accountId, -metadata.delta, 'bill-reversal', id);
    }
    if (remove) {
      await request(s.bills.delete(id));
      await request(s.billAccounts.delete(id));
      return;
    }
    const record = { type: draft.type, amount: draft.amount, category: draft.category, remark: draft.remark ?? '', date: draft.date, createdAt: old?.createdAt ?? Date.now() };
    if (id != null) record.id = id;
    const result = await request(id == null ? s.bills.add(record) : s.bills.put(record));
    const delta = cents(draft.amount) * (draft.type === '收入' ? 1 : -1);
    if (draft.accountId !== null) {
      await append(s, draft.accountId, delta, 'bill', result);
      await request(s.billAccounts.put({ id: result, accountId: draft.accountId, delta }));
    } else await request(s.billAccounts.delete(result));
    return old ? { ...record, id: result } : result;
  }
  async function move(s, draft, kind = 'transfer') {
    const from = Number(draft.from), to = Number(draft.to), amount = cents(draft.amount, true);
    if (from === to || !Number.isFinite(draft.date)) throw new Error('请选择两个不同账户及有效日期。');
    await account(s, from); await account(s, to);
    if (await balance(s, from) < amount) throw new Error('转出账户余额不足。');
    const id = await request(s.transfers.add({ from, to, amount, date: draft.date, remark: draft.remark || '', kind, createdAt: Date.now() }));
    await append(s, from, -amount, kind, id, draft.date);
    await append(s, to, amount, kind, id, draft.date);
    return id;
  }
  const billStores = ['bills', 'billAccounts', 'accounts', 'journal'];
  const api = {
    transact, all, put, mutateBill, move,
    ensureDefaultAccounts() {
      return transact(['accounts', 'journal', 'settings'], 'readwrite', async s => {
        const key = 'default-accounts-v1';
        if (await request(s.settings.get(key))) return;
        const names = new Set((await request(s.accounts.getAll())).map(a => a.name));
        for (const name of ['微信', '支付宝', '现金', '工商银行', '农业银行', '中国银行', '建设银行', '储蓄卡']) {
          if (names.has(name)) continue;
          const id = await request(s.accounts.add({ name, bank: name, openingCents: 0, archived: false, createdAt: Date.now() }));
          await append(s, id, 0, 'opening', id);
        }
        await request(s.settings.put({ id: key, value: true }));
      });
    },
    async accounts() {
      return transact(['accounts', 'journal'], 'readonly', async s => {
        const [accounts, journal] = await Promise.all([request(s.accounts.getAll()), request(s.journal.getAll())]);
        return accounts.map(a => ({ ...a, balance: journal.filter(j => j.accountId === a.id).reduce((sum, j) => sum + j.delta, 0) / 100 }));
      });
    },
    async saveAccount(draft) {
      const name = String(draft.name || '').trim();
      if (!name || name.length > 50) throw new Error('账户名称须为 1 至 50 个字。');
      const openingCents = cents(draft.opening ?? 0);
      return transact(['accounts', 'journal'], 'readwrite', async s => {
        const old = draft.id ? await account(s, draft.id) : null;
        const record = { name, bank: draft.bank || '自定义账户', openingCents, archived: false, createdAt: old?.createdAt ?? Date.now() };
        if (old) record.id = old.id;
        const id = await request(s.accounts.put(record));
        await append(s, id, openingCents - (old?.openingCents ?? 0), old ? 'opening-adjustment' : 'opening', id);
        return id;
      });
    },
    archiveAccount(id) {
      return transact(['accounts', 'goals', 'schedules'], 'readwrite', async s => {
        const a = await account(s, id), goals = await request(s.goals.getAll()), schedules = await request(s.schedules.getAll());
        if (goals.some(g => !g.archived && [g.from, g.to].includes(a.id)) || schedules.some(p => p.enabled && Number(p.bill?.accountId) === a.id)) throw new Error('请先归档引用此账户的存钱目标，并停用对应定时计划。');
        return request(s.accounts.put({ ...a, archived: true }));
      });
    },
    journal: () => all('journal'),
    async bills() {
      return transact(['bills', 'billAccounts'], 'readonly', async s => {
        const [records, metadata] = await Promise.all([request(s.bills.getAll()), request(s.billAccounts.getAll())]);
        return records.map(b => ({ ...b, accountId: metadata.find(m => m.id === b.id)?.accountId ?? null })).sort((a, b) => b.date - a.date || b.id - a.id);
      });
    },
    saveBill: (id, draft) => transact(billStores, 'readwrite', s => mutateBill(s, id, draft)),
    removeBill: id => transact(billStores, 'readwrite', s => mutateBill(s, id, null, true)),
    transfer: draft => transact(['accounts', 'journal', 'transfers'], 'readwrite', s => move(s, draft)),
    async categories() {
      const custom = await all('categories');
      const byName = new Map(DEFAULT_CATEGORIES.map(c => [c.name, c]));
      for (const c of custom) byName.set(c.name, c);
      return [...byName.values()];
    },
    async saveCategory(draft) {
      const name = String(draft.name || '').trim(), label = String(draft.label || name).trim();
      if (!name || !label || label.length > 30 || !['收入', '支出', '通用'].includes(draft.type) || !/^#[0-9a-f]{6}$/i.test(draft.color) || !draft.icon || [...draft.icon].length > 8) throw new Error('请填写分类名称、图标、颜色及类型。');
      const aliases = Array.isArray(draft.aliases) ? draft.aliases : String(draft.aliases || '').split(/[,，\n]/).map(x => x.trim()).filter(Boolean);
      return put('categories', { name, label, type: draft.type, icon: draft.icon, color: draft.color, background: `${draft.color}18`, aliases, archived: false });
    },
    async archiveCategory(name) {
      if (name === '其他') throw new Error('默认“其他”分类不能归档。');
      const category = (await api.categories()).find(c => c.name === name);
      if (!category) throw new Error('分类不存在。');
      return put('categories', { ...category, archived: true });
    }
  };
  return api;
}
