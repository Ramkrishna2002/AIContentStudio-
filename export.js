/**
 * AI Content Studio - Export Center Module
 * -----------------------------------------
 * Final stage of the pipeline: render the full episode (all scenes
 * combined into one video via the same VideoEngine used by Render
 * Queue), download individual/complete videos, generate real
 * YouTube-ready metadata (title/description/tags) with the text AI
 * provider, and export the story's structured project data as JSON
 * for backup or reuse.
 */

(function registerExportModule() {

  function render(container) {
    const storyId = window.AppState.getSelectedStoryId();
    const story = storyId ? window.Database.Stories.getById(storyId) : null;

    if (!story) {
      renderStoryPicker(container);
      return;
    }

    renderExport(container, story);
  }

  function renderStoryPicker(container) {
    const stories = window.Database.Stories.getAll();
    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <h1>Export Center</h1>
          <p>Select a story to export its finished episode and metadata.</p>
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

  function renderExport(container, story) {
    const scenes = window.Database.Scenes.getByStory(story.id).sort((a, b) => a.order - b.order);
    const doneScenes = scenes.filter(s => s.renderStatus === "done");
    const fullEpisodeJobs = window.Database.RenderJobs.getByStory(story.id).filter(j => j.isFullEpisode);
    const latestFullEpisodeJob = fullEpisodeJobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    const fullEpisodeAsset = latestFullEpisodeJob?.resultAssetId ? window.Database.Assets.getById(latestFullEpisodeJob.resultAssetId) : null;

    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <button class="acs-btn acs-btn--ghost" id="export-switch-story" style="margin-bottom:10px;">↔ Switch Story</button>
          <h1>Export Center — ${escapeHtml(story.title)}</h1>
          <p>${doneScenes.length}/${scenes.length} scene(s) rendered and ready.</p>
        </div>
      </div>

      <h2 class="acs-section-title">Full Episode</h2>
      <div class="acs-story-row" style="flex-direction:column; align-items:stretch; gap:10px; margin-bottom:26px;">
        ${fullEpisodeAsset ? `
          <video controls style="width:100%; max-height:380px; background:#000; border-radius:8px;" src="${fullEpisodeAsset.dataUrl}"></video>
          <a href="${fullEpisodeAsset.dataUrl}" download="${escapeAttr(story.title)}-full-episode.webm" class="acs-btn acs-btn--ghost" style="width:fit-content;">⬇ Download Full Episode</a>
        ` : `<div class="acs-empty-inline">No full-episode render yet.</div>`}
        <button class="acs-btn acs-btn--primary" id="export-render-full" ${doneScenes.length === 0 ? "disabled title='Render at least one scene first'" : ""}>
          🎬 Render Full Episode (${doneScenes.length}/${scenes.length} scenes have images)
        </button>
      </div>

      <h2 class="acs-section-title">Individual Scene Videos</h2>
      <div class="acs-story-list" style="margin-bottom:26px;">
        ${doneScenes.length ? doneScenes.map(sc => renderSceneExportRow(sc)).join("") : `<div class="acs-empty-inline">No scenes rendered yet — do that in Render Queue.</div>`}
      </div>

      <h2 class="acs-section-title">YouTube Metadata</h2>
      <div class="acs-story-row" style="flex-direction:column; align-items:stretch; gap:10px; margin-bottom:26px;">
        <button class="acs-btn acs-btn--primary" id="export-generate-metadata">✨ Generate Title / Description / Tags</button>
        <div id="metadata-output"></div>
      </div>

      <h2 class="acs-section-title">Project Data</h2>
      <div class="acs-story-row">
        <div class="acs-story-row__title">Export structured story data (stories, characters, scenes, prompts) as JSON</div>
        <button class="acs-btn acs-btn--ghost" id="export-project-json">⬇ Export project.json</button>
      </div>
    `;

    wireEvents(container, story, scenes, doneScenes);
  }

  function renderSceneExportRow(scene) {
    const assets = window.Database.Assets.getAll().filter(a => a.type === "video" && a.meta?.sceneId === scene.id && !a.meta?.isFullEpisode);
    const latest = assets[assets.length - 1];
    if (!latest) return "";
    return `
      <div class="acs-story-row">
        <div class="acs-story-row__title">#${scene.order + 1} — ${escapeHtml(scene.title)}</div>
        <a href="${latest.dataUrl}" download="${escapeAttr(scene.title)}.webm" class="acs-btn acs-btn--ghost">⬇ Download</a>
      </div>
    `;
  }

  function wireEvents(container, story, scenes, doneScenes) {
    container.querySelector("#export-switch-story").addEventListener("click", () => {
      window.AppState.setSelectedStoryId(null);
      render(container);
    });

    const renderFullBtn = container.querySelector("#export-render-full");
    if (renderFullBtn && !renderFullBtn.disabled) {
      renderFullBtn.addEventListener("click", () => {
        try {
          window.Database.RenderJobs.create({ storyId: story.id, isFullEpisode: true });
          window.NotificationCenter.push({ type: "success", title: "Queued", message: "Full episode sent to Render Queue." });
          window.Router.navigate("render");
        } catch (e) {
          window.NotificationCenter.push({ type: "error", title: "Couldn't queue full episode", message: e.message });
        }
      });
    }

    container.querySelector("#export-generate-metadata").addEventListener("click", () => generateMetadata(container, story));
    container.querySelector("#export-project-json").addEventListener("click", () => exportProjectJson(story));
  }

  async function generateMetadata(container, story) {
    const btn = container.querySelector("#export-generate-metadata");
    const output = container.querySelector("#metadata-output");
    const settings = window.AIProviders.getProviderSettings("anthropic");
    if (!settings.apiKey) {
      window.NotificationCenter.push({ type: "warn", title: "No API key", message: "Add an Anthropic API key in AI Providers first." });
      return;
    }

    btn.disabled = true;
    btn.textContent = "Generating...";

    const scenes = window.Database.Scenes.getByStory(story.id);
    const dialogueSample = scenes.flatMap(s => s.dialogues.map(d => d.text)).slice(0, 15).join(" / ");

    const prompt = `You are writing YouTube metadata for a video in the category "${story.category}" titled internally "${story.title}".
Description: ${story.description || "(none provided)"}
Sample dialogue: ${dialogueSample || "(none yet)"}

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"title": "...", "description": "...", "tags": ["tag1","tag2", "..."]}
The title should be catchy and under 90 characters. The description should be 2-3 sentences. Include 8-12 relevant tags.`;

    try {
      const raw = await window.AIProviders.generateText("anthropic", prompt);
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      output.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
          <div><strong>Title:</strong> ${escapeHtml(parsed.title)}</div>
          <div><strong>Description:</strong> ${escapeHtml(parsed.description)}</div>
          <div><strong>Tags:</strong> ${(parsed.tags || []).map(t => `<span class="acs-tag">${escapeHtml(t)}</span>`).join(" ")}</div>
          <button class="acs-btn acs-btn--ghost" id="copy-metadata" style="width:fit-content;">📋 Copy as text</button>
        </div>
      `;
      output.querySelector("#copy-metadata").addEventListener("click", () => {
        const text = `${parsed.title}\n\n${parsed.description}\n\n${(parsed.tags || []).join(", ")}`;
        navigator.clipboard.writeText(text).then(() => {
          window.NotificationCenter.push({ type: "success", title: "Copied", message: "Metadata copied to clipboard." });
        });
      });
    } catch (e) {
      output.innerHTML = `<div class="acs-empty-inline">Couldn't generate metadata: ${escapeHtml(e.message)}</div>`;
      window.NotificationCenter.push({ type: "error", title: "Metadata generation failed", message: e.message });
    } finally {
      btn.disabled = false;
      btn.textContent = "✨ Generate Title / Description / Tags";
    }
  }

  function exportProjectJson(story) {
    const characters = window.Database.Characters.getByStory(story.id);
    const scenes = window.Database.Scenes.getByStory(story.id);
    const prompts = window.Database.Prompts.getAll().filter(p => p.storyId === story.id);

    const bundle = {
      exportedAt: new Date().toISOString(),
      appVersion: window.AppConfig.APP_VERSION,
      story,
      characters,
      scenes,
      prompts
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${story.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-project.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    window.NotificationCenter.push({ type: "success", title: "Exported", message: "project.json downloaded." });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }
  function escapeAttr(str) { return escapeHtml(str).replace(/"/g, "&quot;"); }

  window.Router.register("export", { render });

})();
