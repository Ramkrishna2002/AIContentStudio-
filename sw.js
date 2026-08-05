/**
 * AI Content Studio - Service Worker
 * -----------------------------------------
 * Caches the app shell (HTML/CSS/JS) so the app opens instantly and
 * works offline after the first visit. Story/character/scene data
 * itself lives in LocalStorage (see core/storage.js), not here —
 * this only caches the static files that make up the app itself.
 */

const CACHE_NAME = "acs-shell-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./config/config.js",
  "./core/storage.js",
  "./core/notifications.js",
  "./core/database.js",
  "./core/router.js",
  "./core/state.js",
  "./core/ai-providers.js",
  "./core/video-engine.js",
  "./core/security.js",
  "./core/backup.js",
  "./modules/dashboard.js",
  "./modules/story.js",
  "./modules/character.js",
  "./modules/scene.js",
  "./modules/ai.js",
  "./modules/image.js",
  "./modules/voice.js",
  "./modules/video.js",
  "./modules/render.js",
  "./modules/preview.js",
  "./modules/export.js",
  "./modules/settings.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch((err) => {
      // Don't fail install if one optional file is briefly unavailable —
      // core app shell files above are the ones that matter most.
      console.error("[ServiceWorker] Some shell files failed to pre-cache:", err);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Cache-first for the app shell; network-first fallback for anything else
// (e.g. live AI API calls should never be served from cache).
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept calls to external AI provider APIs — those must always hit the network.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() =>
        caches.match("./index.html")
      );
    })
  );
});
