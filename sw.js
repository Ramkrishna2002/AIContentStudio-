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
  "./Config/config.js",
  "./Core/storage.js",
  "./Core/notifications.js",
  "./Core/database.js",
  "./Core/router.js",
  "./Core/state.js",
  "./Core/ai-providers.js",
  "./Core/video-engine.js",
  "./Core/security.js",
  "./Core/backup.js",
  "./Modules/dashboard.js",
  "./Modules/story.js",
  "./Modules/character.js",
  "./Modules/scene.js",
  "./Modules/ai.js",
  "./Modules/image.js",
  "./Modules/voice.js",
  "./Modules/video.js",
  "./Modules/render.js",
  "./Modules/preview.js",
  "./Modules/export.js",
  "./Modules/settings.js",
  "./Assets/icons/icon-192.png",
  "./Assets/icons/icon-512.png"
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
