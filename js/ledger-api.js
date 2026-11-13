import { initDB } from './db.js';
import { createLedger } from './ledger.js';
export const ledger = createLedger(initDB);
