/**
 * AI Content Studio - Settings Module
 * -----------------------------------------
 * Hub for app-wide administration: general info + data wipe,
 * Backup System (snapshot/restore/import/export), Security Manager
 * (PIN lock), Error Console (reads Database logs), a live
 * Performance Monitor, and a Plugin System extension point.
 */

(function registerSettingsModule() {

  let activeTab = "general";

  function render(container) {
    const tabs = [
      { id: "general", label: "General" },
      { id: "backup", label: "Backup" },
      { id: "security", label: "Security" },
      { id: "errors", label: "Error Console" },
      { id: "performance", label: "Performance" },
      { id: "plugins", label: "Plugins" }
    ];

    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <h1>Settings</h1>
          <p>${window.AppConfig.APP_NAME} v${window.AppConfig.APP_VERSION} — ${window.AppConfig.BUILD_STAGE}</p>
        </div>
      </div>

      <div style="display:flex; gap:8px; margin-bottom:20px; border-bottom:1px solid var(--ink-700); flex-wrap:wrap;">
        ${tabs.map(t => `
          <button class="acs-btn ${activeTab === t.id ? "acs-btn--primary" : "acs-btn--ghost"} settings-tab-btn" data-tab="${t.id}" style="border-radius:6px 6px 0 0;">${t.label}</button>
        `).join("")}
      </div>

      <div id="settings-tab-content"></div>
    `;

    container.querySelectorAll(".settings-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => { activeTab = btn.getAttribute("data-tab"); render(container); });
    });

    const content = container.querySelector("#settings-tab-content");
    const renderers = {
      general: renderGeneralTab,
      backup: renderBackupTab,
      security: renderSecurityTab,
      errors: renderErrorsTab,
      performance: renderPerformanceTab,
      plugins: renderPluginsTab
    };
    renderers[activeTab](content, container);
  }

  // ===========================================================
  // GENERAL
  // ===========================================================
  function renderGeneralTab(content) {
    const stories = window.Database.Stories.getAll();
    const characters = window.Database.Characters.getAll();
    const scenes = window.Database.Scenes.getAll();
    const assets = window.Database.Assets.getAll();
    const usageKb = (window.StorageEngine.estimateUsageBytes() / 1024).toFixed(1);

    content.innerHTML = `
      <div class="acs-card-grid">
        ${statCard("Stories", stories.length)}
        ${statCard("Characters", characters.length)}
        ${statCard("Scenes", scenes.length)}
        ${statCard("Assets stored", assets.length)}
        ${statCard("Storage used", `${usageKb} KB`)}
      </div>
      <h2 class="acs-section-title">Danger Zone</h2>
      <div class="acs-story-row">
        <div>
          <div class="acs-story-row__title">Wipe all app data</div>
          <div class="acs-story-row__meta">Deletes every story, character, scene, asset, prompt, and setting. Cannot be undone unless you have a backup.</div>
        </div>
        <button class="acs-btn acs-btn--ghost" id="wipe-all-btn" style="border-color:var(--danger); color:var(--danger);">Wipe Everything</button>
      </div>
    `;

    content.querySelector("#wipe-all-btn").addEventListener("click", () => {
      const confirmed = window.confirm("This deletes ALL app data permanently. Have you exported a backup? Click OK only if you're sure.");
      if (!confirmed) return;
      window.SecurityManager.wipeAllData();
      window.NotificationCenter.push({ type: "info", title: "Data wiped", message: "All app data was cleared." });
      window.Router.navigate("dashboard");
    });
  }

  function statCard(label, value) {
    return `<div class="acs-stat-card"><div class="acs-stat-card__label">${label}</div><div class="acs-stat-card__value">${value}</div></div>`;
  }

  // ===========================================================
  // BACKUP
  // ===========================================================
  function renderBackupTab(content) {
    const backups = window.BackupSystem.getAll().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    content.innerHTML = `
      <div class="acs-story-row" style="margin-bottom:20px;">
        <div class="acs-story-row__title">Create a snapshot of everything right now</div>
        <button class="acs-btn acs-btn--primary" id="create-backup-btn">📦 Create Backup</button>
      </div>

      <div class="acs-story-row" style="margin-bottom:20px;">
        <div class="acs-story-row__title">Import a backup file from disk</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="file" id="import-backup-input" accept="application/json" style="font-size:12px;" />
        </div>
      </div>

      <h2 class="acs-section-title">Saved Backups (${backups.length}/${window.AppConfig.LIMITS.MAX_BACKUPS})</h2>
      <div class="acs-story-list">
        ${backups.length ? backups.map(b => `
          <div class="acs-story-row" data-backup-id="${b.id}">
            <div>
              <div class="acs-story-row__title">${escapeHtml(b.label)}</div>
              <div class="acs-story-row__meta">${new Date(b.createdAt).toLocaleString()}</div>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="acs-btn acs-btn--ghost backup-export-btn" data-id="${b.id}">⬇ Export</button>
              <button class="acs-btn acs-btn--ghost backup-restore-btn" data-id="${b.id}">♻ Restore</button>
              <button class="acs-btn acs-btn--ghost backup-delete-btn" data-id="${b.id}">🗑️</button>
            </div>
          </div>
        `).join("") : `<div class="acs-empty-inline">No backups yet.</div>`}
      </div>
    `;

    content.querySelector("#create-backup-btn").addEventListener("click", () => {
      const label = window.prompt("Label this backup (optional):", `Backup ${new Date().toLocaleDateString()}`);
      window.BackupSystem.createBackup(label || undefined);
      window.NotificationCenter.push({ type: "success", title: "Backup created", message: "Snapshot saved." });
      renderBackupTab(content);
    });

    content.querySelector("#import-backup-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        window.BackupSystem.importBackupFromFileText(text);
        window.NotificationCenter.push({ type: "success", title: "Imported", message: "Backup file imported. You can now restore it." });
        renderBackupTab(content);
      } catch (err) {
        window.NotificationCenter.push({ type: "error", title: "Import failed", message: err.message });
      }
    });

    content.querySelectorAll(".backup-export-btn").forEach(btn => {
      btn.addEventListener("click", () => window.BackupSystem.exportBackupToFile(btn.getAttribute("data-id")));
    });

    content.querySelectorAll(".backup-restore-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const confirmed = window.confirm("Restoring will overwrite current data with this backup's contents. Continue?");
        if (!confirmed) return;
        window.BackupSystem.restoreBackup(btn.getAttribute("data-id"));
        window.NotificationCenter.push({ type: "success", title: "Restored", message: "Reloading app with restored data..." });
        setTimeout(() => window.location.reload(), 800);
      });
    });

    content.querySelectorAll(".backup-delete-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        window.BackupSystem.deleteBackup(btn.getAttribute("data-id"));
        renderBackupTab(content);
      });
    });
  }

  // ===========================================================
  // SECURITY
  // ===========================================================
  function renderSecurityTab(content) {
    const hasPin = window.SecurityManager.hasPin();
    content.innerHTML = `
      <div class="acs-story-row" style="flex-direction:column; align-items:stretch; gap:12px;">
        <div class="acs-story-row__title">App Lock (PIN)</div>
        <div style="color:var(--fog-300); font-size:12.5px;">
          Requires a PIN to open the app after a page reload. This is a deterrent for shared devices only —
          it is not encryption, and anyone with access to browser DevTools can still read stored data (including saved AI provider API keys, which are kept in plain LocalStorage).
        </div>
        ${hasPin ? `
          <div style="color:var(--teal-400); font-size:13px;">🔒 PIN is currently set.</div>
          <button class="acs-btn acs-btn--ghost" id="remove-pin-btn" style="width:fit-content;">Remove PIN</button>
        ` : `
          <input type="password" id="new-pin-input" placeholder="New PIN (min 4 characters)" style="${inputStyle()} max-width:240px;" />
          <button class="acs-btn acs-btn--primary" id="set-pin-btn" style="width:fit-content;">Set PIN</button>
        `}
      </div>

      <h2 class="acs-section-title">Data Integrity</h2>
      <div class="acs-story-row" style="flex-direction:column; align-items:stretch; gap:10px;">
        <button class="acs-btn acs-btn--ghost" id="run-integrity-btn" style="width:fit-content;">🔍 Run Integrity Check (GSIS + references)</button>
        <div id="integrity-result"></div>
      </div>
    `;

    if (hasPin) {
      content.querySelector("#remove-pin-btn").addEventListener("click", () => {
        window.SecurityManager.removePin();
        window.NotificationCenter.push({ type: "info", title: "PIN removed", message: "App lock disabled." });
        renderSecurityTab(content);
      });
    } else {
      content.querySelector("#set-pin-btn").addEventListener("click", async () => {
        const pin = content.querySelector("#new-pin-input").value;
        try {
          await window.SecurityManager.setPin(pin);
          window.NotificationCenter.push({ type: "success", title: "PIN set", message: "App lock enabled." });
          renderSecurityTab(content);
        } catch (e) {
          window.NotificationCenter.push({ type: "warn", title: "Couldn't set PIN", message: e.message });
        }
      });
    }

    content.querySelector("#run-integrity-btn").addEventListener("click", () => {
      const issues = window.Database.runIntegrityCheck();
      const result = content.querySelector("#integrity-result");
      result.innerHTML = issues.length
        ? `<div style="color:var(--danger); font-size:12.5px; margin-top:8px;">${issues.length} issue(s) found:<br>${issues.map(i => `• ${escapeHtml(JSON.stringify(i))}`).join("<br>")}</div>`
        : `<div style="color:var(--teal-400); font-size:12.5px; margin-top:8px;">✅ No integrity issues found. GSIS isolation is intact.</div>`;
    });
  }

  // ===========================================================
  // ERROR CONSOLE
  // ===========================================================
  function renderErrorsTab(content) {
    const logs = window.Database.getLogs().slice().reverse();
    content.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <div style="color:var(--fog-300); font-size:12.5px;">${logs.length} log entries (newest first, max ${window.AppConfig.LIMITS.MAX_LOG_ENTRIES} kept)</div>
        <button class="acs-btn acs-btn--ghost" id="clear-logs-btn">Clear Logs</button>
      </div>
      <div class="acs-story-list" style="font-family:var(--font-mono); font-size:12px;">
        ${logs.length ? logs.slice(0, 200).map(l => `
          <div class="acs-story-row" style="padding:8px 12px;">
            <div>
              <span style="color:${l.level === "error" ? "var(--danger)" : l.level === "warn" ? "var(--warn)" : "var(--teal-400)"};">[${l.level.toUpperCase()}]</span>
              ${escapeHtml(l.message)}
            </div>
            <span style="color:var(--fog-300); font-size:10.5px;">${new Date(l.timestamp).toLocaleTimeString()}</span>
          </div>
        `).join("") : `<div class="acs-empty-inline">No log entries.</div>`}
      </div>
    `;

    content.querySelector("#clear-logs-btn").addEventListener("click", () => {
      window.StorageEngine.set(window.AppConfig.STORAGE_KEYS.LOGS, []);
      renderErrorsTab(content);
    });
  }

  // ===========================================================
  // PERFORMANCE MONITOR
  // ===========================================================
  function renderPerformanceTab(content) {
    const usageBytes = window.StorageEngine.estimateUsageBytes();
    const nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    const loadMs = nav ? Math.round(nav.loadEventEnd - nav.startTime) : null;

    content.innerHTML = `
      <div class="acs-card-grid">
        ${statCard("Storage used", `${(usageBytes / 1024).toFixed(1)} KB`)}
        ${statCard("Page load time", loadMs !== null ? `${loadMs} ms` : "n/a")}
        ${statCard("Log entries", window.Database.getLogs().length)}
        ${statCard("Notifications", window.NotificationCenter.getAll().length)}
      </div>
      <div class="acs-empty-inline">Live browser performance metrics — refresh this tab to update.</div>
    `;
  }

  // ===========================================================
  // PLUGINS
  // ===========================================================
  function renderPluginsTab(content) {
    content.innerHTML = `
      <div class="acs-empty-inline" style="text-align:left; padding:20px;">
        <strong style="color:var(--fog-100);">Plugin System — extension point</strong><br><br>
        Any script can register a new module at runtime with:<br>
        <code style="font-family:var(--font-mono); background:var(--ink-800); padding:2px 6px; border-radius:4px;">window.Router.register("myPlugin", { render(container) { ... } })</code><br><br>
        and add itself to the sidebar by pushing into <code style="font-family:var(--font-mono);">AppConfig.NAV_MODULES</code> before <code style="font-family:var(--font-mono);">app.js</code> runs its bootstrap.
        A dedicated plugin marketplace/loader UI is planned for a future pass.
      </div>
    `;
  }

  function inputStyle() {
    return "background:var(--ink-800); border:1px solid var(--ink-700); color:var(--fog-100); border-radius:6px; padding:9px 12px; font-size:13px;";
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  window.Router.register("settings", { render });

})();
