/**
 * AI Content Studio - Dashboard Module
 * -----------------------------------------
 * Landing screen: at-a-glance stats, the pipeline filmstrip for the
 * most recently touched story, a quick "new story" creator, and a
 * list of recent stories with working delete/open actions.
 *
 * This module is fully self-contained: it does not assume the
 * Story Manager module exists yet, so "New Story" works end-to-end
 * against Database.Stories directly.
 */

(function registerDashboard() {

  function render(container) {
    const stories = window.Database.Stories.getAll();
    const characters = window.Database.Characters.getAll();
    const scenes = window.Database.Scenes.getAll();
    const usageKb = (window.StorageEngine.estimateUsageBytes() / 1024).toFixed(1);

    const latestStory = [...stories].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0] || null;

    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of your stories, characters, and pipeline progress.</p>
        </div>
        <button class="acs-btn acs-btn--primary" id="dash-new-story-btn">+ New Story</button>
      </div>

      <div class="acs-card-grid">
        ${statCard("Stories", stories.length, "accent")}
        ${statCard("Characters", characters.length, "teal")}
        ${statCard("Scenes", scenes.length, "")}
        ${statCard("Storage Used", `${usageKb} KB`, "")}
      </div>

      <h2 class="acs-section-title">Pipeline${latestStory ? `: ${escapeHtml(latestStory.title)}` : ""}</h2>
      ${renderFilmstrip(latestStory)}

      <div id="dash-quick-create" class="acs-story-row" style="display:none; flex-direction:column; align-items:stretch; gap:12px; margin-bottom:24px;">
        ${renderQuickCreateForm()}
      </div>

      <h2 class="acs-section-title">Recent Stories</h2>
      <div class="acs-story-list" id="dash-story-list">
        ${stories.length ? [...stories]
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
          .slice(0, 8)
          .map(renderStoryRow)
          .join("")
          : `<div class="acs-empty-inline">No stories yet. Click "+ New Story" to create your first one.</div>`}
      </div>
    `;

    wireEvents(container);
  }

  function statCard(label, value, variant) {
    return `
      <div class="acs-stat-card">
        <div class="acs-stat-card__label">${label}</div>
        <div class="acs-stat-card__value ${variant ? `acs-stat-card__value--${variant}` : ""}">${value}</div>
      </div>
    `;
  }

  function renderFilmstrip(story) {
    const stages = window.AppConfig.PIPELINE_STAGES;
    const currentIdx = story ? stages.indexOf(story.pipelineStage) : -1;

    return `
      <div class="acs-filmstrip">
        ${stages.map((stage, i) => {
          let stateClass = "";
          if (i < currentIdx) stateClass = "acs-filmstrip__stage--done";
          if (i === currentIdx) stateClass = "acs-filmstrip__stage--active";
          const connector = i < stages.length - 1 ? `<div class="acs-filmstrip__connector"></div>` : "";
          return `
            <div class="acs-filmstrip__stage ${stateClass}">
              <div class="acs-filmstrip__dot"></div>
              <div class="acs-filmstrip__label">${capitalize(stage)}</div>
            </div>
            ${connector}
          `;
        }).join("")}
      </div>
    `;
  }

  function renderQuickCreateForm() {
    const categoryOptions = window.AppConfig.CONTENT_CATEGORIES
      .map(c => `<option value="${c.id}">${c.label}</option>`).join("");

    return `
      <input type="text" id="qc-title" placeholder="Story title (e.g. Hanuman and the Sun)"
        style="background:var(--ink-800);border:1px solid var(--ink-700);color:var(--fog-100);border-radius:6px;padding:9px 12px;font-size:13px;" />
      <select id="qc-category"
        style="background:var(--ink-800);border:1px solid var(--ink-700);color:var(--fog-100);border-radius:6px;padding:9px 12px;font-size:13px;">
        ${categoryOptions}
      </select>
      <textarea id="qc-description" placeholder="Short description (optional)" rows="2"
        style="background:var(--ink-800);border:1px solid var(--ink-700);color:var(--fog-100);border-radius:6px;padding:9px 12px;font-size:13px;resize:vertical;"></textarea>
      <div style="display:flex; gap:8px;">
        <button class="acs-btn acs-btn--primary" id="qc-submit">Create Story</button>
        <button class="acs-btn acs-btn--ghost" id="qc-cancel">Cancel</button>
      </div>
    `;
  }

  function renderStoryRow(story) {
    const category = window.AppConfig.CONTENT_CATEGORIES.find(c => c.id === story.category);
    return `
      <div class="acs-story-row" data-story-id="${story.id}">
        <div>
          <div class="acs-story-row__title">${escapeHtml(story.title)}</div>
          <div class="acs-story-row__meta">${story.id} • ${story.characterIds.length} characters • ${story.sceneIds.length} scenes</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="acs-tag">${category ? category.label : story.category}</span>
          <button class="acs-btn acs-btn--ghost dash-delete-story" data-id="${story.id}" title="Delete story">🗑️</button>
        </div>
      </div>
    `;
  }

  function wireEvents(container) {
    const newBtn = container.querySelector("#dash-new-story-btn");
    const quickCreate = container.querySelector("#dash-quick-create");

    newBtn.addEventListener("click", () => {
      const isHidden = quickCreate.style.display === "none";
      quickCreate.style.display = isHidden ? "flex" : "none";
      if (isHidden) container.querySelector("#qc-title").focus();
    });

    container.querySelector("#qc-cancel").addEventListener("click", () => {
      quickCreate.style.display = "none";
    });

    container.querySelector("#qc-submit").addEventListener("click", () => {
      const title = container.querySelector("#qc-title").value.trim();
      const category = container.querySelector("#qc-category").value;
      const description = container.querySelector("#qc-description").value.trim();

      if (!title) {
        window.NotificationCenter.push({ type: "warn", title: "Title required", message: "Please enter a story title before creating." });
        return;
      }

      try {
        const story = window.Database.Stories.create({ title, category, description });
        window.NotificationCenter.push({ type: "success", title: "Story created", message: `"${story.title}" is ready.` });
        render(container); // re-render dashboard with new story visible
      } catch (e) {
        window.NotificationCenter.push({ type: "error", title: "Could not create story", message: e.message });
      }
    });

    container.querySelectorAll(".dash-delete-story").forEach(btn => {
      btn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        const id = btn.getAttribute("data-id");
        const story = window.Database.Stories.getById(id);
        if (!story) return;
        const confirmed = window.confirm(
          `Delete "${story.title}"? This also removes its ${story.characterIds.length} character(s) and ${story.sceneIds.length} scene(s). This cannot be undone.`
        );
        if (!confirmed) return;
        window.Database.Stories.delete(id);
        window.NotificationCenter.push({ type: "info", title: "Story deleted", message: `"${story.title}" was removed.` });
        render(container);
      });
    });

    container.querySelectorAll(".acs-story-row[data-story-id]").forEach(row => {
      row.addEventListener("click", () => {
        const storyId = row.getAttribute("data-story-id");
        if (window.StoryModule) window.StoryModule.openDetail(storyId);
        window.Router.navigate("story");
      });
    });
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  window.Router = window.Router || {};
  // Register once Router is available (script load order guarantees this,
  // but we guard defensively in case load order ever changes).
  if (window.Router && typeof window.Router.register === "function") {
    window.Router.register("dashboard", { render });
  } else {
    document.addEventListener("DOMContentLoaded", () => window.Router.register("dashboard", { render }));
  }

})();
