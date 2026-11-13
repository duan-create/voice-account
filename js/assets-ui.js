import { ledger } from './ledger-api.js';
import { BANKS } from './categories.js';
import { CATEGORIES, setCategories, money } from './finance.js';
import { requestDelete } from './ui.js';

export function setupAssets({ showMessage, refresh, viewport }) {
  const dialog = document.querySelector('#asset-dialog');
  const form = document.querySelector('#asset-form');
  const error = document.querySelector('#asset-error');
  let accounts = [], mode = 'account', editing = null;
  const field = (name, value = '') => { form.elements.namedItem(name).value = value; };
  function open(nextMode, record = null) {
    mode = nextMode; editing = record;
    form.reset(); error.textContent = '';
    for (const block of form.querySelectorAll('[data-mode]')) {
      block.hidden = block.dataset.mode !== mode;
      block.disabled = block.hidden;
    }
    document.querySelector('#asset-title').textContent = mode === 'account' ? (record ? '编辑账户' : '添加账户') : mode === 'transfer' ? '账户转账' : (record ? '编辑分类' : '添加分类');
    if (mode === 'account' && record) { field('accountName', record.name); field('bank', record.bank); field('opening', record.openingCents / 100); }
    if (mode === 'category' && record) { field('categoryName', record.label); field('categoryType', record.type); field('icon', record.icon); field('color', record.color); field('aliases', record.aliases.join(',')); }
    if (mode === 'transfer') {
      for (const name of ['from', 'to']) form.elements.namedItem(name).replaceChildren(...accounts.filter(a => !a.archived).map(a => new Option(a.name, a.id)));
    }
    dialog.showModal(); viewport();
  }
  document.querySelector('#add-account').onclick = () => open('account');
  document.querySelector('#add-category').onclick = () => open('category');
  document.querySelector('#new-transfer').onclick = () => open('transfer');
  document.querySelector('#cancel-asset').onclick = () => dialog.close();
  form.elements.namedItem('bank').replaceChildren(...BANKS.map(b => new Option(b, b)));
  form.addEventListener('focusin', viewport);
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('[type=submit]'); button.disabled = true;
    const f = Object.fromEntries(new FormData(form));
    try {
      if (mode === 'account') await ledger.saveAccount({ id: editing?.id, name: f.accountName, bank: f.bank, opening: Number(f.opening) });
      if (mode === 'transfer') await ledger.transfer({ from: f.from, to: f.to, amount: Number(f.transferAmount), date: Date.now(), remark: f.transferRemark });
      if (mode === 'category') {
        if (!editing && CATEGORIES.some(c => c.name === f.categoryName.trim())) throw new Error('分类已存在，请编辑现有分类。');
        await ledger.saveCategory({ name: editing?.name ?? f.categoryName, label: f.categoryName, type: f.categoryType, icon: f.icon, color: f.color, aliases: f.aliases });
      }
      dialog.close(); await refresh(); showMessage('已保存。');
    } catch (e) { error.textContent = e.message; }
    finally { button.disabled = false; }
  };
  function row(title, description, amount, onEdit, onArchive) {
    const li = document.createElement('li'); li.className = 'manage-row';
    const text = document.createElement('div'); const name = document.createElement('strong'); name.textContent = title;
    const detail = document.createElement('small'); detail.textContent = description; text.append(name, detail); li.append(text);
    if (amount != null) { const value = document.createElement('b'); value.textContent = `¥${money.format(amount)}`; li.append(value); }
    for (const [label, action] of [['编辑', onEdit], ['归档', onArchive]]) {
      if (!action) continue;
      const button = document.createElement('button'); button.className = 'text-button'; button.type = 'button'; button.textContent = label;
      button.onclick = action; li.append(button);
    }
    return li;
  }
  return {
    async update() {
      accounts = await ledger.accounts(); setCategories(await ledger.categories());
      const asset = accounts.reduce((sum, a) => sum + Math.max(0, a.balance), 0);
      const debt = accounts.reduce((sum, a) => sum + Math.max(0, -a.balance), 0);
      for (const [id, value] of [['total-assets', asset], ['total-debt', debt], ['net-assets', asset - debt]]) document.querySelector(`#${id}`).textContent = money.format(value);
      document.querySelector('#account-list').replaceChildren(...accounts.map(a => row(a.name, `${a.bank}${a.archived ? ' · 已归档' : ''}`, a.balance, a.archived ? null : () => open('account', a), a.archived ? null : async () => {
        try { if (await requestDelete('归档后保留账户余额和历史流水，不再用于新记账。是否继续？', viewport)) { await ledger.archiveAccount(a.id); await refresh(); } }
        catch (e) { showMessage(e.message, true); }
      })));
      document.querySelector('#account-empty').hidden = accounts.length > 0;
      document.querySelector('#category-list').replaceChildren(...CATEGORIES.map(c => row(`${c.icon} ${c.label}`, `${c.type}${c.archived ? ' · 已归档' : ''}`, null, () => open('category', c), c.name === '其他' || c.archived ? null : async () => {
        try { await ledger.archiveCategory(c.name); await refresh(); } catch (e) { showMessage(e.message, true); }
      })));
      const journal = (await ledger.journal()).sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
      document.querySelector('#asset-history').replaceChildren(...journal.map(j => row(accounts.find(a => a.id === j.accountId)?.name || '历史账户', `${new Date(j.createdAt).toLocaleString('zh-CN')} · ${j.kind}`, j.delta / 100)));
      const canvas = document.querySelector('#asset-trend');
      const width = canvas.width = 600, height = canvas.height = 160;
      const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, width, height);
      let total = 0; const points = [0, ...[...journal].reverse().map(j => (total += j.delta) / 100)];
      const min = Math.min(...points), max = Math.max(...points), range = max - min || 1;
      ctx.strokeStyle = '#557fc4'; ctx.lineWidth = 2; ctx.beginPath();
      points.forEach((p, i) => { const x = 12 + i / Math.max(1, points.length - 1) * (width - 24), y = 145 - (p - min) / range * 130; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
      const select = document.querySelector('#bill-account'); const selected = select.value;
      select.replaceChildren(new Option('未指定账户', ''), ...accounts.filter(a => !a.archived).map(a => new Option(a.name, a.id)));
      select.value = selected;
      const categories = document.querySelector('#bill-category'); const chosen = categories.value;
      categories.replaceChildren(...CATEGORIES.filter(c => !c.archived).map(c => new Option(`${c.icon} ${c.label}`, c.name)));
      if ([...categories.options].some(o => o.value === chosen)) categories.value = chosen;
    },
    fillAccount(id) {
      const select = document.querySelector('#bill-account');
      if (id != null && ![...select.options].some(o => o.value === String(id))) {
        const a = accounts.find(a => a.id === id); select.add(new Option(`${a?.name ?? '历史账户'}（已归档）`, id));
      }
      select.value = id ?? '';
    }
  };
}
