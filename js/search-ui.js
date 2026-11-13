import { ledger } from './ledger-api.js';
import { searchBills, dateKey } from './calendar.js';
import { categoryFor, money } from './finance.js';

export function setupSearch({ edit, remove, showMessage, viewport }) {
  const page = document.querySelector('#search-view'), form = document.querySelector('#search-form');
  const detail = document.querySelector('#bill-detail-dialog');
  let records = [], query = {}, selected = null, category = '', history = [];
  const field = name => form.elements.namedItem(name);
  function close() { page.hidden = true; document.querySelector('#open-search').focus(); }
  function showDetail(bill) {
    selected = bill.id;
    document.querySelector('#bill-detail-content').textContent = `${categoryFor(bill.category).label} · ${bill.type} ¥${money.format(bill.amount)}\n${dateKey(bill.date)}\n${bill.remark || '无备注'}`;
    detail.showModal(); viewport();
  }
  function render() {
    const rows = searchBills(records.map(b => ({ ...b, categoryLabel: categoryFor(b.category).label, categoryGroup: categoryFor(b.category).name })), query);
    document.querySelector('#search-count').textContent = `搜索结果 · ${rows.length}笔`;
    document.querySelector('#search-empty').hidden = rows.length > 0;
    document.querySelector('#search-results').replaceChildren(...rows.map(bill => {
      const row = document.createElement('li'), button = document.createElement('button');
      button.className = 'search-result'; button.type = 'button';
      const text = document.createElement('span'), title = document.createElement('strong'), note = document.createElement('small');
      title.textContent = categoryFor(bill.category).label;
      note.textContent = `${dateKey(bill.date)} · ${bill.remark || bill.type}`;
      text.append(title, note);
      const amount = document.createElement('b'); amount.textContent = `${bill.type === '收入' ? '+' : '-'}¥${money.format(bill.amount)}`;
      amount.className = bill.type === '收入' ? 'amount-income' : 'amount-expense';
      button.append(text, amount); button.onclick = () => showDetail(bill); row.append(button); return row;
    }));
  }
  async function loadHistory() {
    history = (await ledger.all('settings')).find(s => s.id === 'searches')?.queries ?? [];
    document.querySelector('#search-history').replaceChildren(...history.map(saved => {
      const button = document.createElement('button'); button.className = 'history-chip'; button.type = 'button';
      button.textContent = saved.keyword || saved.category || `${saved.start || '不限'} · ${saved.type || '全部'}`;
      button.onclick = () => { fill(saved); query = saved; render(); }; return button;
    }));
    document.querySelector('#clear-search-history').disabled = history.length === 0;
  }
  function fill(values) {
    form.reset(); category = values.category || '';
    for (const [key, value] of Object.entries(values)) if (field(key)) field(key).value = value;
    document.querySelector('#search-category-filter').textContent = category ? `分类：${categoryFor(category).label}` : '';
  }
  async function open(filters) {
    try {
      const accounts = await ledger.accounts(), old = field('accountId').value;
      field('accountId').replaceChildren(new Option('全部账户', ''), new Option('未指定账户', 'unassigned'), ...accounts.map(a => new Option(`${a.name}${a.archived ? '（已归档）' : ''}`, a.id)));
      field('accountId').value = old;
      if (filters) query = filters;
      else if (!Object.keys(query).length) { const now = new Date(); query = { start: dateKey(new Date(now.getFullYear(), now.getMonth(), 1)), end: dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }; }
      fill(query); page.hidden = false; render(); await loadHistory(); field('keyword').focus();
    } catch (e) { showMessage(`搜索加载失败：${e.message}`, true); }
  }
  document.querySelector('#open-search').onclick = () => open();
  document.querySelector('#cancel-search').onclick = close;
  document.querySelector('#reset-search').onclick = () => { fill({}); query = {}; render(); };
  document.querySelector('#clear-search-history').onclick = async () => {
    try { await ledger.put('settings', { id: 'searches', queries: [] }); await loadHistory(); }
    catch (e) { showMessage(e.message, true); }
  };
  form.onsubmit = async event => {
    event.preventDefault(); const next = { ...Object.fromEntries(new FormData(form)), category };
    if ((next.start && next.end && next.start > next.end) || (next.min && next.max && Number(next.min) > Number(next.max))) return showMessage('筛选范围的起点不能大于终点。', true);
    query = next; render();
    try {
      const queries = [query, ...history.filter(q => JSON.stringify(q) !== JSON.stringify(query))].slice(0, 10);
      await ledger.put('settings', { id: 'searches', queries }); await loadHistory();
    } catch (e) { showMessage('搜索结果已更新，搜索历史保存失败。', true); }
  };
  document.querySelector('#close-bill-detail').onclick = () => detail.close();
  document.querySelector('#edit-search-bill').onclick = () => { const bill = records.find(b => b.id === selected); detail.close(); if (bill) edit(bill); };
  document.querySelector('#delete-search-bill').onclick = async () => { const bill = records.find(b => b.id === selected); detail.close(); if (bill) await remove(bill); };
  page.onkeydown = event => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) close(); };
  return { open, update(bills) { records = bills; if (!page.hidden) render(); } };
}
