import { calendarMonth, dateKey } from './calendar.js';
import { money } from './finance.js';
import { animateAmount, fitAmount, stopAmountAnimation } from './ui.js';

export function setupCalendar({ render, viewport, showMessage, onDisplay }) {
  let records = [], month = null, selected = null, lastSummary = '';
  function display() {
    const shown = month ?? new Date();
    const data = calendarMonth(records, shown);
    document.querySelector('#home-month').textContent = `${shown.getFullYear()}年${shown.getMonth() + 1}月`;
    document.querySelector('#home-next').disabled = dateKey(shown).slice(0, 7) >= dateKey().slice(0, 7);
    const summaryKey = `${dateKey(shown).slice(0, 7)}:${data.income}:${data.expense}`;
    for (const [id, value] of [['month-income', data.income], ['month-expense', data.expense], ['month-balance', data.balance]]) {
      const element = document.querySelector(`#${id}`);
      if (summaryKey !== lastSummary) {
        stopAmountAnimation(element); element.textContent = money.format(value); fitAmount(element, id === 'month-balance' ? '1.125rem' : '2rem');
        if (id !== 'month-balance') animateAmount(element, value);
      }
    }
    lastSummary = summaryKey;
    const grid = document.querySelector('#calendar-grid'); grid.replaceChildren();
    for (let i = 0; i < data.offset; i++) { const blank = document.createElement('span'); blank.setAttribute('aria-hidden', 'true'); grid.append(blank); }
    for (const day of data.days) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'calendar-day'; button.dataset.date = day.date;
      const balance = Math.round(day.income * 100) - Math.round(day.expense * 100);
      button.dataset.balance = balance > 0 ? 'income' : balance < 0 ? 'expense' : 'neutral';
      button.classList.toggle('today', day.date === dateKey()); button.setAttribute('aria-pressed', String(day.date === selected));
      button.setAttribute('aria-label', `${day.date} 收入 ${money.format(day.income)} 支出 ${money.format(day.expense)}`);
      const number = document.createElement('b'); number.textContent = day.day; button.append(number);
      for (const [kind, value] of [['income', day.income], ['expense', day.expense]]) {
        const amount = document.createElement('span'); amount.className = `calendar-${kind}`; amount.textContent = value ? `${kind === 'income' ? '+' : '-'}${money.format(value)}` : ''; amount.title = amount.textContent; button.append(amount);
      }
      button.onclick = () => { selected = selected === day.date ? null : day.date; display(); };
      grid.append(button);
    }
    const filtered = records.filter(b => selected ? dateKey(b.date) === selected : dateKey(b.date).slice(0, 7) === dateKey(shown).slice(0, 7));
    render(filtered);
    document.querySelector('#bills-title').textContent = selected ? `${selected} 明细` : '本月账单';
    document.querySelector('#list-state').hidden = filtered.length > 0;
    document.querySelector('#list-state').textContent = filtered.length ? '' : '暂无符合条件的账单';
    document.querySelector('#empty-bills').hidden = filtered.length > 0;
    onDisplay?.();
  }
  for (const [id, offset] of [['home-previous', -1], ['home-next', 1]]) document.querySelector(`#${id}`).onclick = () => { const shown = month ?? new Date(); const next = new Date(shown.getFullYear(), shown.getMonth() + offset, 1); month = dateKey(next).slice(0, 7) === dateKey().slice(0, 7) ? null : next; selected = null; display(); };
  return { update(bills) { records = bills; display(); } };
}
