import { ALL_STORES, request, validBill, cents } from './ledger.js';
import { dateKey } from './calendar.js';

export const HEADERS = ['日期', '类型', '金额', '分类', '备注', '账户'];
export function tableRows(bills, accounts) {
  return bills.map(b => [dateKey(b.date), b.type, b.amount, b.category, b.remark, accounts.find(a => a.id === b.accountId)?.name || '未指定账户']);
}
export function encodeCSV(bills, accounts) {
  return '\ufeff' + globalThis.Papa.unparse({ fields: HEADERS, data: tableRows(bills, accounts) }, { escapeFormulae: true });
}
export async function previewCSV(text, ledger) {
  const parsed = globalThis.Papa.parse(text.replace(/^\ufeff/, ''), { header: true, skipEmptyLines: 'greedy' });
  if (parsed.errors.length || !HEADERS.every(h => parsed.meta.fields?.includes(h))) throw new Error('CSV 格式无效，必须包含：日期、类型、金额、分类、备注、账户。');
  const accounts = await ledger.accounts(), categories = await ledger.categories();
  return parsed.data.map((row, i) => {
    const errors = [], date = new Date(`${row['日期']}T00:00:00`).getTime(), amount = Number(row['金额']);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row['日期']) || !Number.isFinite(date) || dateKey(date) !== row['日期']) errors.push('日期无效');
    try { cents(amount, true); } catch { errors.push('金额无效'); }
    if (!['收入', '支出'].includes(row['类型'])) errors.push('类型无效');
    const category = categories.find(c => c.name === row['分类'] || c.label === row['分类']);
    if (!category || category.archived) errors.push('分类不存在或已归档，请先创建分类');
    const account = accounts.find(a => a.name === row['账户'] && !a.archived);
    if (row['账户'] && row['账户'] !== '未指定账户' && !account) errors.push('账户不存在或已归档，请先创建账户');
    return { row: i + 2, errors, bill: { date, type: row['类型'], amount, category: category?.name ?? row['分类'], remark: row['备注'] || '', accountId: account?.id ?? null } };
  });
}
export async function importCSV(rows, ledger) {
  if (!rows.length || rows.some(r => r.errors.length)) throw new Error('请修复所有校验错误后重新导入。');
  return ledger.transact(['bills', 'billAccounts', 'accounts', 'journal'], 'readwrite', async stores => {
    for (const row of rows) await ledger.mutateBill(stores, null, row.bill);
    return rows.length;
  });
}
export async function snapshot(ledger) {
  return ledger.transact(ALL_STORES, 'readonly', async stores => {
    const result = {};
    for (const name of ALL_STORES) {
      result[name] = name === 'budgets' ? await request(stores[name].get('monthly')) ?? null : await request(stores[name].getAll());
    }
    return { format: 'voice-account', version: 1, stores: result };
  });
}
export function validateSnapshot(input) {
  const legacy = Array.isArray(input);
  const data = legacy ? Object.fromEntries(ALL_STORES.map(n => [n, n === 'bills' ? input : n === 'budgets' ? null : []])) : input?.stores;
  if (!legacy && (input?.format !== 'voice-account' || input.version !== 1)) throw new Error('不支持的备份版本。');
  if (!data || ALL_STORES.some(n => n !== 'budgets' && !Array.isArray(data[n]))) throw new Error('备份缺少完整数据表。');
  for (const name of ALL_STORES.filter(n => n !== 'budgets')) {
    const keys = data[name].map(r => r?.[name === 'categories' ? 'name' : 'id']);
    if (keys.some(k => k == null || (typeof k !== 'string' && !Number.isSafeInteger(k))) || new Set(keys).size !== keys.length) throw new Error(`备份 ${name} 主键无效或重复。`);
  }
  for (const b of data.bills) { validBill(b); if (!Number.isFinite(b.createdAt)) throw new Error('账单创建时间无效。'); }
  const accountIds = new Set(data.accounts.map(a => a.id)), billIds = new Set(data.bills.map(b => b.id));
  for (const a of data.accounts) if (!a.name || !Number.isSafeInteger(a.openingCents)) throw new Error('账户数据无效。');
  for (const j of data.journal) if (!accountIds.has(j.accountId) || !Number.isSafeInteger(j.delta) || !Number.isFinite(j.createdAt)) throw new Error('资产流水无效。');
  for (const c of data.categories) if (!c.name || !c.label || !['收入', '支出', '通用'].includes(c.type) || !/^#[0-9a-f]{6}$/i.test(c.color) || !Array.isArray(c.aliases) || c.aliases.some(a => typeof a !== 'string')) throw new Error('分类数据无效。');
  for (const m of data.billAccounts) {
    const bill = data.bills.find(b => b.id === m.id);
    if (!billIds.has(m.id) || !accountIds.has(m.accountId) || m.delta !== cents(bill.amount) * (bill.type === '收入' ? 1 : -1)) throw new Error('账单账户关联无效。');
  }
  for (const t of data.transfers) if (!accountIds.has(t.from) || !accountIds.has(t.to) || t.from === t.to || !Number.isSafeInteger(t.amount) || t.amount <= 0) throw new Error('转账数据无效。');
  if (data.budgets) {
    const budget = data.budgets;
    if (!budget.categories || typeof budget.categories !== 'object') throw new Error('预算数据无效。');
    for (const value of [budget.total, ...Object.values(budget.categories)]) if (value != null) cents(value, true);
  }
  return data;
}
export async function restore(input, ledger) {
  const data = validateSnapshot(input);
  return ledger.transact(ALL_STORES, 'readwrite', async stores => {
    for (const name of ALL_STORES) await request(stores[name].clear());
    for (const name of ALL_STORES) {
      if (name === 'budgets') { if (data[name]) await request(stores[name].put(data[name], 'monthly')); }
      else for (const row of data[name]) await request(stores[name].put(row));
    }
  });
}
