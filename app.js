/**
 * AI Content Studio - App Bootstrap
 * -----------------------------------------
 * Wires together sidebar navigation, topbar controls, the status
 * clock, storage meter, and kicks off the router once all core
 * scripts + modules have loaded.
 */

(function bootstrap() {

  function renderSidebarNav() {
    const nav = document.getElementById("sidebar-nav");
    nav.innerHTML = window.AppConfig.NAV_MODULES.map(m => `
      <div class="acs-nav-item" data-nav-id="${m.id}" role="button" tabindex="0">
        <span class="acs-nav-item__icon">${iconGlyph(m.icon)}</span>
        <span>${m.label}</span>
      </div>
    `).join("");

    nav.querySelectorAll("[data-nav-id]").forEach(el => {
      const go = () => window.Router.navigate(el.getAttribute("data-nav-id"));
      el.addEventListener("click", go);
      el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") go(); });
    });
  }

  // Minimal emoji-based icon set so the shell renders with zero external
  // icon dependencies (keeps the app fully offline-capable).
  function iconGlyph(name) {
    const map = {
      "layout-dashboard": "🏠",
      "book": "📖",
      "users": "🎭",
      "film": "🎬",
      "folder": "🗂️",
      "cpu": "🤖",
      "image": "🖼️",
      "mic": "🎙️",
      "video": "🎞️",
      "layers": "🧩",
      "eye": "👁️",
      "download": "⬇️",
      "settings": "⚙️"
    };
    return map[name] || "•";
  }

  function updateStorageMeter() {
    const fill = document.getElementById("storage-fill");
    const text = document.getElementById("storage-text");
    if (!fill || !text) return;
    const bytes = window.StorageEngine.estimateUsageBytes();
    const kb = bytes / 1024;
    // LocalStorage practical ceiling ~5MB across most browsers.
    const ceilingKb = 5 * 1024;
    const pct = Math.min(100, Math.round((kb / ceilingKb) * 100));
    fill.style.width = `${Math.max(pct, 2)}%`;
    text.textContent = `${kb.toFixed(1)} KB / ~${ceilingKb} KB`;
  }

  function startClock() {
    const el = document.getElementById("status-clock");
    if (!el) return;
    const tick = () => {
      const now = new Date();
      el.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    };
    tick();
    setInterval(tick, 1000);
  }

  function wireTopbar() {
    document.getElementById("sidebar-toggle").addEventListener("click", () => {
      document.getElementById("app-shell").classList.toggle("acs-shell--collapsed");
    });

    document.getElementById("notification-toggle").addEventListener("click", () => {
      window.NotificationCenter.markAllRead();
    });

    document.getElementById("settings-shortcut").addEventListener("click", () => {
      window.Router.navigate("settings");
    });

    const search = document.getElementById("global-search");
    let debounceTimer = null;
    search.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runGlobalSearch(search.value.trim()), 200);
    });
  }

  function runGlobalSearch(query) {
    if (!query) return;
    const stories = window.Database.Stories.getAll().filter(s =>
      s.title.toLowerCase().includes(query.toLowerCase())
    );
    const characters = window.Database.Characters.getAll().filter(c =>
      c.name.toLowerCase().includes(query.toLowerCase())
    );
    setStatus(`Search "${query}": ${stories.length} stories, ${characters.length} characters found.`);
  }

  function setStatus(message) {
    const el = document.getElementById("status-message");
    if (el) el.textContent = message;
  }
  window.setStatus = setStatus;

  function runStartupIntegrityCheck() {
    try {
      const issues = window.Database.runIntegrityCheck();
      if (issues.length > 0) {
        window.Database.log("warn", `Startup integrity check found ${issues.length} issue(s).`, { issues });
        window.NotificationCenter.push({
          type: "warn",
          title: "Integrity check",
          message: `${issues.length} data issue(s) found. See Error Console in Settings.`
        });
      }
    } catch (e) {
      console.error("[bootstrap] Integrity check failed to run:", e);
    }
  }

  function startAutosave() {
    setInterval(() => {
      updateStorageMeter();
    }, window.AppConfig.LIMITS.AUTOSAVE_INTERVAL_MS);
  }

  function showLockOverlayIfNeeded() {
    const overlay = document.getElementById("lock-overlay");
    if (!window.SecurityManager.isLocked()) {
      overlay.style.display = "none";
      return false;
    }
    overlay.style.display = "flex";
    const input = document.getElementById("lock-pin-input");
    const btn = document.getElementById("lock-unlock-btn");
    const errorEl = document.getElementById("lock-error");

    const tryUnlock = async () => {
      const ok = await window.SecurityManager.verifyPin(input.value);
      if (ok) {
        overlay.style.display = "none";
        input.value = "";
        errorEl.textContent = "";
      } else {
        errorEl.textContent = "Incorrect PIN. Try again.";
      }
    };

    btn.addEventListener("click", tryUnlock);
    input.addEventListener("keydown", e => { if (e.key === "Enter") tryUnlock(); });
    input.focus();
    return true;
  }

  function init() {
    renderSidebarNav();
    wireTopbar();
    startClock();
    updateStorageMeter();
    window.NotificationCenter.updateBadge();

    const locked = showLockOverlayIfNeeded();
    if (locked) {
      // Still init the router underneath so unlocking reveals a ready app immediately,
      // but skip the startup integrity toast until the user can actually see it.
      window.Router.init();
      startAutosave();
      setStatus(`${window.AppConfig.APP_NAME} v${window.AppConfig.APP_VERSION} — locked.`);
      return;
    }

    runStartupIntegrityCheck();
    startAutosave();
    window.Router.init();
    setStatus(`${window.AppConfig.APP_NAME} v${window.AppConfig.APP_VERSION} ready.`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
