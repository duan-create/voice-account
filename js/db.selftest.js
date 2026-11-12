import * as dbModule from "./db.js";

export async function runDBSelfTest() {
  let passed = 0;
  function check(condition, description) {
    if (!condition) {
      throw new Error(`[DB self-test] FAIL: ${description}`);
    }
    passed += 1;
    console.info(`[DB self-test] PASS: ${description}`);
  }

  check(typeof dbModule.createBillDB === "function", "Isolated database API is available");
  const name = `voice-account-db-self-test-${crypto.randomUUID()}`;
  let api = dbModule.createBillDB(name);
  let connection;

  try {
    const connections = await Promise.all([api.initDB(), api.initDB()]);
    connection = connections[0];
    const store = connection.transaction("bills").objectStore("bills");
    check(connection === connections[1] && store.keyPath === "id" && store.autoIncrement,
      "Initialization shares one connection and creates the auto-increment store");
    check((await api.getBills()).length === 0, "A new database has no bills");
    const emptySummary = await api.getMonthSummary();
    check(emptySummary.income === 0 && emptySummary.expense === 0, "Empty monthly totals are zero");

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    const base = { type: "收入", amount: 100.1, category: "test", remark: "self-test", date: start };
    const beforeAdd = Date.now();
    const incomeId = await api.addBill({ ...base, id: 9999, createdAt: 1 });
    const expenseId = await api.addBill({ ...base, type: "支出", amount: 20.3, date: start + 60000 });
    const lateId = await api.addBill({ ...base, amount: 0.2, date: end - 1 });
    const previousId = await api.addBill({ ...base, type: "支出", amount: 777, date: start - 1 });
    const nextId = await api.addBill({ ...base, amount: 999, date: end });
    let bills = await api.getBills();
    const income = bills.find((bill) => bill.id === incomeId);
    check(Number.isInteger(incomeId) && expenseId > incomeId && incomeId !== 9999,
      "Adds return generated numeric IDs instead of caller IDs");
    check(income.type === "收入" && income.amount === 100.1 && income.category === "test"
      && income.remark === "self-test" && income.date === start && income.createdAt >= beforeAdd,
      "Bill fields and an automatic creation timestamp are persisted");
    check(JSON.stringify(bills.map((bill) => bill.id))
      === JSON.stringify([nextId, lateId, expenseId, incomeId, previousId]),
      "Bills are returned in descending date order");

    const originalExpense = bills.find((bill) => bill.id === expenseId);
    const updated = await api.updateBill(expenseId, { amount: 30.4, remark: "updated", id: 9999, createdAt: 1 });
    bills = await api.getBills();
    const expense = bills.find((bill) => bill.id === expenseId);
    check(updated.amount === 30.4 && expense.amount === 30.4 && expense.remark === "updated"
      && expense.type === "支出" && expense.date === originalExpense.date
      && expense.createdAt === originalExpense.createdAt && expense.id === expenseId,
      "Partial updates persist while preserving the ID, creation timestamp and other fields");
    check(await api.updateBill(9999, { amount: 1 }) === null, "Updating a missing bill does not insert it");

    let invalidRejected = false;
    try {
      await api.addBill({ ...base, amount: NaN });
    } catch (error) {
      invalidRejected = error instanceof TypeError;
    }
    check(invalidRejected && (await api.getBills()).length === 5, "Invalid numeric data is rejected without a write");
    let invalidUpdateRejected = false;
    try {
      await api.updateBill(expenseId, { amount: 500, category: 123 });
    } catch (error) {
      invalidUpdateRejected = error instanceof TypeError;
    }
    check(invalidUpdateRejected && (await api.getBills()).find((bill) => bill.id === expenseId).amount === 30.4,
      "A failed update rejects and leaves the stored bill unchanged");
    const summary = await api.getMonthSummary();
    check(summary.income === 100.3 && summary.expense === 30.4,
      "Monthly totals include both month boundaries correctly and exclude other months");

    connection.close();
    api = dbModule.createBillDB(name);
    connection = await api.initDB();
    check((await api.getBills()).find((bill) => bill.id === expenseId).amount === 30.4,
      "Committed data survives closing and reopening the database");
    const zeroId = await api.addBill({ type: "支出", amount: 0, category: "test", date: start });
    const zero = (await api.getBills()).find((bill) => bill.id === zeroId);
    check(zero.amount === 0 && zero.remark === "", "Zero amounts are preserved and omitted remarks default to an empty string");
    await api.deleteBill(zeroId);
    await api.deleteBill(expenseId);
    check(!(await api.getBills()).some((bill) => bill.id === expenseId), "Deleting a bill persists");
    await api.deleteBill(expenseId);
    check((await api.getBills()).length === 4, "Deleting a missing bill is harmless");
    await Promise.all((await api.getBills()).map((bill) => api.deleteBill(bill.id)));
    await Promise.all([api.addBill({ ...base, amount: 0.1 }), api.addBill({ ...base, amount: 0.2 })]);
    const decimalSummary = await api.getMonthSummary();
    check(decimalSummary.income === 0.3 && decimalSummary.expense === 0,
      "Decimal totals avoid the 0.1 + 0.2 floating-point artifact");
  } finally {
    connection?.close();
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  console.info(`[DB self-test] ${passed} checks passed; test database removed.`);
  return { passed };
}
