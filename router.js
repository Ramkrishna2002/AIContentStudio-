/**
 * AI Content Studio - Router
 * -----------------------------------------
 * Lightweight hash-based router. Each module registers a
 * render(container) function via Router.register(moduleId, fn).
 * The router mounts the active module into #view-root and keeps
 * the sidebar's active state in sync with location.hash.
 */

const Router = (() => {

  const registry = {}; // moduleId -> { render(container), destroy?(container) }
  let currentModuleId = null;
  let containerEl = null;

  function register(moduleId, handlers) {
    if (!handlers || typeof handlers.render !== "function") {
      throw new Error(`Router.register("${moduleId}") requires a render(container) function.`);
    }
    registry[moduleId] = handlers;
  }

  function getContainer() {
    if (!containerEl) containerEl = document.getElementById("view-root");
    return containerEl;
  }

  function parseHash() {
    const hash = window.location.hash.replace(/^#\/?/, "");
    return hash || "dashboard";
  }

  function navigate(moduleId) {
    if (window.location.hash === `#/${moduleId}`) {
      renderModule(moduleId);
    } else {
      window.location.hash = `#/${moduleId}`;
    }
  }

  function renderModule(moduleId) {
    const container = getContainer();
    if (!container) {
      console.error("[Router] #view-root not found in DOM.");
      return;
    }

    const handler = registry[moduleId];

    // Clean up previous module if it declared a destroy hook
    if (currentModuleId && registry[currentModuleId] && typeof registry[currentModuleId].destroy === "function") {
      try {
        registry[currentModuleId].destroy(container);
      } catch (e) {
        console.error(`[Router] destroy() failed for module "${currentModuleId}":`, e);
      }
    }

    if (!handler) {
      container.innerHTML = `
        <div class="acs-empty-state">
          <h2>Module "${escapeHtml(moduleId)}" not available yet</h2>
          <p>This module hasn't been wired up in this build. Check back after the next development pass.</p>
        </div>`;
      currentModuleId = moduleId;
      updateSidebarActive(moduleId);
      return;
    }

    try {
      container.innerHTML = "";
      handler.render(container);
      currentModuleId = moduleId;
      updateSidebarActive(moduleId);
      updateBreadcrumb(moduleId);
    } catch (e) {
      console.error(`[Router] Failed to render module "${moduleId}":`, e);
      if (window.Database) window.Database.log("error", `Router render failure: ${moduleId}`, { error: String(e) });
      container.innerHTML = `
        <div class="acs-empty-state acs-empty-state--error">
          <h2>Something went wrong loading "${escapeHtml(moduleId)}"</h2>
          <p>${escapeHtml(e.message || String(e))}</p>
        </div>`;
      if (window.NotificationCenter) {
        window.NotificationCenter.push({ type: "error", title: "Module error", message: `Failed to load ${moduleId}` });
      }
    }
  }

  function updateSidebarActive(moduleId) {
    document.querySelectorAll("[data-nav-id]").forEach(el => {
      el.classList.toggle("acs-nav-item--active", el.getAttribute("data-nav-id") === moduleId);
    });
  }

  function updateBreadcrumb(moduleId) {
    const el = document.getElementById("breadcrumb-current");
    if (!el) return;
    const meta = window.AppConfig.NAV_MODULES.find(m => m.id === moduleId);
    el.textContent = meta ? meta.label : moduleId;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function init() {
    window.addEventListener("hashchange", () => renderModule(parseHash()));
    renderModule(parseHash());
  }

  function getCurrentModuleId() {
    return currentModuleId;
  }

  return { register, navigate, init, getCurrentModuleId };

})();

window.Router = Router;
