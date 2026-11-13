import { ledger } from './ledger-api.js';
import { createPlans, nextTime } from './plans.js';
import { money, CATEGORIES } from './finance.js';
import { isAndroidNative } from './native-voice.js';
import { dateKey } from './calendar.js';

export function setupPlans({ refresh, showMessage, viewport, addAccount }) {
  const plans = createPlans(ledger), native = isAndroidNative() ? window.Capacitor.registerPlugin('PlannerPlugin') : null;
  const dialog = document.querySelector('#plan-dialog'), form = document.querySelector('#plan-form');
  let mode = 'goal', syncing = false, editing = null;
  async function sync() {
    if (syncing) return false;
    syncing = true;
    try {
      let changed = false;
      if (native) {
        let epoch = (await ledger.all('settings')).find(s => s.id === 'planner-epoch')?.value;
        if (!epoch) { epoch = crypto.randomUUID(); await ledger.put('settings', { id: 'planner-epoch', value: epoch }); }
        await native.configure({ epoch, schedules: await ledger.all('schedules') });
        const result = await native.pending();
        for (const item of result.items) { changed = await plans.accept(item) || changed; await native.acknowledge({ id: item.id }); }
      } else changed = await plans.catchUp();
      return changed;
    } catch (e) { showMessage(`定时任务同步未完成：${e.message}，待处理记录会保留重试。`, true); return false; }
    finally { syncing = false; }
  }
  async function open(next, record = null) {
    mode = next; editing = record?.id ?? null; form.reset(); document.querySelector('#plan-error').textContent = '';
    document.querySelector('#plan-title').textContent = mode === 'goal' ? (editing ? '编辑存钱目标' : '新建存钱目标') : (editing ? '编辑定时计划' : '新增定时计划');
    for (const group of form.querySelectorAll('[data-plan]')) { group.hidden = group.dataset.plan !== mode; group.disabled = group.hidden; }
    const accounts = (await ledger.accounts()).filter(a => !a.archived);
    for (const name of ['goalFrom', 'goalTo', 'scheduleAccount']) form.elements.namedItem(name).replaceChildren(...(name === 'scheduleAccount' ? [new Option('未指定账户', '')] : []), ...accounts.map(a => new Option(a.name, a.id)));
    const needsAccounts = mode === 'goal' && accounts.length < 2;
    document.querySelector('#goal-account-help').hidden = !needsAccounts;
    form.querySelector('[type=submit]').disabled = needsAccounts;
    if (!accounts.length) for (const name of ['goalFrom', 'goalTo']) form.elements.namedItem(name).add(new Option('请先添加账户', ''));
    if (accounts.length > 1) form.elements.namedItem('goalTo').selectedIndex = 1;
    form.elements.namedItem('scheduleCategory').replaceChildren(...CATEGORIES.filter(c => !c.archived).map(c => new Option(c.label, c.name)));
    if (record) {
      const values = mode === 'goal' ? { goalName: record.name, target: record.target / 100, daily: record.daily / 100, goalFrom: record.from, goalTo: record.to } : { kind: record.kind, frequency: record.frequency, weekday: record.weekday, time: record.time, scheduleType: record.bill?.type, scheduleAmount: record.bill?.amount, scheduleCategory: record.bill?.category, scheduleAccount: record.bill?.accountId ?? '', scheduleRemark: record.bill?.remark };
      for (const [key, value] of Object.entries(values)) if (value != null) form.elements.namedItem(key).value = value;
    }
    updateBillFields();
    dialog.showModal(); viewport();
  }
  document.querySelector('#add-goal').onclick = () => open('goal');
  document.querySelector('#add-schedule').onclick = () => open('schedule');
  document.querySelector('#cancel-plan').onclick = () => dialog.close();
  document.querySelector('#goal-add-account').onclick = () => { dialog.close(); addAccount(); };
  document.querySelector('#notification-permission').onclick = async () => {
    if (!native) return showMessage('网页仅在页面打开时处理到期计划；安卓安装版支持离线系统通知。');
    try { const result = await native.requestNotifications(); showMessage(result.granted ? '通知权限已开启。' : '通知未获授权，定时记录仍保留。'); } catch (e) { showMessage(e.message, true); }
  };
  function updateBillFields() { const group = form.querySelector('#schedule-bill-fields'); group.disabled = form.elements.namedItem('kind').value !== 'bill'; group.hidden = group.disabled; }
  form.elements.namedItem('kind').onchange = updateBillFields;
  form.onsubmit = async event => {
    event.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true;
    const f = Object.fromEntries(new FormData(form));
    try {
      if (mode === 'goal') await plans.saveGoal({ id: editing, name: f.goalName, target: Number(f.target), daily: Number(f.daily), from: f.goalFrom, to: f.goalTo });
      else await plans.saveSchedule({ id: editing, kind: f.kind, frequency: f.frequency, weekday: Number(f.weekday), time: f.time, bill: f.kind === 'bill' ? { type: f.scheduleType, amount: Number(f.scheduleAmount), category: f.scheduleCategory, accountId: f.scheduleAccount ? Number(f.scheduleAccount) : null, remark: f.scheduleRemark || '' } : null });
      await sync(); dialog.close(); await refresh(); showMessage('计划已保存。');
    } catch (e) { document.querySelector('#plan-error').textContent = e.message; }
    finally { button.disabled = false; }
  };
  function button(label, action) { const b = document.createElement('button'); b.type = 'button'; b.className = 'text-button'; b.textContent = label; b.onclick = action; return b; }
  return {
    sync,
    async update() {
      const goals = await plans.goals(), checks = await ledger.all('checkins');
      document.querySelector('#goal-list').replaceChildren(...goals.filter(g => !g.archived).map(g => {
        const row = document.createElement('li'); row.className = 'goal-row';
        const title = document.createElement('strong'); title.textContent = g.name;
        const progress = document.createElement('progress'); progress.max = g.target; progress.value = Math.round(g.saved * 100); progress.setAttribute('aria-label', `${g.name}存钱进度`);
        const detail = document.createElement('p'); detail.textContent = `已存 ¥${money.format(g.saved)} / ${money.format(g.target / 100)} · 差 ¥${money.format(Math.max(0, g.target / 100 - g.saved))} · 每日 ¥${money.format(g.daily / 100)}`;
        const done = checks.some(c => c.goalId === g.id && dateKey(c.date) === dateKey());
        const check = button(done ? '今日已打卡' : '今日存钱', async () => { try { await plans.checkIn(g.id); await refresh(); showMessage('存钱成功，已完成账户划转。'); } catch (e) { showMessage(e.message, true); } }); check.disabled = done;
        row.append(title, progress, detail, check, button('编辑', () => open('goal', g)), button('归档目标', async () => { const { saved, ...record } = g; await ledger.put('goals', { ...record, archived: true }); await refresh(); }));
        const log = document.createElement('p'); log.className = 'muted'; log.textContent = checks.filter(c => c.goalId === g.id).map(c => `${dateKey(c.date)} ¥${money.format(c.amount / 100)}`).join(' · '); row.append(log); return row;
      }));
      document.querySelector('#today-saving').textContent = goals.some(g => !g.archived) ? `今日已存 ¥${money.format(checks.filter(c => dateKey(c.date) === dateKey()).reduce((s, c) => s + c.amount, 0) / 100)}` : '';
      document.querySelector('#schedule-list').replaceChildren(...(await ledger.all('schedules')).map(s => {
        const row = document.createElement('li'); row.className = 'manage-row'; const text = document.createElement('span');
        text.textContent = `${s.kind === 'bill' ? '自动记账' : '记账提醒'} · ${s.frequency === 'daily' ? '每天' : `每周${['日','一','二','三','四','五','六'][s.weekday]}`} ${s.time}${s.enabled ? '' : ' · 已停用'}`;
        row.append(text, button('编辑', () => open('schedule', s)), button(s.enabled ? '停用' : '启用', async () => {
          try {
            if (s.enabled) await ledger.put('schedules', { ...s, enabled: false, next: nextTime(s), revision: crypto.randomUUID() });
            else await plans.saveSchedule(s);
            await sync(); await refresh();
          } catch (e) { showMessage(e.message, true); }
        })); return row;
      }));
    }
  };
}
