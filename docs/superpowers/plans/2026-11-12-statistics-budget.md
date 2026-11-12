# Statistics And Budget Implementation Plan

**Goal:** Deliver the approved mobile UI upgrade, Canvas statistics and recurring monthly budgets in one feature commit.

**Architecture:** Upgrade voice-account-db to version 2 by adding a budgets store without changing bills. Keep bill CRUD and speech modules intact. Derive monthly category totals and six-month trends from getBills; persist reusable limits independently from monthly spending.

**Tech Stack:** Static HTML/CSS/ES modules, IndexedDB, native Canvas, Node tests and Playwright.

**Spec:** User-approved design in the current chat: retain budget limits across months, reset only calculated usage, no carryover; total and six independent category limits; warnings never block billing.

## Constraints

- No changes to voice.js or voice-parser.js; no third-party chart dependencies.
- Preserve bill CRUD implementations and historical bill IDs, timestamps and fields.
- New views must work offline and be included in Capacitor asset synchronization.
- Respect reduced motion; use readable Unicode category symbols and existing Lucide button icons.
- One final commit: feat: upgrade UI and add statistics & budget.

## Tasks

- [x] Add failing tests for v1 migration, persistent budgets, invalid/failed saves, cent-accurate totals, year boundaries and monthly reset.
- [x] Implement guarded schema migration in js/db.js, budget persistence in js/budget-db.js, and pure calculations/category metadata in js/finance.js.
- [x] Add browser tests for tab navigation, Canvas pixels and slice selection, budget warnings, cancellation, offline reload, and responsive/reduced-motion UI.
- [x] Add js/finance-ui.js and js/charts.js, integrate finance refresh into presentation only; leave existing save/delete transactions intact.
- [x] Upgrade index.html/css/style.css, add Toast/dialog/list/recording animations and safe areas, cache new modules in sw.js.
- [x] Run npm test and full browser suite, legacy DB self-test, screenshots on mobile/desktop, native resource sync and protected-file diff checks.
- [x] Review staged scope and prepare the single feature commit after verification; report exact results and device-testing limits.

## Verification Commands

```powershell
npm.cmd test
npm.cmd exec --yes --package=playwright -- node --test tests/manual-bills.test.cjs
npx.cmd cap sync android
git diff --check
git diff -- js/voice.js js/voice-parser.js
```

## Verification Results

- npm test: 86/86 passed (82 unchanged voice scenarios, 3 calculation tests, 1 resource preparation test).
- Browser suite: 33/33 passed, including the isolated legacy database self-test's 17 checks.
- Migration preserved a v1 record with ID 17 exactly; the next inserted record received ID 18.
- Invalid precision/zero/negative budgets and aborted transactions leave previous settings intact.
- Open-page month rollover recalculates usage without changing stored limits or carrying a balance.
- Offline reload supports billing, budgets and statistics; both Canvas charts have painted pixels.
- 320px/375px/desktop checks cover summary fit; screenshots checked small-screen budget form and charts, mobile home and desktop statistics.
- Simulated reduced visual viewport keeps focused bill/budget inputs reachable; reduced motion disables decoration.
- Capacitor Android resource sync succeeded. No APK was built in this step.
- Speech implementation/parser and original bill CRUD implementations have no changes.
- Reviewer agent could not run due upstream unsupported_encrypted_agent_content; completed a local code/diff review instead.
- Physical Android/WebView, microphone service, notch/gesture bars and actual soft keyboard remain device-testing limitations.
