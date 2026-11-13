# Offline ledger refinement

Approved in chat on 2026-11-13. Execute in the existing main checkout and commit each module separately. Do not push or modify the user-owned APK archive.

## Compatibility

Keep IndexedDB version and all existing store definitions, bill IDs, account journal semantics, budgets and parser rules. Historical bills without account metadata remain unassigned. All financial mutations remain transactional and use integer cents.

## Modules

1. Seed missing defaults once in an accounts/journal/settings transaction: 微信、支付宝、现金、工商银行、农业银行、中国银行、建设银行、储蓄卡. Existing and archived matching names count as present. New accounts have zero opening balance. Persist completion so archived defaults are not recreated. Fix distinct transfer/savings selectors and provide an add-account route when fewer than two usable accounts exist.
2. Independent full-screen local search, default current-month interval, keyword/type/date/amount/account filters, recent ten distinct queries with clear/reuse, detail/edit/delete using existing bill handlers. Monthly/yearly statistics aggregate in cents; yearly navigation uses years and grouped 12-month bars; expense/income rankings and pie details open filtered search. Actual-current-month budgets are unaffected by filtering.
3. Separate backup storage, never recursively included in ledger snapshots. Capture a complete consistent snapshot before startup migrations/planner reconciliation and before destructive restore; retain three successful backups. Android private files are default. An optional SAF directory grant enables public copies without broad permissions. Web uses a separate IndexedDB database. Settings lists/restores/exports backups and exposes directory authorization/status. Public failures must not invalidate private backup or original data. Recovery validates before a single transactional restore. Private backups do not survive uninstall/site-data clearing; public copies survive only according to the selected provider, require reauthorization on reinstall and can be reimported through existing JSON import.
4. Restrained #165DFF visual language: gray background, translucent white surfaces, thin borders, subtle shadows, 8px surface radii, linear icons, red-income/green-expense calendar preserved. Responsive fixed calendar grid, 44px touch targets, 200-300ms transitions and reduced-motion support. No added ornamental assets or effects.
5. Multilingual tiny Q5_1 model from official pinned whisper.cpp Hugging Face repository, verified SHA256 and size. Update every build/download/test reference and avoid packaging the old model. Short-phrase CPU decoding must not truncate amounts or change the parser. Engineering verification is distinct from unperformed Android device performance/accuracy testing.

## Validation

TDD for seed idempotence/legacy preservation, search ranges/order/history, yearly totals/rankings, backup retention/restore isolation. Browser regression for bill CRUD, balances, savings, filters/drilldown, settings/recovery, calendar colors, 320px/390px/desktop, dialogs/keyboard constraints and offline reload. Run existing unit/browser/native pure-Java tests, web resource synchronization, workflow lint and packaging checks. Report unavailable SDK/device validation explicitly.
