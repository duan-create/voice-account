import { initDB } from "./db.js";

try {
  const db = await initDB();
  console.info(`[DB] Initialized: ${db.name}, version ${db.version}`);
} catch (error) {
  console.error("[DB] Initialization failed:", error);
}

if (new URLSearchParams(location.search).get("db-self-test") === "1") {
  try {
    const { runDBSelfTest } = await import("./db.selftest.js");
    await runDBSelfTest();
  } catch (error) {
    console.error("[DB self-test] Failed:", error);
  }
}
