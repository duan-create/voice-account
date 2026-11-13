# Personal Ledger Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. Steps use checkbox syntax for tracking. Independent agents are unavailable on this host (unsupported encrypted agent content).

**Goal:** Extend the existing offline personal ledger without losing legacy bills or budgets.

**Architecture:** Keep the existing bills/budgets object stores and fields. Add independent account, journal, bill-account association, category, transfer, goal, schedule, occurrence and settings stores in a single IndexedDB upgrade. All financial mutations commit atomically. Android alarms persist occurrences before the WebView imports and acknowledges them.

**Tech Stack:** Static ES modules, IndexedDB, native Canvas, Capacitor 8, Java Android alarms/notifications, existing whisper.cpp. Locally bundled CSV/Excel libraries; no remote runtime dependencies.

**Spec:** User-approved compatibility and financial rules in this chat, 2026-11-13. This document records the accepted design and its execution checkpoints.

## Global Constraints

- Preserve bills/budgets key paths, IDs, fields and all existing records; old bills have no account and never debit new opening balances.
- Store money movements as integer cents; journal bill edits/deletes as reversals; transfer/saving never count as income or expense.
- Archive referenced accounts/categories. Preserve archived category labels and historical balances.
- Existing voice-parser.js amount/ambiguity rules and the offline model remain intact. A separate category adapter may resolve unambiguous new aliases only.
- Home budgets remain actual-current-month, independent from selected calendar/statistics month.
- No backend or online runtime assets. Native alarms may be delayed by Android and stopped by force-stop; never promise exact delivery.
- Imported native occurrence IDs are unique; acknowledge only after the IndexedDB transaction commits.
- Test before implementation, commit each module separately; do not push. Native build and physical-device verification must be reported separately.

## Task 1: Data Foundation, Accounts And Categories

Files: js/db.js, js/ledger.js, js/ledger-api.js, js/categories.js, js/assets-ui.js, js/finance.js, js/app.js, index.html, css/style.css, sw.js, tests/ledger.test.cjs.

Interfaces: createLedger(openDB) returns account/category CRUD, transfer, journal access and atomic bill operations. getBills preserves raw old records and joins account IDs only from independent metadata. category registry includes archived historical names. UI uses existing confirmation/Toast facilities.

- [ ] Tests: seed v2 bills ID 17 and a budget, upgrade, assert exact old record and budget; opening 1000, expense 28.50 -> 971.50, edit 30 -> 970, delete -> 1000; move a bill between accounts; reject nonexistent accounts without bill/ledger writes; transfer 100 preserves net assets and bill count; archive preserves history.
- [ ] Implement stores and operations; expose asset/category editors and account selection in the existing bill form. Run new tests plus npm test.
- [ ] Update offline resource list and documentation. Commit `feat: add compatible account ledger and custom categories`.

## Task 2: Calendar, Search And Statistics

Files: js/calendar.js, js/calendar-ui.js, js/search-ui.js, js/finance.js, js/finance-ui.js, js/charts.js, js/app.js, index.html, css/style.css, tests/calendar.test.cjs, tests/system-ui.test.cjs.

- [ ] Test February leap dates, month boundaries, income/expense cents, AND-combined search filters, inclusive date range and stable descending ordering.
- [ ] Implement month calendar/day selection with red income/green expense, monthly balance, global search with saved queries, expense ranking and annual 12-month trends. Preserve voice form and current-month budgets.
- [ ] Browser-check 320/375/desktop widths, calendar navigation and edit/delete from search. Commit `feat: add calendar ledger search and annual statistics`.

## Task 3: Import, Export And Restore

Files: js/backup.js, js/backup-ui.js, scripts/prepare-web.cjs, package.json/lock, native DocumentsPlugin.java, index.html, tests/backup.test.cjs.

- [ ] Test CSV escaping/newlines/BOM, invalid dates/money/account/category preview, legacy JSON and full versioned snapshot, invalid restore leaves database unchanged, restoration preserves IDs and account journal consistency.
- [ ] Bundle PapaParse and ExcelJS locally. Export full-field CSV/XLSX; import CSV with preview, explicit new category/account mappings, atomic import; JSON snapshot/restore all stores in one transaction after validation/confirmation. Old bills-only JSON restores without assigning accounts.
- [ ] Android ACTION_CREATE_DOCUMENT saves files chosen by user; browser retains normal downloads. Commit `feat: add csv excel export and complete local backup restore`.

## Task 4: Goals And Persistent Schedules

Files: js/plans.js, js/plans-ui.js, native PlannerPlugin.java / PlannerReceiver.java / LocalPlanner.java, AndroidManifest.xml, MainActivity.java, tests/plans.test.cjs.

- [ ] Test transfer-backed goal progress, no double count, insufficient/archived accounts, daily/weekly time advancement, duplicate occurrences and transaction failures.
- [ ] Implement goals/check-ins and daily/weekly reminders/auto-bills. Native receiver commits outbox before notification; boot/time-change reschedules. JS imports occurrences atomically then acknowledges. PWA catches up only while open and states background limitation.
- [ ] Commit `feat: add savings goals and persistent offline scheduled bills`.

## Task 5: Voice, Integration And Regression

Files: js/voice-category.js, js/voice.js, whisper-jni.cpp, tests/voice-category.test.cjs, tests/system-ui.test.cjs, README.md, offline/build preparation.

- [ ] Test custom alias uniqueness, preservation of original six rules and ambiguous amount safety; explicit states for recognition success/failure.
- [ ] Keep bundled multilingual model and offline Android routing; use short accounting vocabulary as a decoding prompt without changing numeric parsing or auto-saving. Document accuracy limitations.
- [ ] Run complete unit/browser regressions, resource sync/hash checks, Java/native configuration checks without claiming a device pass. Commit `feat: refine offline voice feedback and verify personal ledger workflows`.

## Progress

- Plan approved in chat. Implementation in progress; check task boxes and append actual verification/commit evidence as work completes.
- Tasks 1-3 committed: `8921341`, `80733df`, `76b52d1`; unit regression at module 3: 104/104. Focused browser coverage includes accounts/calendar/search/CSV/Excel/JSON.
- Task 4 implemented: 111/111 unit tests; focused browser scenarios 3/3 (account rollback workflow, backup/import, savings and schedule persistence), 320/375/1024 width checks. Android plugin source and manifest integrated; native compilation/device execution not verified because local SDK/NDK are absent.
