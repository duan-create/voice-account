import { ledger } from './ledger-api.js';
import { encodeCSV, previewCSV, importCSV, snapshot, restore, validateSnapshot, HEADERS, tableRows } from './backup.js';
import { dateKey } from './calendar.js';
import { isAndroidNative } from './native-voice.js';

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
export function setupBackup({ refresh, showMessage, viewport }) {
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
        document.querySelector('#import-preview').textContent = `将替换本机全部数据：${data.bills.length}笔账单、${data.accounts.length}个账户。请先导出当前完整备份。旧版账单备份不含账户和预算。`;
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
    try {
      if (pending.input) await restore(pending.input, ledger); else await importCSV(pending.rows, ledger);
      pending = null; dialog.close(); await refresh(); showMessage('导入完成。');
    } catch (e) { showMessage(`导入失败：${e.message}`, true); }
    finally { running = false; document.querySelector('#confirm-import').disabled = false; }
  };
}
