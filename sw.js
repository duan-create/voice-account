const CACHE_PREFIX = "voice-account-static-";
// Bump the version when changing the app shell; let existing tabs finish on the old worker.
const CACHE_NAME = `${CACHE_PREFIX}v7`;
const ASSETS = [
  "./index.html",
  "./capacitor.js",
  "./css/style.css",
  "./js/app.js",
  "./js/ui.js",
  "./js/db.js",
  "./js/categories.js",
  "./js/ledger.js",
  "./js/ledger-api.js",
  "./js/assets-ui.js",
  "./js/calendar.js",
  "./js/calendar-ui.js",
  "./js/db.selftest.js",
  "./js/budget-db.js",
  "./js/finance.js",
  "./js/finance-ui.js",
  "./js/charts.js",
  "./js/voice.js",
  "./js/native-voice.js",
  "./js/voice-parser.js",
  "./js/vendor/nzh-cn.js",
  "./manifest.json"
].map((path) => new URL(path, self.registration.scope).href);
const PAGE_URL = ASSETS[0];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) =>
    cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" })))
  ));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  url.search = "";
  const isPage = event.request.mode === "navigate"
    && (url.href === self.registration.scope || url.href === PAGE_URL);
  if (!isPage && !ASSETS.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(isPage ? PAGE_URL : url.href) || fetch(event.request);
  })());
});
