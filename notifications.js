/**
 * AI Content Studio - Notification Center
 * -----------------------------------------
 * Cross-cutting toast/alert system used by every module.
 * Persists a rolling log of notifications and renders toasts
 * into the #notification-root DOM node created by index.html.
 */

const NotificationCenter = (() => {

  const KEY = window.AppConfig.STORAGE_KEYS.NOTIFICATIONS;
  const MAX = window.AppConfig.LIMITS.MAX_NOTIFICATIONS;
  let rootEl = null;

  function ensureRoot() {
    if (rootEl) return rootEl;
    rootEl = document.getElementById("notification-root");
    if (!rootEl) {
      rootEl = document.createElement("div");
      rootEl.id = "notification-root";
      document.body.appendChild(rootEl);
    }
    return rootEl;
  }

  function getAll() {
    return window.StorageEngine.get(KEY, []);
  }

  function persist(entry) {
    const all = getAll();
    all.push(entry);
    const trimmed = all.length > MAX ? all.slice(all.length - MAX) : all;
    window.StorageEngine.set(KEY, trimmed);
  }

  function push({ type = "info", title = "", message = "", timeoutMs = 4500 }) {
    const entry = {
      id: window.Database ? window.Database.generateId(window.AppConfig.ID_PREFIXES.NOTIFICATION)
                           : `NTF-${Date.now()}`,
      type, // info | success | warn | error
      title,
      message,
      createdAt: new Date().toISOString(),
      read: false
    };
    persist(entry);
    renderToast(entry, timeoutMs);
    updateBadge();
    return entry;
  }

  function renderToast(entry, timeoutMs) {
    const root = ensureRoot();
    const toast = document.createElement("div");
    toast.className = `acs-toast acs-toast--${entry.type}`;
    toast.innerHTML = `
      <div class="acs-toast__title">${escapeHtml(entry.title)}</div>
      <div class="acs-toast__message">${escapeHtml(entry.message)}</div>
    `;
    toast.addEventListener("click", () => toast.remove());
    root.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("acs-toast--visible"));

    if (timeoutMs > 0) {
      setTimeout(() => {
        toast.classList.remove("acs-toast--visible");
        setTimeout(() => toast.remove(), 300);
      }, timeoutMs);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function markAllRead() {
    const all = getAll().map(n => ({ ...n, read: true }));
    window.StorageEngine.set(KEY, all);
    updateBadge();
  }

  function unreadCount() {
    return getAll().filter(n => !n.read).length;
  }

  function updateBadge() {
    const badge = document.getElementById("notification-badge");
    if (!badge) return;
    const count = unreadCount();
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.style.display = count > 0 ? "inline-flex" : "none";
  }

  function clearAll() {
    window.StorageEngine.set(KEY, []);
    updateBadge();
  }

  return { push, getAll, markAllRead, unreadCount, updateBadge, clearAll };

})();

window.NotificationCenter = NotificationCenter;
