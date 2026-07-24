/**
 * AI Content Studio - Scene Manager Module
 * -----------------------------------------
 * Operates within the story selected via AppState. Scenes hold an
 * ordered list of dialogue lines, each tied to a character — and
 * only characters belonging to the SAME story can be attached,
 * enforced both here (dropdown only lists in-story characters) and
 * again inside Database.Scenes.create/update (GSIS integrity check).
 */

(function registerSceneModule() {

  function render(container) {
    const storyId = window.AppState.getSelectedStoryId();
    const story = storyId ? window.Database.Stories.getById(storyId) : null;

    if (!story) {
      renderStoryPicker(container);
      return;
    }

    renderSceneList(container, story);
  }

  function renderStoryPicker(container) {
    const stories = window.Database.Stories.getAll();
    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <h1>Scene Manager</h1>
          <p>Select a story first — scenes and dialogue always belong to one story.</p>
        </div>
      </div>
      <div class="acs-story-list">
        ${stories.length ? stories.map(s => `
          <div class="acs-story-row" data-pick-story="${s.id}" style="cursor:pointer;">
            <div>
              <div class="acs-story-row__title">${escapeHtml(s.title)}</div>
              <div class="acs-story-row__meta">${s.id} • ${s.sceneIds.length} scenes</div>
            </div>
            <button class="acs-btn acs-btn--primary">Select</button>
          </div>
        `).join("") : `<div class="acs-empty-inline">No stories exist yet. Go to Story Manager to create one first.</div>`}
      </div>
    `;
    container.querySelectorAll("[data-pick-story]").forEach(row => {
      row.addEventListener("click", () => {
        window.AppState.setSelectedStoryId(row.getAttribute("data-pick-story"));
        render(container);
      });
    });
  }

  function renderSceneList(container, story) {
    const scenes = window.Database.Scenes.getByStory(story.id).sort((a, b) => a.order - b.order);
    const characters = window.Database.Characters.getByStory(story.id);

    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <button class="acs-btn acs-btn--ghost" id="scene-switch-story" style="margin-bottom:10px;">↔ Switch Story</button>
          <h1>Scenes — ${escapeHtml(story.title)}</h1>
          <p>${scenes.length} scene(s) • ${characters.length} character(s) available in this story.</p>
        </div>
        <button class="acs-btn acs-btn--primary" id="scene-new-btn" ${characters.length === 0 ? "disabled title='Add a character first'" : ""}>+ New Scene</button>
      </div>

      ${characters.length === 0 ? `<div class="acs-empty-inline" style="margin-bottom:20px;">Add at least one character in Character Manager before creating scenes.</div>` : ""}

      <div id="scene-form-wrap" style="display:none; margin-bottom:22px;"></div>

      <div class="acs-story-list" id="scene-list">
        ${scenes.length ? scenes.map(sc => renderSceneRow(sc, characters)).join("") : `<div class="acs-empty-inline">No scenes yet in "${escapeHtml(story.title)}".</div>`}
      </div>
    `;

    wireListEvents(container, story, characters);
  }

  function renderSceneRow(scene, characters) {
    const statusColor = { pending: "", rendering: "acs-stat-card__value--accent", done: "acs-stat-card__value--teal", failed: "" }[scene.renderStatus] || "";
    return `
      <div class="acs-story-row" style="flex-direction:column; align-items:stretch; gap:8px;" data-scene-id="${scene.id}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div class="acs-story-row__title">#${scene.order + 1} — ${escapeHtml(scene.title)}</div>
            <div class="acs-story-row__meta">${scene.id} • ${scene.dialogues.length} dialogue line(s) • status: ${scene.renderStatus}</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="acs-btn acs-btn--ghost scene-edit-btn" data-id="${scene.id}">✏️ Edit</button>
            <button class="acs-btn acs-btn--ghost scene-delete-btn" data-id="${scene.id}">🗑️</button>
          </div>
        </div>
        ${scene.dialogues.length ? `
          <div style="border-top:1px solid var(--ink-700); padding-top:8px; display:flex; flex-direction:column; gap:4px;">
            ${scene.dialogues.map(d => {
              const c = characters.find(ch => ch.id === d.characterId);
              return `<div style="font-size:12.5px; color:var(--fog-300);"><strong style="color:var(--fog-100);">${escapeHtml(c ? c.name : "Unknown")}:</strong> ${escapeHtml(d.text)}</div>`;
            }).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderForm(story, characters, existing) {
    const characterOptions = characters.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    const existingDialogues = existing ? existing.dialogues : [];

    return `
      <div class="acs-story-row" style="flex-direction:column; align-items:stretch; gap:12px;">
        <h3 style="margin:0; font-family:var(--font-display); font-size:15px;">${existing ? "Edit Scene" : "New Scene"}</h3>

        <input type="text" id="scf-title" placeholder="Scene title" value="${existing ? escapeAttr(existing.title) : ""}" style="${inputStyle()}" />

        <div>
          <div style="font-size:11.5px; color:var(--fog-300); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Dialogue lines</div>
          <div id="scf-dialogue-rows" style="display:flex; flex-direction:column; gap:8px;">
            ${existingDialogues.map((d, i) => renderDialogueRow(d, characterOptions, i)).join("")}
          </div>
          <button class="acs-btn acs-btn--ghost" id="scf-add-dialogue" type="button" style="margin-top:8px;">+ Add dialogue line</button>
        </div>

        <div style="display:flex; gap:8px;">
          <button class="acs-btn acs-btn--primary" id="scf-submit">${existing ? "Save Changes" : "Create Scene"}</button>
          <button class="acs-btn acs-btn--ghost" id="scf-cancel">Cancel</button>
        </div>
      </div>
    `;
  }

  function renderDialogueRow(dialogue, characterOptionsHtml, index) {
    return `
      <div class="scf-dialogue-row" data-idx="${index}" style="display:flex; gap:8px; align-items:flex-start;">
        <select class="scf-dialogue-character" style="${inputStyle()} min-width:140px;">
          ${characterOptionsHtml}
        </select>
        <textarea class="scf-dialogue-text" rows="1" placeholder="Dialogue text..." style="${inputStyle()} flex:1; resize:vertical;">${escapeHtml(dialogue ? dialogue.text : "")}</textarea>
        <button class="acs-btn acs-btn--ghost scf-remove-dialogue" type="button" title="Remove line">✕</button>
      </div>
    `;
  }

  function inputStyle() {
    return "background:var(--ink-800); border:1px solid var(--ink-700); color:var(--fog-100); border-radius:6px; padding:9px 12px; font-size:13px;";
  }

  function wireListEvents(container, story, characters) {
    container.querySelector("#scene-switch-story").addEventListener("click", () => {
      window.AppState.setSelectedStoryId(null);
      render(container);
    });

    const formWrap = container.querySelector("#scene-form-wrap");
    const newBtn = container.querySelector("#scene-new-btn");

    if (newBtn && !newBtn.disabled) {
      newBtn.addEventListener("click", () => {
        formWrap.innerHTML = renderForm(story, characters, null);
        formWrap.style.display = "block";
        wireFormEvents(container, formWrap, story, characters, null);
        formWrap.querySelector("#scf-title").focus();
      });
    }

    container.querySelectorAll(".scene-edit-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const sc = window.Database.Scenes.getById(btn.getAttribute("data-id"));
        formWrap.innerHTML = renderForm(story, characters, sc);
        formWrap.style.display = "block";
        // pre-select each dialogue row's character dropdown to match saved value
        formWrap.querySelectorAll(".scf-dialogue-row").forEach((row, i) => {
          const select = row.querySelector(".scf-dialogue-character");
          select.value = sc.dialogues[i].characterId;
        });
        wireFormEvents(container, formWrap, story, characters, sc);
        formWrap.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    container.querySelectorAll(".scene-delete-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const sc = window.Database.Scenes.getById(id);
        if (!sc) return;
        const confirmed = window.confirm(`Delete scene "${sc.title}"?`);
        if (!confirmed) return;
        window.Database.Scenes.delete(id);
        window.NotificationCenter.push({ type: "info", title: "Scene deleted", message: `"${sc.title}" was removed.` });
        renderSceneList(container, window.Database.Stories.getById(story.id));
      });
    });
  }

  function wireFormEvents(container, formWrap, story, characters, existing) {
    const characterOptions = characters.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");

    formWrap.querySelector("#scf-cancel").addEventListener("click", () => {
      formWrap.style.display = "none";
      formWrap.innerHTML = "";
    });

    formWrap.querySelector("#scf-add-dialogue").addEventListener("click", () => {
      const rowsWrap = formWrap.querySelector("#scf-dialogue-rows");
      const idx = rowsWrap.children.length;
      const div = document.createElement("div");
      div.innerHTML = renderDialogueRow(null, characterOptions, idx);
      const newRow = div.firstElementChild;
      rowsWrap.appendChild(newRow);
      wireRemoveButton(newRow);
    });

    formWrap.querySelectorAll(".scf-dialogue-row").forEach(wireRemoveButton);

    function wireRemoveButton(row) {
      row.querySelector(".scf-remove-dialogue").addEventListener("click", () => row.remove());
    }

    formWrap.querySelector("#scf-submit").addEventListener("click", () => {
      const title = formWrap.querySelector("#scf-title").value.trim();
      const dialogues = Array.from(formWrap.querySelectorAll(".scf-dialogue-row")).map(row => ({
        characterId: row.querySelector(".scf-dialogue-character").value,
        text: row.querySelector(".scf-dialogue-text").value.trim()
      })).filter(d => d.text.length > 0);

      try {
        if (existing) {
          window.Database.Scenes.update(existing.id, {
            title: title || existing.title,
            dialogues: dialogues.map(d => ({
              id: window.Database.generateId(window.AppConfig.ID_PREFIXES.DIALOGUE),
              characterId: d.characterId,
              text: d.text,
              promptId: null
            })),
            characterIds: [...new Set(dialogues.map(d => d.characterId))]
          });
          window.NotificationCenter.push({ type: "success", title: "Scene updated", message: `"${title || existing.title}" saved.` });
        } else {
          const scene = window.Database.Scenes.create({
            storyId: story.id,
            title,
            characterIds: [...new Set(dialogues.map(d => d.characterId))],
            dialogues
          });
          window.NotificationCenter.push({ type: "success", title: "Scene created", message: `"${scene.title}" added.` });
        }
        renderSceneList(container, window.Database.Stories.getById(story.id));
      } catch (e) {
        window.NotificationCenter.push({ type: "error", title: "Save failed", message: e.message });
      }
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }
  function escapeAttr(str) { return escapeHtml(str).replace(/"/g, "&quot;"); }

  window.Router.register("scene", { render });

})();
