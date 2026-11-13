import { ledger } from './ledger-api.js';
import { encodeCSV, previewCSV, importCSV, snapshot, restore, validateSnapshot, HEADERS, tableRows } from './backup.js';
import { dateKey } from './calendar.js';
import { isAndroidNative } from './native-voice.js';
import { createAutoBackupStore } from './auto-backup.js';
import { requestDelete } from './ui.js';

export async function saveFile(name, mime, blob) {
  if (isAndroidNative()) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    await window.Capacitor.registerPlugin('DocumentsPlugin').save({ name, mime, base64: btoa(binary) });
    return;
  }
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function setupBackup({ refresh, showMessage, viewport, setBusy = () => {} }) {
  const copies = createAutoBackupStore();
  const settings = document.querySelector('#settings-view');
  const dialog = document.querySelector('#import-dialog');
  let pending = null, running = false;
  async function exportFile(format) {
    try {
      const name = `voice-account-${dateKey()}`;
      if (format === 'json') await saveFile(`${name}.json`, 'application/json', new Blob([JSON.stringify(await snapshot(ledger), null, 2)]));
      else {
        const bills = await ledger.bills(), accounts = await ledger.accounts();
        if (format === 'csv') await saveFile(`${name}.csv`, 'text/csv', new Blob([encodeCSV(bills, accounts)], { type: 'text/csv;charset=utf-8' }));
        else {
          const book = new globalThis.ExcelJS.Workbook(), sheet = book.addWorksheet('账单');
          sheet.addRow(HEADERS); sheet.addRows(tableRows(bills, accounts)); sheet.getRow(1).font = { bold: true };
          sheet.columns.forEach(c => { c.width = 20; });
          await saveFile(`${name}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', new Blob([await book.xlsx.writeBuffer()]));
        }
      }
      showMessage('文件已生成，请确认保存位置。');
    } catch (e) { showMessage(`导出未完成：${e.message}`, true); }
  }
  for (const button of document.querySelectorAll('[data-export]')) button.onclick = () => exportFile(button.dataset.export);
  document.querySelector('#import-file').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    pending = null;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('导入文件不能大于20MB。');
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.json')) {
        const input = JSON.parse(text), data = validateSnapshot(input);
        pending = { input };
        document.querySelector('#import-preview').textContent = `将替换本机全部数据：${data.bills.length}笔账单、${data.accounts.length}个账户。请先导出当前完整备份。旧版账单备份不含账户和预算。恢复后旧的原生待同步计划记录将被清除，备份中的计划从下次时间起执行。`;
      } else {
        const rows = await previewCSV(text, ledger); pending = { rows };
        document.querySelector('#import-preview').textContent = rows.map(r => `第${r.row}行 · ${r.bill.category} ${r.bill.amount}元 · ${r.errors.join('、') || '通过'}`).join('\n');
      }
      document.querySelector('#confirm-import').disabled = !!pending.rows?.some(r => r.errors.length);
      dialog.showModal(); viewport();
    } catch (e) { showMessage(e.message, true); }
    event.target.value = '';
  };
  document.querySelector('#cancel-import').onclick = () => { if (!running) dialog.close(); };
  dialog.oncancel = event => { if (running) event.preventDefault(); };
  document.querySelector('#confirm-import').onclick = async () => {
    if (!pending || running) return;
    running = true; document.querySelector('#confirm-import').disabled = true;
    setBusy(true);
    try {
      if (pending.input) { await automatic(); await restore(pending.input, ledger); } else await importCSV(pending.rows, ledger);
      pending = null; dialog.close(); await refresh(); showMessage('导入完成。');
    } catch (e) { showMessage(`导入失败：${e.message}`, true); }
    finally { running = false; setBusy(false); document.querySelector('#confirm-import').disabled = false; }
  };
  async function automatic() {
    const result = await copies.save(await snapshot(ledger));
    if (result.warning) showMessage(result.warning, true);
    return result;
  }
  async function renderCopies() {
    const [items, directory] = await Promise.all([copies.list(), copies.directory()]);
    document.querySelector('#backup-directory-status').textContent = directory.authorized ? '公共目录已授权，自动备份会同步副本。卸载重装后需重新授权。' : '仅保存在应用私有存储，卸载或清除数据会删除这些备份。';
    document.querySelector('#choose-backup-directory').hidden = !isAndroidNative();
    document.querySelector('#backup-records').replaceChildren(...items.map(item => {
      const row = document.createElement('li'); row.className = 'manage-row';
      const label = document.createElement('div'); label.textContent = new Date(item.createdAt).toLocaleString('zh-CN'); row.append(label);
      for (const [title, action] of [
        ['导出', async () => { const data = await copies.read(item.id); await saveFile(`voice-account-backup-${item.createdAt}.json`, 'application/json', new Blob([JSON.stringify(data, null, 2)])); showMessage('备份文件已生成。'); }],
        ['恢复', async () => {
          // Read before rotation: the selected oldest copy may be evicted by the safety backup.
          const data = await copies.read(item.id); validateSnapshot(data);
          if (!await requestDelete('恢复将替换全部本地账单、账户与预算。恢复前会自动备份当前数据，是否继续？', viewport, { title: '恢复这份备份？', confirm: '确认恢复' })) return;
          setBusy(true);
          try { await automatic(); await restore(data, ledger); await refresh(); await renderCopies(); showMessage('备份已恢复。'); }
          finally { setBusy(false); }
        }]
      ]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'text-button'; button.textContent = title;
        button.onclick = async () => {
          if (running) return; running = true;
          try { await action(); } catch (e) { showMessage(`操作未完成：${e.message}`, true); }
          finally { running = false; }
        }; row.append(button);
      }
      return row;
    }));
    document.querySelector('#backup-records-empty').hidden = items.length > 0;
  }
  document.querySelector('#open-settings').onclick = async () => {
    settings.hidden = false;
    try { await renderCopies(); } catch (e) { showMessage(`备份列表加载失败：${e.message}`, true); }
  };
  document.querySelector('#close-settings').onclick = () => { settings.hidden = true; document.querySelector('#open-settings').focus(); };
  document.querySelector('#backup-now').onclick = async () => {
    if (running) return; running = true;
    try { const result = await automatic(); await renderCopies(); showMessage(result.warning || '本地备份已完成。', Boolean(result.warning)); }
    catch (e) { showMessage(`备份失败：${e.message}`, true); }
    finally { running = false; }
  };
  document.querySelector('#choose-backup-directory').onclick = async () => {
    try { await copies.chooseDirectory(); await renderCopies(); showMessage('公共目录已授权并同步副本。'); }
    catch (e) { showMessage(`目录授权或同步未完成：${e.message}`, true); }
  };
  return { automatic };
}
