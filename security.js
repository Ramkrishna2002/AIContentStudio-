/**
 * AI Content Studio - Security Manager
 * -----------------------------------------
 * Honest scope: this is a client-side, single-browser app. This
 * module provides a PIN "app lock" to deter casual access on a
 * shared device, and a full data-wipe utility — it is NOT real
 * encryption and does not protect against anyone with access to
 * browser devtools/localStorage. API keys stored by AI Providers
 * remain in plain LocalStorage; this module does not claim
 * otherwise anywhere in its UI.
 */

const SecurityManager = (() => {

  const KEY = window.AppConfig.STORAGE_KEYS.SECURITY;
  let unlockedThisSession = false; // resets on every full page reload, by design

  function getState() {
    return window.StorageEngine.get(KEY, { pinHash: null });
  }

  async function sha256(text) {
    const enc = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function hasPin() {
    return !!getState().pinHash;
  }

  async function setPin(pin) {
    if (!pin || pin.length < 4) throw new Error("PIN must be at least 4 characters.");
    const pinHash = await sha256(pin);
    window.StorageEngine.set(KEY, { pinHash });
    unlockedThisSession = true;
  }

  function removePin() {
    window.StorageEngine.set(KEY, { pinHash: null });
    unlockedThisSession = true;
  }

  async function verifyPin(pin) {
    const state = getState();
    if (!state.pinHash) return true;
    const hash = await sha256(pin);
    const ok = hash === state.pinHash;
    if (ok) unlockedThisSession = true;
    return ok;
  }

  function isLocked() {
    return hasPin() && !unlockedThisSession;
  }

  function lockNow() {
    unlockedThisSession = false;
  }

  function wipeAllData() {
    window.StorageEngine.clearAll("acs_");
    unlockedThisSession = false;
  }

  return { hasPin, setPin, removePin, verifyPin, isLocked, lockNow, wipeAllData };

})();

window.SecurityManager = SecurityManager;
