# Offline Ledger Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Complete the approved account, search/statistics, dual-backup, visual and tiny-Whisper refinement without data loss.

**Architecture:** Extend existing ledger methods and isolated UI modules. Backups live outside the ledger database, with native private files and optional SAF copies. Preserve bill mutations and speech parsing.

**Tech Stack:** Static ES modules, IndexedDB, Canvas, Capacitor 8.6, Android Java/JNI, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-refinement-design.md`

## Global Constraints

- Keep existing database version and store structures; preserve historical data and unassigned bills.
- Use integer cents and atomic financial transactions; transfers and savings never count as income/expense.
- No network dependency at runtime, audio upload, broad storage permissions or parser changes.
- Preserve red-income/green-expense calendar; brand #165DFF; motion 200-300ms.
- Model excluded from Git; Node 22/JDK 21/NDK 28.2.13676358 remain the build environment.
- User approved execution on current main; stage only this task's files, never the APK ZIP.

### Task 1: Accounts and savings selectors

**Files:** `js/ledger.js`, `js/app.js`, `js/assets-ui.js`, `js/plans-ui.js`, `index.html`, `tests/ledger.test.cjs`, browser tests.

**Interfaces:** Add `ledger.ensureDefaultAccounts(): Promise<void>`; expose `assets.openAccount()` for the no-account route. Startup calls seed after backup and before UI refresh.

- [ ] Write tests that call seed twice, preserve an existing account balance and unassigned bill, archive a default then seed again, and require eight defaults without duplicates.
- [ ] Run `node --test tests/ledger.test.cjs`; observe missing-method failure.
- [ ] Implement the settings-marked atomic seed; render all active accounts, choose distinct defaults, provide add-account action and block unusable goal submission.
- [ ] Run unit and focused browser transfer/savings regression; commit `fix: initialize default accounts and repair savings selectors`.

### Task 2: Search and statistics

**Files:** `js/calendar.js`, `js/calendar-ui.js`, new `js/search-ui.js`, `js/finance.js`, `js/finance-ui.js`, `js/charts.js`, `js/app.js`, `index.html`, `css/style.css`, `sw.js`, tests.

**Interfaces:** `setupSearch({edit, remove, showMessage, viewport}).update(bills)` and `.open(query?)`; `calculateStatistics(bills, date, yearly=false)` preserves monthly callers. UI drilldowns pass exact category, type and selected-period dates.

- [ ] Add hand-derived search tests for inclusive ranges, account/exact-category filter and stable newest-first order; add year aggregation/ranking fixtures crossing year boundaries.
- [ ] Run targeted tests and observe missing behavior.
- [ ] Separate search from calendar; reuse app edit/delete handlers; add history clear/reuse and bill detail dialog. Extend period aggregation, yearly navigation/bar drawing and rankings.
- [ ] Verify edits/deletions refresh active results, yearly totals and budget isolation; commit `feat: add bill search and optimize statistics page`.

### Task 3: Dual backup and settings

**Files:** new `js/auto-backup.js`, `js/backup-ui.js`, `js/app.js`, `index.html`, Android `DocumentsPlugin.java`, `sw.js`, tests.

**Interfaces:** `createBackupStore(indexedDB)` exposes `save(snapshot)`, `list()`, `read(id)`; UI chooses native plugin implementations of these operations when Android. `DocumentsPlugin` adds private save/list/read, select directory and public sync/status. Existing export `save` stays compatible.

- [ ] Test retention with four distinct snapshots, rollback on failed save, and that ledger snapshots never contain automatic backups.
- [ ] Run new test and observe failure.
- [ ] Implement separate web IDB and Android private directory retention. SAF persists directory URI grant; write/rotate only this app's backup files. Add settings with history/restore/export and clear storage boundary copy.
- [ ] Capture startup before migrations and snapshot before restore; failures show nonblocking warning. Validate both before replacing ledger data.
- [ ] Test real web storage/recovery and native bridge boundaries; commit `feat: add private automatic backups and optional public copies`.

### Task 4: Restrained UI

**Files:** `css/style.css`, `index.html`, UI icon code, `js/ui.js`, tests and README.

- [ ] Add browser assertions for 320px overflow, fixed grid widths, accessible controls, reduced motion and retained calendar colors.
- [ ] Apply shared color/surface/type/spacing tokens, icon treatment, restrained recording state, 240ms motion and responsive settings/search layouts.
- [ ] Inspect screenshots at 320/390/1280 widths, test dialogs and keyboard-sized viewport, then commit `style: refine restrained blue mobile interface`.

### Task 5: Tiny model and full verification

**Files:** model preparation script, app Gradle/JNI/tests, GitHub Actions, README and regression tests.

- [ ] Obtain official pinned tiny model SHA256/size from repository metadata; test packaging mismatch rejection with controlled fixtures.
- [ ] Replace all coupled model references, optimize supported greedy short-phrase parameters without changing parser; update docs with model tradeoffs and device-test limitation.
- [ ] Run `npm test`, full Playwright tests, pure Java tests, cloud workflow tests, actionlint, `npx cap sync android` and web hash checks.
- [ ] Commit `perf: bundle tiny whisper model for faster offline recognition` and report measured test results, not unmeasured device speed.

## Progress

- Approved spec is the chat-confirmed design; no additional review pause requested.
- Plan self-review: tasks 1/3 share startup order (backup before seed); tasks 2/4 share UI files (execute sequentially); task 5 synchronizes all preceding web resources. No schema change or parser edit is required.
