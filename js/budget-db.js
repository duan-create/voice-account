import { initDB } from "./db.js";
import { CATEGORIES } from "./finance.js";

function validLimit(value) {
  return Number.isFinite(value) && value > 0 && Number.isSafeInteger(Math.round(value * 100))
    && Math.round(value * 100) / 100 === value;
}

async function transact(mode, settings) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("budgets", mode);
    const store = transaction.objectStore("budgets");
    const request = mode === "readonly" ? store.get("monthly") : store.put(settings, "monthly");
    transaction.oncomplete = () => resolve(mode === "readonly" ? request.result ?? { total: null, categories: {} } : settings);
    transaction.onabort = () => reject(transaction.error || new Error("Budget transaction aborted."));
  });
}

export function getBudget() {
  return transact("readonly");
}

export async function saveBudget(settings) {
  const total = settings.total ?? null;
  const categories = {};
  if (total !== null && !validLimit(total)) throw new TypeError("Invalid total budget.");
  for (const { name } of CATEGORIES) {
    const limit = settings.categories[name];
    if (limit == null) continue;
    if (!validLimit(limit)) throw new TypeError("Invalid category budget.");
    categories[name] = limit;
  }
  return transact("readwrite", { total, categories });
}
