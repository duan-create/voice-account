function validateBill(bill) {
  if (!["收入", "支出"].includes(bill.type)
    || !Number.isFinite(bill.amount)
    || !Number.isFinite(bill.date)
    || typeof bill.category !== "string"
    || typeof bill.remark !== "string") {
    throw new TypeError("A bill requires a valid type, numeric amount/date and string category/remark.");
  }
}

// The factory lets the console self-test use a separate database.
export function createBillDB(name = "voice-account-db") {
  let dbPromise;

  function initDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("bills")) {
            db.createObjectStore("bills", { keyPath: "id", autoIncrement: true });
          }
          if (!db.objectStoreNames.contains("budgets")) db.createObjectStore("budgets");
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            dbPromise = undefined;
          };
          resolve(db);
        };
        request.onerror = () => reject(request.error);
      }).catch((error) => {
        dbPromise = undefined;
        throw error;
      });
    }
    return dbPromise;
  }

  async function transact(mode, operation) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("bills", mode);
      let result;
      // A successful request can still be followed by a transaction failure.
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error || new Error("Bill transaction aborted."));
      const fail = (error) => {
        transaction.abort();
        reject(error);
      };
      try {
        operation(transaction.objectStore("bills"), (value) => { result = value; }, fail);
      } catch (error) {
        fail(error);
      }
    });
  }

  async function addBill(bill) {
    const record = {
      type: bill.type,
      amount: bill.amount,
      category: bill.category,
      remark: bill.remark ?? "",
      date: bill.date,
      createdAt: Date.now()
    };
    validateBill(record);
    return transact("readwrite", (store, done) => {
      const request = store.add(record);
      request.onsuccess = () => done(request.result);
    });
  }

  async function getBills() {
    const bills = await transact("readonly", (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done(request.result);
    });
    return bills.sort((a, b) => b.date - a.date);
  }

  function updateBill(id, bill) {
    return transact("readwrite", (store, done, fail) => {
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) {
          done(null);
          return;
        }
        try {
          const record = { ...request.result, ...bill, id, createdAt: request.result.createdAt };
          validateBill(record);
          const update = store.put(record);
          update.onsuccess = () => done(record);
        } catch (error) {
          fail(error);
        }
      };
    });
  }

  function deleteBill(id) {
    return transact("readwrite", (store, done) => {
      const request = store.delete(id);
      request.onsuccess = () => done();
    });
  }

  async function getMonthSummary() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    let income = 0;
    let expense = 0;
    for (const bill of await getBills()) {
      if (bill.date >= start && bill.date < end) {
        // Sum in cents to avoid common floating-point errors in yuan amounts.
        if (bill.type === "收入") income += Math.round(bill.amount * 100);
        if (bill.type === "支出") expense += Math.round(bill.amount * 100);
      }
    }
    return { income: income / 100, expense: expense / 100 };
  }

  return { initDB, addBill, getBills, updateBill, deleteBill, getMonthSummary };
}

export const { initDB, addBill, getBills, updateBill, deleteBill, getMonthSummary } = createBillDB();
