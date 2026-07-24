/**
 * AI Content Studio - Video Assembly Module
 * -----------------------------------------
 * For each scene, pairs every dialogue line with its latest
 * generated image (Image Studio) and audio (Voice Studio) into an
 * ordered clip timeline, shows readiness at a glance, and submits
 * a job to the Render Queue (which does the actual encoding via
 * VideoEngine). This module does NOT render video itself — that
 * happens in the Render Queue so jobs can be tracked/retried in
 * one place.
 */

(function registerVideoModule() {

  function render(container) {
    const storyId = window.AppState.getSelectedStoryId();
    const story = storyId ? window.Database.Stories.getById(storyId) : null;

    if (!story) {
      renderStoryPicker(container);
      return;
    }

    renderTimelines(container, story);
  }

  function renderStoryPicker(container) {
    const stories = window.Database.Stories.getAll();
    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <h1>Video Assembly</h1>
          <p>Select a story to assemble its scenes into video clips.</p>
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

  function buildClipReadiness(scene) {
    return scene.dialogues.map(d => {
      const imageAssets = window.Database.Assets.getByDialogueId(d.id).filter(a => a.type === "image");
      const audioAssets = window.Database.Assets.getByDialogueId(d.id).filter(a => a.type === "audio");
      return {
        dialogue: d,
        image: imageAssets[imageAssets.length - 1] || null,
        audio: audioAssets[audioAssets.length - 1] || null
      };
    });
  }

  function renderTimelines(container, story) {
    const scenes = window.Database.Scenes.getByStory(story.id).sort((a, b) => a.order - b.order);
    const jobs = window.Database.RenderJobs.getByStory(story.id);

    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <button class="acs-btn acs-btn--ghost" id="video-switch-story" style="margin-bottom:10px;">↔ Switch Story</button>
          <h1>Video Assembly — ${escapeHtml(story.title)}</h1>
          <p>${scenes.length} scene(s). Each dialogue line needs both an image and audio clip to be render-ready.</p>
        </div>
      </div>

      ${!window.VideoEngine.isSupported() ? `<div class="acs-empty-inline" style="margin-bottom:20px;">⚠️ This browser doesn't fully support in-browser video rendering (needs MediaRecorder + canvas.captureStream). Assembly previews still work; use desktop Chrome or Edge to actually render.</div>` : ""}

      ${scenes.length ? scenes.map(sc => renderSceneTimeline(sc, jobs)).join("") : `<div class="acs-empty-inline">No scenes yet. Add scenes in Scene Manager first.</div>`}
    `;

    container.querySelector("#video-switch-story").addEventListener("click", () => {
      window.AppState.setSelectedStoryId(null);
      render(container);
    });

    scenes.forEach(sc => wireSceneTimeline(container, sc, story));
  }

  function renderSceneTimeline(scene, jobs) {
    const clips = buildClipReadiness(scene);
    const readyCount = clips.filter(c => c.image && c.audio).length;
    const existingJob = jobs.filter(j => j.sceneId === scene.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

    return `
      <div class="acs-story-row" style="flex-direction:column; align-items:stretch; gap:12px;" data-scene-timeline="${scene.id}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div class="acs-story-row__title">#${scene.order + 1} — ${escapeHtml(scene.title)}</div>
            <div class="acs-story-row__meta">${readyCount}/${clips.length} clip(s) ready ${existingJob ? `• last job: ${existingJob.status}` : ""}</div>
          </div>
          <button class="acs-btn acs-btn--primary send-to-queue-btn" data-scene-id="${scene.id}" ${readyCount === 0 ? "disabled title='No ready clips yet'" : ""}>
            🎞️ Send to Render Queue
          </button>
        </div>

        <div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:6px;">
          ${clips.map((c, i) => renderClipThumb(c, i)).join("")}
        </div>
      </div>
    `;
  }

  function renderClipThumb(clip, index) {
    const ready = clip.image && clip.audio;
    return `
      <div style="min-width:120px; background:var(--ink-800); border:1px solid ${ready ? "var(--teal-500)" : "var(--ink-700)"}; border-radius:8px; padding:6px; flex-shrink:0;">
        <div style="height:68px; background:var(--ink-900); border-radius:4px; overflow:hidden; margin-bottom:4px;">
          ${clip.image ? `<img src="${clip.image.dataUrl}" style="width:100%; height:100%; object-fit:cover;" />` : `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--ink-500); font-size:10px;">No image</div>`}
        </div>
        <div style="font-size:10px; color:var(--fog-300); display:flex; justify-content:space-between;">
          <span>#${index + 1}</span>
          <span>${clip.audio ? "🔊" : "🔇"}</span>
        </div>
      </div>
    `;
  }

  function wireSceneTimeline(container, scene, story) {
    const block = container.querySelector(`[data-scene-timeline="${scene.id}"]`);
    if (!block) return;

    const btn = block.querySelector(".send-to-queue-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        try {
          window.Database.RenderJobs.create({ storyId: story.id, sceneId: scene.id });
          window.Database.Scenes.update(scene.id, { renderStatus: "pending" });
          window.NotificationCenter.push({ type: "success", title: "Queued", message: `"${scene.title}" sent to Render Queue.` });
          window.Router.navigate("render");
        } catch (e) {
          window.NotificationCenter.push({ type: "error", title: "Couldn't queue scene", message: e.message });
        }
      });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  window.Router.register("video", { render });

})();
