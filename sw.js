/*
 * PDFMaster Service Worker
 * ------------------------
 * Adds offline support and faster repeat visits to pdfmaster.co.in.
 *
 * Design goals (full explanation in README.md):
 *  1. Never touches user files. Every PDF tool already does its work
 *     entirely inside the page's own JS - this worker only caches the
 *     static shell (HTML/CSS/JS/fonts/icons) and the third-party
 *     processing libraries (pdf-lib, PDF.js, Tesseract.js, etc.), so
 *     tools keep working with no network at all after a first visit.
 *  2. Never interferes with analytics or the subscribe/URL-shortener
 *     workers - those always go straight to the network, untouched.
 *  3. Self-maintaining. Only a small "app shell" is pre-cached up
 *     front; every tool page, blog post, and image is cached the
 *     first time it's actually visited. Shipping tool #13 through #21
 *     never requires touching this file.
 *  4. Updates are safe. A new version never swaps under a visitor
 *     mid-task - it waits until they explicitly refresh (see
 *     sw-register.js for that flow).
 *
 * Bump CACHE_VERSION any time you change this file or your asset
 * structure. That's what clears out old cached versions on the next
 * visit - see the activate handler below.
 */

const CACHE_VERSION = "v3";
const CACHE_PREFIX = "pdfmaster-";

const STATIC_CACHE = `${CACHE_PREFIX}static-${CACHE_VERSION}`;
const PAGES_CACHE = `${CACHE_PREFIX}pages-${CACHE_VERSION}`;
const CDN_CACHE = `${CACHE_PREFIX}cdn-${CACHE_VERSION}`;

const CURRENT_CACHES = [STATIC_CACHE, PAGES_CACHE, CDN_CACHE];

const OFFLINE_URL = "/offline.html";

// The "app shell": the bare minimum needed to boot the site offline.
// Everything else (individual tool pages, blog posts, images) gets
// cached automatically the first time a visitor opens it - see the
// fetch handler below. Only add paths here that EVERY page depends
// on (e.g. a global stylesheet or script used site-wide).
const PRECACHE_URLS = [
  "/",
  OFFLINE_URL,
  "/assets/fonts/1_rP2Wp2ywxg089UriCZaSExdy3sGt9zz86D3wyKy58Q.woff2",
  "/assets/fonts/2_xMQbuFFYT72XzQspDre2.woff2",
  "/assets/fonts/3_xMQbuFFYT72XzQUpDg.woff2",
  "/assets/fonts/4_rP2Hp2ywxg089UriCZOIHQ.woff2",
  "/assets/fonts/5_rP2Wp2ywxg089UriCZaSExdy3sGt9zz86D3wyKK58VXh.woff2",
  "/assets/fonts/6_rP2Hp2ywxg089UriCZ2IHSeH.woff2",
  "/assets/fonts/fonts.css",
  "/assets/vendor/background-removal-1.5.6.esm.js",
  "/assets/vendor/jspdf.umd.min.js",
  "/assets/vendor/jszip.min.js",
  "/assets/vendor/pdf-3.4.120.min.js",
  "/assets/vendor/pdf-3.11.174.min.js",
  "/assets/vendor/pdf-lib-1.17.1.min.js",
  "/assets/vendor/pdf-lib.min.js",
  "/assets/vendor/pdf.min.js",
  "/assets/vendor/pdf.worker-3.4.120.min.js",
  "/assets/vendor/pdf.worker-3.11.174.min.js",
  "/assets/vendor/pdf.worker.min.js",
  "/assets/vendor/Sortable.min.js",
  "/assets/android-chrome-192x192.png",
  "/assets/android-chrome-512x512.png",
  "/assets/apple-touch-icon.png",
  "/assets/developer.png",
  "/assets/developer.webp",
  "/assets/favicon-16x16.png",
  "/assets/favicon-32x32.png",
  "/assets/favicon.ico",
  "/assets/founder.png",
  "/assets/site.webmanifest",
  "/manifest.json",
  "/blog/pdf-metadata/css/style.css",
  "/blog/pdf-metadata/js/script.js",
  "/blog/pdf-to-photo/css/index.css",
  "/blog/pdf-to-photo/css/style.css",
  "/blog/pdf-to-photo/script/index.js",
  "/blog/pdf-to-photo/script/script.js",
  "/blog/photo-to-pdf/css/index.css",
  "/blog/photo-to-pdf/css/photo-to-pdf-mobile-guide.css",
  "/blog/photo-to-pdf/css/style.css",
  "/blog/photo-to-pdf/script/index.js",
  "/blog/photo-to-pdf/script/photo-to-pdf-mobile-guide.js",
  "/blog/photo-to-pdf/script/script.js",
  "/blog/script.js",
  "/blog/style.css",
  "/css/404.css",
  "/css/about.css",
  "/css/announcements.css",
  "/css/contact.css",
  "/css/faq.css",
  "/css/happy-gupta-founder-of-pdfmaster.css",
  "/css/index.css",
  "/css/pdf-compiler.css",
  "/css/pdf-editor.css",
  "/css/pdf-metadata.css",
  "/css/pdf-reorder.css",
  "/css/pdf-split.css",
  "/css/pdf-to-photo.css",
  "/css/photo-to-pdf.css",
  "/css/privacy-policy.css",
  "/css/subscribe.css",
  "/css/terms.css",
  "/css/thank-you.css",
  "/css/website-to-pdf.css",
  "/js/404.js",
  "/js/about.js",
  "/js/announcements.js",
  "/js/contact.js",
  "/js/faq.js",
  "/js/happy-gupta-founder-of-pdfmaster.js",
  "/js/index.js",
  "/js/pdf-compiler.js",
  "/js/pdf-editor.js",
  "/js/pdf-metadata.js",
  "/js/pdf-reorder.js",
  "/js/pdf-split.js",
  "/js/pdf-to-photo.js",
  "/js/photo-to-pdf.js",
  "/js/privacy-policy.js",
  "/js/subscribe.js",
  "/js/sw-register.js",
  "/js/terms.js",
  "/js/thank-you.js",
  "/js/website-to-pdf.js",
];

