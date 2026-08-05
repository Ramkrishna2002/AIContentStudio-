/**
 * AI Content Studio - Story Manager Module
 * -----------------------------------------
 * List all stories (search + filter by category), create/edit/delete,
 * and drill into a story's detail view: pipeline stage control,
 * character/scene counts, and jump-off points into Character Manager
 * and Scene Manager (via AppState.setSelectedStoryId).
 */

(function registerStoryModule() {

  // local view state: "list" | "detail"
  let viewMode = "list";
  let detailStoryId = null;
  let searchQuery = "";
  let categoryFilter = "all";

  function render(container) {
    if (viewMode === "detail" && detailStoryId) {
      renderDetail(container, detailStoryId);
    } else {
      renderList(container);
    }
  }

  // ===========================================================
  // LIST VIEW
  // ===========================================================
  function renderList(container) {
    const allStories = window.Database.Stories.getAll();

    const filtered = allStories.filter(s => {
      const matchesQuery = !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === "all" || s.category === categoryFilter;
      return matchesQuery && matchesCategory;
    });

    const categoryOptions = window.AppConfig.CONTENT_CATEGORIES.map(c =>
      `<option value="${c.id}" ${categoryFilter === c.id ? "selected" : ""}>${c.label}</option>`
    ).join("");

    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <h1>Story Manager</h1>
          <p>${allStories.length} stories total. Each story has its own isolated characters (GSIS).</p>
        </div>
        <button class="acs-btn acs-btn--primary" id="story-new-btn">+ New Story</button>
      </div>

      <div style="display:flex; gap:10px; margin-bottom:18px; flex-wrap:wrap;">
        <input type="text" id="story-search" placeholder="Search stories..." value="${escapeAttr(searchQuery)}"
          style="flex:1; min-width:200px; background:var(--ink-800); border:1px solid var(--ink-700); color:var(--fog-100); border-radius:6px; padding:9px 12px; font-size:13px;" />
        <select id="story-category-filter"
          style="background:var(--ink-800); border:1px solid var(--ink-700); color:var(--fog-100); border-radius:6px; padding:9px 12px; font-size:13px;">
          <option value="all" ${categoryFilter === "all" ? "selected" : ""}>All categories</option>
          ${categoryOptions}
        </select>
      </div>

      <div id="story-form-wrap" style="display:none; margin-bottom:22px;"></div>

      <div class="acs-story-list" id="story-list">
        ${filtered.length ? filtered.map(renderStoryRow).join("") : `<div class="acs-empty-inline">No stories match. Try clearing filters or create a new story.</div>`}
      </div>
    `;

    wireListEvents(container);
  }

  function renderStoryRow(story) {
    const category = window.AppConfig.CONTENT_CATEGORIES.find(c => c.id === story.category);
    return `
      <div class="acs-story-row" data-story-id="${story.id}" style="cursor:pointer;">
        <div>
          <div class="acs-story-row__title">${escapeHtml(story.title)}</div>
          <div class="acs-story-row__meta">${story.id} • ${story.characterIds.length} characters • ${story.sceneIds.length} scenes • stage: ${story.pipelineStage}</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="acs-tag">${category ? category.label : story.category}</span>
          <button class="acs-btn acs-btn--ghost story-delete-btn" data-id="${story.id}" title="Delete story">🗑️</button>
        </div>
      </div>
    `;
  }

  function renderForm(existing = null) {
    const categoryOptions = window.AppConfig.CONTENT_CATEGORIES.map(c =>
      `<option value="${c.id}" ${existing && existing.category === c.id ? "selected" : ""}>${c.label}</option>`
    ).join("");

    return `
      <div class="acs-story-row" style="flex-direction:column; align-items:stretch; gap:12px;">
        <h3 style="margin:0; font-family:var(--font-display); font-size:15px;">${existing ? "Edit Story" : "Create Story"}</h3>
        <input type="text" id="sf-title" placeholder="Story title" value="${existing ? escapeAttr(existing.title) : ""}"
          style="background:var(--ink-800); border:1px solid var(--ink-700); color:var(--fog-100); border-radius:6px; padding:9px 12px; font-size:13px;" />
        <select id="sf-category"
          style="background:var(--ink-800); border:1px solid var(--ink-700); color:var(--fog-100); border-radius:6px; padding:9px 12px; font-size:13px;">
          ${categoryOptions}
        </select>
        <input type="text" id="sf-language" placeholder="Language (e.g. hi-en, hi-IN, en-US)" value="${existing ? escapeAttr(existing.language) : "hi-en"}"
          style="background:var(--ink-800); border:1px solid var(--ink-700); color:var(--fog-100); border-radius:6px; padding:9px 12px; font-size:13px;" />
        <textarea id="sf-description" placeholder="Short description (optional)" rows="2"
          style="background:var(--ink-800); border:1px solid var(--ink-700); color:var(--fog-100); border-radius:6px; padding:9px 12px; font-size:13px; resize:vertical;">${existing ? escapeHtml(existing.description) : ""}</textarea>
        <div style="display:flex; gap:8px;">
          <button class="acs-btn acs-btn--primary" id="sf-submit">${existing ? "Save Changes" : "Create Story"}</button>
          <button class="acs-btn acs-btn--ghost" id="sf-cancel">Cancel</button>
        </div>
      </div>
    `;
  }

  function wireListEvents(container) {
    const formWrap = container.querySelector("#story-form-wrap");

    container.querySelector("#story-new-btn").addEventListener("click", () => {
      formWrap.innerHTML = renderForm(null);
      formWrap.style.display = "block";
      wireFormEvents(container, formWrap, null);
      container.querySelector("#sf-title").focus();
    });

    container.querySelector("#story-search").addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderList(container);
    });

    container.querySelector("#story-category-filter").addEventListener("change", (e) => {
      categoryFilter = e.target.value;
      renderList(container);
    });

    container.querySelectorAll(".story-delete-btn").forEach(btn => {
      btn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        const id = btn.getAttribute("data-id");
        const story = window.Database.Stories.getById(id);
        if (!story) return;
        const confirmed = window.confirm(
          `Delete "${story.title}"? This also removes its ${story.characterIds.length} character(s) and ${story.sceneIds.length} scene(s).`
        );
        if (!confirmed) return;
        window.Database.Stories.delete(id);
        window.NotificationCenter.push({ type: "info", title: "Story deleted", message: `"${story.title}" was removed.` });
        renderList(container);
      });
    });

    container.querySelectorAll(".acs-story-row[data-story-id]").forEach(row => {
      row.addEventListener("click", () => {
        detailStoryId = row.getAttribute("data-story-id");
        viewMode = "detail";
        render(container);
      });
    });
  }

  function wireFormEvents(container, formWrap, existing) {
    formWrap.querySelector("#sf-cancel").addEventListener("click", () => {
      formWrap.style.display = "none";
      formWrap.innerHTML = "";
    });

    formWrap.querySelector("#sf-submit").addEventListener("click", () => {
      const title = formWrap.querySelector("#sf-title").value.trim();
      const category = formWrap.querySelector("#sf-category").value;
      const language = formWrap.querySelector("#sf-language").value.trim() || "hi-en";
      const description = formWrap.querySelector("#sf-description").value.trim();

      if (!title) {
        window.NotificationCenter.push({ type: "warn", title: "Title required", message: "Please enter a story title." });
        return;
      }

      try {
        if (existing) {
          window.Database.Stories.update(existing.id, { title, category, language, description });
          window.NotificationCenter.push({ type: "success", title: "Story updated", message: `"${title}" saved.` });
        } else {
          const story = window.Database.Stories.create({ title, category, language, description });
          window.NotificationCenter.push({ type: "success", title: "Story created", message: `"${story.title}" is ready.` });
        }
        renderList(container);
      } catch (e) {
        window.NotificationCenter.push({ type: "error", title: "Save failed", message: e.message });
      }
    });
  }

  // ===========================================================
  // DETAIL VIEW
  // ===========================================================
  function renderDetail(container, storyId) {
    const story = window.Database.Stories.getById(storyId);
    if (!story) {
      viewMode = "list";
      renderList(container);
      return;
    }

    const category = window.AppConfig.CONTENT_CATEGORIES.find(c => c.id === story.category);
    const characters = window.Database.Characters.getByStory(storyId);
    const scenes = window.Database.Scenes.getByStory(storyId);
    const stages = window.AppConfig.PIPELINE_STAGES;

    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <button class="acs-btn acs-btn--ghost" id="story-back-btn" style="margin-bottom:10px;">← Back to Stories</button>
          <h1>${escapeHtml(story.title)}</h1>
          <p>${story.id} • <span class="acs-tag">${category ? category.label : story.category}</span></p>
        </div>
        <button class="acs-btn acs-btn--ghost" id="story-edit-btn">Edit Story</button>
      </div>

      ${story.description ? `<p style="color:var(--fog-300); font-size:13.5px; margin-top:-10px;">${escapeHtml(story.description)}</p>` : ""}

      <div id="story-detail-form-wrap" style="display:none; margin-bottom:22px;"></div>

      <div class="acs-card-grid">
        <div class="acs-stat-card"><div class="acs-stat-card__label">Characters</div><div class="acs-stat-card__value acs-stat-card__value--teal">${characters.length}</div></div>
        <div class="acs-stat-card"><div class="acs-stat-card__label">Scenes</div><div class="acs-stat-card__value acs-stat-card__value--accent">${scenes.length}</div></div>
        <div class="acs-stat-card"><div class="acs-stat-card__label">Language</div><div class="acs-stat-card__value" style="font-size:16px;">${escapeHtml(story.language)}</div></div>
      </div>

      <h2 class="acs-section-title">Pipeline Stage</h2>
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:22px; flex-wrap:wrap;">
        <select id="story-stage-select"
          style="background:var(--ink-800); border:1px solid var(--ink-700); color:var(--fog-100); border-radius:6px; padding:9px 12px; font-size:13px;">
          ${stages.map(s => `<option value="${s}" ${story.pipelineStage === s ? "selected" : ""}>${capitalize(s)}</option>`).join("")}
        </select>
        <button class="acs-btn acs-btn--primary" id="story-stage-save">Update Stage</button>
      </div>

      <div style="display:flex; gap:12px; margin-bottom:26px; flex-wrap:wrap;">
        <button class="acs-btn acs-btn--ghost" id="goto-characters">🎭 Manage Characters (${characters.length})</button>
        <button class="acs-btn acs-btn--ghost" id="goto-scenes">🎬 Manage Scenes (${scenes.length})</button>
      </div>

      <h2 class="acs-section-title">Characters in this story</h2>
      <div class="acs-story-list">
        ${characters.length ? characters.map(c => `
          <div class="acs-story-row">
            <div>
              <div class="acs-story-row__title">${escapeHtml(c.name)}</div>
              <div class="acs-story-row__meta">${c.id} • role: ${c.role}</div>
            </div>
            <span class="acs-tag">${c.role}</span>
          </div>
        `).join("") : `<div class="acs-empty-inline">No characters yet. Use "Manage Characters" to add some — they'll be permanently isolated to this story.</div>`}
      </div>
    `;

    wireDetailEvents(container, story);
  }

  function wireDetailEvents(container, story) {
    container.querySelector("#story-back-btn").addEventListener("click", () => {
      viewMode = "list";
      detailStoryId = null;
      renderList(container);
    });

    container.querySelector("#story-edit-btn").addEventListener("click", () => {
      const formWrap = container.querySelector("#story-detail-form-wrap");
      formWrap.innerHTML = renderForm(story);
      formWrap.style.display = "block";
      wireFormEvents(container, formWrap, story);
      // override submit to re-render detail instead of list
      const submitBtn = formWrap.querySelector("#sf-submit");
      const newSubmitBtn = submitBtn.cloneNode(true);
      submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
      newSubmitBtn.addEventListener("click", () => {
        const title = formWrap.querySelector("#sf-title").value.trim();
        const category = formWrap.querySelector("#sf-category").value;
        const language = formWrap.querySelector("#sf-language").value.trim() || "hi-en";
        const description = formWrap.querySelector("#sf-description").value.trim();
        if (!title) {
          window.NotificationCenter.push({ type: "warn", title: "Title required", message: "Please enter a story title." });
          return;
        }
        window.Database.Stories.update(story.id, { title, category, language, description });
        window.NotificationCenter.push({ type: "success", title: "Story updated", message: `"${title}" saved.` });
        renderDetail(container, story.id);
      });
    });

    container.querySelector("#story-stage-save").addEventListener("click", () => {
      const newStage = container.querySelector("#story-stage-select").value;
      window.Database.Stories.update(story.id, { pipelineStage: newStage });
      window.NotificationCenter.push({ type: "success", title: "Stage updated", message: `Now at "${capitalize(newStage)}".` });
      renderDetail(container, story.id);
    });

    container.querySelector("#goto-characters").addEventListener("click", () => {
      window.AppState.setSelectedStoryId(story.id);
      window.Router.navigate("character");
    });

    container.querySelector("#goto-scenes").addEventListener("click", () => {
      window.AppState.setSelectedStoryId(story.id);
      window.Router.navigate("scene");
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

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }

  function destroy() {
    viewMode = "list";
    detailStoryId = null;
  }

  window.Router.register("story", { render, destroy });

  // Exposed so other modules (e.g. Dashboard) can deep-link straight
  // into a story's detail view instead of the list.
  window.StoryModule = {
    openDetail(storyId) {
      viewMode = "detail";
      detailStoryId = storyId;
    }
  };

})();
