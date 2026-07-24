/**
 * AI Content Studio - Storage Layer
 * -----------------------------------------
 * Thin, safe wrapper around window.localStorage.
 * All reads/writes in the app go through this module so that
 * swapping LocalStorage for IndexedDB/a real backend later only
 * requires changing this one file.
 */

const StorageEngine = (() => {

  function isAvailable() {
    try {
      const testKey = "__acs_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  const AVAILABLE = isAvailable();

  function get(key, fallback = null) {
    if (!AVAILABLE) return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.error(`[StorageEngine] Failed to read key "${key}":`, e);
      return fallback;
    }
  }

  function set(key, value) {
    if (!AVAILABLE) return false;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      if (e && e.name === "QuotaExceededError") {
        console.error("[StorageEngine] Quota exceeded while writing key:", key);
        if (window.NotificationCenter) {
          window.NotificationCenter.push({
            type: "error",
            title: "Storage Full",
            message: "Browser storage quota exceeded. Please export and clear old projects."
          });
        }
      } else {
        console.error(`[StorageEngine] Failed to write key "${key}":`, e);
      }
      return false;
    }
  }

  function remove(key) {
    if (!AVAILABLE) return false;
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error(`[StorageEngine] Failed to remove key "${key}":`, e);
      return false;
    }
  }

  function clearAll(prefixFilter = "acs_") {
    if (!AVAILABLE) return false;
    try {
      const keysToRemove = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(prefixFilter)) keysToRemove.push(k);
      }
      keysToRemove.forEach(k => window.localStorage.removeItem(k));
      return true;
    } catch (e) {
      console.error("[StorageEngine] Failed to clear storage:", e);
      return false;
    }
  }

  function estimateUsageBytes() {
    if (!AVAILABLE) return 0;
    let total = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      const v = window.localStorage.getItem(k);
      if (k && v) total += k.length + v.length;
    }
    return total * 2; // UTF-16 rough estimate (2 bytes/char)
  }

  function exportAll(prefixFilter = "acs_") {
    const dump = {};
    if (!AVAILABLE) return dump;
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefixFilter)) {
        dump[k] = get(k, null);
      }
    }
    return dump;
  }

  function importAll(dump) {
    if (!AVAILABLE || !dump || typeof dump !== "object") return false;
    Object.keys(dump).forEach(k => set(k, dump[k]));
    return true;
  }

  return {
    isAvailable: () => AVAILABLE,
    get,
    set,
    remove,
    clearAll,
    estimateUsageBytes,
    exportAll,
    importAll
  };

})();

window.StorageEngine = StorageEngine;