const BYPASS_HOSTS = [
  "googletagmanager.com",
  "google-analytics.com",
  "analytics.google.com",
  "gamingwithhappy39.workers.dev",
  "script.google.com",
  "script.googleusercontent.com",
];

// Cross-origin hosts that are safe to cache aggressively: the pinned-
// version CDN libraries (pdf-lib, PDF.js, Tesseract.js, JSZip, jsPDF,
// html2canvas, SortableJS across the cdnjs -> jsDelivr -> unpkg
// fallback chain), plus Google Fonts defensively in case any fonts
// load from there rather than being self-hosted.
const CDN_HOSTS = [
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

// Same-origin file types treated as long-lived static assets.
const STATIC_EXTENSIONS =
  /\.(?:css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot)$/i;

// Keep runtime caches from growing without bound as more tools and
// blog posts ship over time.
const MAX_PAGES_ENTRIES = 60;
const MAX_CDN_ENTRIES = 40;

// ---------------------------------------------------------------------
// Install: pre-cache the app shell.
// ---------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[PDFMaster SW] Precache warning for ${url}:`, err);
          }),
        ),
      ),
    ),
  );
  // Deliberately NOT calling self.skipWaiting() here. The new worker
  // sits in "waiting" until the visitor agrees to refresh, so nobody's
  // half-finished edit in a tool tab gets interrupted mid-task.
});

// ---------------------------------------------------------------------
// Message: lets the page promote a waiting worker once the visitor
// has clicked "refresh" on the update banner.
// ---------------------------------------------------------------------
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ---------------------------------------------------------------------
// Activate: drop old cache versions, take control of open tabs.
// ---------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.includes(key),
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// ---------------------------------------------------------------------
// Fetch: route each request to the right strategy.
// ---------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever handle simple GETs. Form posts, the subscribe request,
  // and anything else must always go straight to the network.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (BYPASS_HOSTS.some((host) => url.hostname.includes(host))) return;

  // Full page loads: typing a URL, clicking a link, refreshing.
  const isNavigation =
    request.mode === "navigate" || request.destination === "document";
  if (isNavigation) {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (url.origin === self.location.origin) {
    if (STATIC_EXTENSIONS.test(url.pathname)) {
      event.respondWith(staleWhileRevalidate(request, STATIC_CACHE, event));
    }
    // Same-origin requests that aren't recognised static assets are
    // left alone and go straight to the network as usual.
    return;
  }

  if (CDN_HOSTS.some((host) => url.hostname.includes(host))) {
    event.respondWith(cacheFirstCdn(request));
  }

  // Any other cross-origin request: left alone, network handles it.
});

// ---------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------

// HTML pages: try the network first so visitors (and search engine
// crawlers - this worker never affects SEO) always see the latest
// content. Fall back to a cached copy, then to the offline page, only
// when the network is genuinely unreachable.
async function networkFirstPage(request) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(PAGES_CACHE);
      cache.put(request, fresh.clone());
      trimCache(PAGES_CACHE, MAX_PAGES_ENTRIES);
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    return cached || (await caches.match(OFFLINE_URL));
  }
}

// Same-origin static assets: serve the cached copy instantly if one
// exists, while quietly fetching a fresh copy in the background for
// next time. A first-ever request just falls back to the network.
async function staleWhileRevalidate(request, cacheName, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((fresh) => {
      if (fresh && fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => null);

  if (event && event.waitUntil) {
    event.waitUntil(networkFetch);
  }

  return cached || (await networkFetch) || Response.error();
}

// Pinned-version CDN libraries: the URL itself (e.g. .../pdf-lib@1.17.1/...)
// already encodes the version, so a cached copy never goes stale.
async function cacheFirstCdn(request) {
  const cache = await caches.open(CDN_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    // Fetch by URL in explicit CORS mode rather than reusing the
    // intercepted Request object. cdnjs, jsDelivr and unpkg all send
    // Access-Control-Allow-Origin: *, so this succeeds with a real,
    // inspectable, cacheable response - even when the original
    // <script> tag itself made a no-cors request.
    const fresh = await fetch(request.url, {
      mode: "cors",
      credentials: "omit",
    });
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
      trimCache(CDN_CACHE, MAX_CDN_ENTRIES);
    }
    return fresh;
  } catch (err) {
    // Fall back to whatever the original request would have gotten.
    // It'll be opaque (unreadable), but still a valid drop-in resource
    // for the browser to execute as a script/stylesheet.
    try {
      const opaque = await fetch(request);
      cache.put(request, opaque.clone());
      trimCache(CDN_CACHE, MAX_CDN_ENTRIES);
      return opaque;
    } catch (err2) {
      return Response.error();
    }
  }
}

// Keeps runtime caches from growing forever as new tools/posts ship.
// caches.keys() returns entries in insertion order, so this trims the
// oldest entries first (simple FIFO, not a true LRU).
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}
