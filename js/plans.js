import { cents, request, validBill } from './ledger.js';
import { dateKey } from './calendar.js';

export function nextTime(schedule, after = Date.now()) {
  const [hour, minute] = schedule.time.split(':').map(Number), date = new Date(after);
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() <= after) date.setDate(date.getDate() + 1);
  if (schedule.frequency === 'weekly') while (date.getDay() !== Number(schedule.weekday)) date.setDate(date.getDate() + 1);
  return date.getTime();
}
export function createPlans(ledger) {
  const api = {
    async saveGoal(draft) {
      const target = cents(draft.target, true), daily = cents(draft.daily, true);
      if (!draft.name?.trim() || Number(draft.from) === Number(draft.to)) throw new Error('请填写目标，并选择不同的来源和存钱账户。');
      const accounts = await ledger.accounts();
      for (const id of [Number(draft.from), Number(draft.to)]) if (!accounts.some(a => a.id === id && !a.archived)) throw new Error('请选择有效账户。');
      const id = draft.id || crypto.randomUUID();
      await ledger.put('goals', { id, name: draft.name.trim(), target, daily, from: Number(draft.from), to: Number(draft.to), archived: false }); return id;
    },
    async goals() {
      const [goals, checks] = await Promise.all([ledger.all('goals'), ledger.all('checkins')]);
      return goals.map(g => ({ ...g, saved: checks.filter(c => c.goalId === g.id).reduce((s, c) => s + c.amount, 0) / 100 }));
    },
    checkIn(id, now = Date.now()) {
      return ledger.transact(['accounts', 'journal', 'transfers', 'goals', 'checkins'], 'readwrite', async s => {
        const goal = await request(s.goals.get(id)), checks = await request(s.checkins.getAll());
        if (!goal || goal.archived) throw new Error('目标不存在。');
        if (checks.some(c => c.goalId === id && dateKey(c.date) === dateKey(now))) throw new Error('今天已打卡。');
        const saved = checks.filter(c => c.goalId === id).reduce((sum, c) => sum + c.amount, 0);
        const amount = Math.min(goal.daily, goal.target - saved);
        if (amount <= 0) throw new Error('目标已完成。');
        const transferId = await ledger.move(s, { from: goal.from, to: goal.to, amount: amount / 100, date: now, remark: goal.name }, 'saving');
        await request(s.checkins.add({ goalId: id, date: now, amount, transferId }));
      });
    },
    async saveSchedule(draft) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time) || !['daily', 'weekly'].includes(draft.frequency) || !['reminder', 'bill'].includes(draft.kind) || (draft.frequency === 'weekly' && ![0,1,2,3,4,5,6].includes(Number(draft.weekday)))) throw new Error('时间或频率无效。');
      if (draft.kind === 'bill') {
        validBill({ ...draft.bill, date: Date.now() }); cents(draft.bill.amount, true);
        if (draft.bill.accountId != null && !(await ledger.accounts()).some(a => a.id === Number(draft.bill.accountId) && !a.archived)) throw new Error('请选择有效账户。');
        if (!(await ledger.categories()).some(c => c.name === draft.bill.category && !c.archived)) throw new Error('请选择有效分类。');
      }
      const schedule = { ...draft, id: draft.id || crypto.randomUUID(), enabled: true, next: nextTime(draft), revision: crypto.randomUUID(), createdAt: Date.now() };
      await ledger.put('schedules', schedule); return schedule;
    },
    async accept(item) {
      if (!item.id || !Number.isFinite(item.date) || !['bill', 'reminder'].includes(item.kind)) throw new Error('定时记录无效。');
      return ledger.transact(['occurrences', 'bills', 'billAccounts', 'accounts', 'journal'], 'readwrite', async s => {
        if (await request(s.occurrences.get(item.id))) return false;
        if (item.kind === 'bill') await ledger.mutateBill(s, null, { ...item.bill, date: item.date });
        await request(s.occurrences.put({ ...item, importedAt: Date.now() }));
        return true;
      });
    },
    async catchUp(now = Date.now()) {
      let changed = false;
      for (const schedule of await ledger.all('schedules')) {
        if (!schedule.enabled) continue;
        let date = schedule.next;
        let count = 0;
        while (date <= now && count++ < 366) {
          await api.accept({ id: `${schedule.id}:${date}`, kind: schedule.kind, date, bill: schedule.bill });
          date = nextTime(schedule, date); changed = true;
        }
        if (date !== schedule.next) await ledger.put('schedules', { ...schedule, next: date });
      }
      return changed;
    }
  };
  return api;
}
