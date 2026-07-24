/**
 * AI Content Studio - Image Studio Module
 * -----------------------------------------
 * Walks a story's scenes, shows each image prompt created by the
 * Prompt Builder, and generates real images via OpenAI Images or
 * Stability AI using the user's saved key. Generated images are
 * stored as Assets (base64 data URL) linked back to their prompt,
 * scene, dialogue and character so later modules (Video Assembly,
 * Render Queue) can find them by any of those references.
 */

(function registerImageModule() {

  let selectedProvider = "openai_image";
  let busyKeys = new Set();

  function render(container) {
    const storyId = window.AppState.getSelectedStoryId();
    const story = storyId ? window.Database.Stories.getById(storyId) : null;

    if (!story) {
      renderStoryPicker(container);
      return;
    }

    renderStudio(container, story);
  }

  function renderStoryPicker(container) {
    const stories = window.Database.Stories.getAll();
    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <h1>Image Studio</h1>
          <p>Select a story to generate images for its scene prompts.</p>
        </div>
      </div>
      <div class="acs-story-list">
        ${stories.length ? stories.map(s => `
          <div class="acs-story-row" data-pick-story="${s.id}" style="cursor:pointer;">
            <div class="acs-story-row__title">${escapeHtml(s.title)}</div>
            <button class="acs-btn acs-btn--primary">Select</button>
          </div>
        `).join("") : `<div class="acs-empty-inline">No stories yet. Create one in Story Manager first.</div>`}
      </div>
    `;
    container.querySelectorAll("[data-pick-story]").forEach(row => {
      row.addEventListener("click", () => {
        window.AppState.setSelectedStoryId(row.getAttribute("data-pick-story"));
        render(container);
      });
    });
  }

  function renderStudio(container, story) {
    const scenes = window.Database.Scenes.getByStory(story.id).sort((a, b) => a.order - b.order);
    const prompts = window.Database.Prompts.getAll().filter(p => p.storyId === story.id && p.kind === "image");

    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <button class="acs-btn acs-btn--ghost" id="img-switch-story" style="margin-bottom:10px;">↔ Switch Story</button>
          <h1>Image Studio — ${escapeHtml(story.title)}</h1>
          <p>${prompts.length} prompt(s) available across ${scenes.length} scene(s).</p>
        </div>
        <select id="img-provider-select" style="${inputStyle()}">
          <option value="openai_image" ${selectedProvider === "openai_image" ? "selected" : ""}>OpenAI Images</option>
          <option value="stability" ${selectedProvider === "stability" ? "selected" : ""}>Stability AI</option>
        </select>
      </div>

      ${scenes.length === 0 ? `<div class="acs-empty-inline">No scenes yet. Add scenes in Scene Manager first.</div>` : ""}
      ${scenes.length > 0 && prompts.length === 0 ? `<div class="acs-empty-inline">No prompts yet. Generate them in AI Providers → Prompt Builder first.</div>` : ""}

      ${scenes.map(sc => renderSceneGallery(sc, prompts.filter(p => p.sceneId === sc.id))).join("")}
    `;

    container.querySelector("#img-switch-story").addEventListener("click", () => {
      window.AppState.setSelectedStoryId(null);
      render(container);
    });

    container.querySelector("#img-provider-select").addEventListener("change", (e) => {
      selectedProvider = e.target.value;
    });

    scenes.forEach(sc => wireSceneGallery(container, sc, story));
  }

  function renderSceneGallery(scene, scenePrompts) {
    if (scenePrompts.length === 0) return "";
    return `
      <h2 class="acs-section-title">#${scene.order + 1} — ${escapeHtml(scene.title)}</h2>
      <div class="acs-card-grid" data-scene-gallery="${scene.id}">
        ${scenePrompts.map(p => renderPromptCard(p)).join("")}
      </div>
    `;
  }

  function renderPromptCard(prompt) {
    const assets = window.Database.Assets.getByPromptId(prompt.id);
    const latest = assets[assets.length - 1];
    return `
      <div class="acs-stat-card" data-prompt-card="${prompt.id}" style="display:flex; flex-direction:column; gap:8px;">
        <div style="font-size:11.5px; color:var(--fog-300); max-height:60px; overflow:hidden;">${escapeHtml(prompt.text)}</div>
        <div class="prompt-image-slot" style="min-height:120px; display:flex; align-items:center; justify-content:center; background:var(--ink-800); border-radius:6px; overflow:hidden;">
          ${latest ? `<img src="${latest.dataUrl}" alt="Generated" style="width:100%; height:100%; object-fit:cover;" />` : `<span style="color:var(--ink-500); font-size:11.5px;">No image yet</span>`}
        </div>
        <button class="acs-btn acs-btn--primary generate-image-btn" data-prompt-id="${prompt.id}" style="font-size:12px;">
          ${latest ? "🔄 Regenerate" : "🎨 Generate Image"}
        </button>
      </div>
    `;
  }

  function wireSceneGallery(container, scene, story) {
    const gallery = container.querySelector(`[data-scene-gallery="${scene.id}"]`);
    if (!gallery) return;

    gallery.querySelectorAll(".generate-image-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const promptId = btn.getAttribute("data-prompt-id");
        if (busyKeys.has(promptId)) return;
        busyKeys.add(promptId);
        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Generating...";

        try {
          const prompt = window.Database.Prompts.getById(promptId);
          const dataUrl = await window.AIProviders.generateImage(selectedProvider, prompt.text);
          window.Database.Assets.create({
            type: "image",
            name: `${scene.title} — ${prompt.id}`,
            dataUrl,
            storyId: story.id,
            characterId: prompt.characterId,
            meta: { promptId: prompt.id, sceneId: scene.id, dialogueId: prompt.dialogueId, provider: selectedProvider }
          });
          window.NotificationCenter.push({ type: "success", title: "Image generated", message: `Scene "${scene.title}" image ready.` });
          renderStudio(container, window.Database.Stories.getById(story.id));
        } catch (e) {
          window.NotificationCenter.push({ type: "error", title: "Image generation failed", message: e.message });
          btn.disabled = false;
          btn.textContent = originalLabel;
        } finally {
          busyKeys.delete(promptId);
        }
      });
    });
  }

  function inputStyle() {
    return "background:var(--ink-800); border:1px solid var(--ink-700); color:var(--fog-100); border-radius:6px; padding:9px 12px; font-size:13px;";
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  window.Router.register("image", { render });

})();
