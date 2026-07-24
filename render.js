/**
 * AI Content Studio - Render Queue Module
 * -----------------------------------------
 * Lists every render job across all stories, and does the actual
 * video encoding via VideoEngine when the user clicks "Start".
 * Jobs track real status (queued/rendering/done/failed) and real
 * progress percentage from the encoder's own clip-by-clip callback
 * — nothing here is simulated.
 */

(function registerRenderModule() {

  let isProcessing = false;

  function render(container) {
    const jobs = window.Database.RenderJobs.getAll().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <h1>Render Queue</h1>
          <p>${jobs.length} job(s) total. Rendering happens in this tab — keep it open while a job runs.</p>
        </div>
      </div>

      <div class="acs-story-list" id="render-job-list">
        ${jobs.length ? jobs.map(renderJobRow).join("") : `<div class="acs-empty-inline">No render jobs yet. Send a scene here from Video Assembly.</div>`}
      </div>
    `;

    wireJobEvents(container);
  }

  function renderJobRow(job) {
    const story = window.Database.Stories.getById(job.storyId);
    const scene = job.sceneId ? window.Database.Scenes.getById(job.sceneId) : null;
    const asset = job.resultAssetId ? window.Database.Assets.getById(job.resultAssetId) : null;
    const label = job.isFullEpisode ? `${story ? story.title : "Unknown story"} — Full Episode` : (scene ? scene.title : "Unknown scene");

    const statusColorVar = {
      queued: "var(--fog-300)",
      rendering: "var(--ember-400)",
      done: "var(--teal-400)",
      failed: "var(--danger)"
    }[job.status] || "var(--fog-300)";

    return `
      <div class="acs-story-row" style="flex-direction:column; align-items:stretch; gap:10px;" data-job-id="${job.id}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div class="acs-story-row__title">${escapeHtml(label)} <span style="color:${statusColorVar}; font-size:11.5px; font-weight:600;">● ${job.status}</span></div>
            <div class="acs-story-row__meta">${job.id} • ${story ? escapeHtml(story.title) : "Unknown story"}</div>
          </div>
          <div style="display:flex; gap:8px;">
            ${job.status === "queued" || job.status === "failed" ? `<button class="acs-btn acs-btn--primary job-start-btn" data-id="${job.id}">▶ ${job.status === "failed" ? "Retry" : "Start"}</button>` : ""}
            <button class="acs-btn acs-btn--ghost job-delete-btn" data-id="${job.id}">🗑️</button>
          </div>
        </div>

        ${job.status === "rendering" ? `
          <div class="acs-storage-meter__bar" style="height:8px;">
            <div class="acs-storage-meter__fill" style="width:${job.progress}%;"></div>
          </div>
          <div style="font-size:11.5px; color:var(--fog-300);">${job.progress}% — encoding clips...</div>
        ` : ""}

        ${job.status === "failed" && job.error ? `<div style="font-size:11.5px; color:var(--danger);">Error: ${escapeHtml(job.error)}</div>` : ""}

        ${job.status === "done" && asset ? `
          <video controls src="${asset.dataUrl}" style="width:100%; max-height:280px; border-radius:8px; background:#000;"></video>
          <a href="${asset.dataUrl}" download="${escapeAttr(label)}.webm" class="acs-btn acs-btn--ghost" style="width:fit-content;">⬇ Download .webm</a>
        ` : ""}
      </div>
    `;
  }

  function wireJobEvents(container) {
    container.querySelectorAll(".job-start-btn").forEach(btn => {
      btn.addEventListener("click", () => startJob(container, btn.getAttribute("data-id")));
    });

    container.querySelectorAll(".job-delete-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const job = window.Database.RenderJobs.getById(id);
        if (job && job.status === "rendering") {
          window.NotificationCenter.push({ type: "warn", title: "Job is rendering", message: "Wait for it to finish before deleting." });
          return;
        }
        window.Database.RenderJobs.delete(id);
        render(container);
      });
    });
  }

  async function startJob(container, jobId) {
    if (isProcessing) {
      window.NotificationCenter.push({ type: "warn", title: "Queue busy", message: "Another render job is already in progress. Wait for it to finish." });
      return;
    }
    isProcessing = true;

    const job = window.Database.RenderJobs.getById(jobId);
    const characters = window.Database.Characters.getByStory(job.storyId);
    const story = window.Database.Stories.getById(job.storyId);

    const scenesToRender = job.isFullEpisode
      ? window.Database.Scenes.getByStory(job.storyId).sort((a, b) => a.order - b.order)
      : [window.Database.Scenes.getById(job.sceneId)];

    const label = job.isFullEpisode ? `${story.title} (full episode)` : scenesToRender[0]?.title;

    window.Database.RenderJobs.update(jobId, { status: "rendering", progress: 0, error: null });
    render(container);

    try {
      const clips = scenesToRender.flatMap(scene =>
        scene.dialogues.map(d => {
          const character = characters.find(c => c.id === d.characterId);
          const imageAssets = window.Database.Assets.getByDialogueId(d.id).filter(a => a.type === "image");
          const audioAssets = window.Database.Assets.getByDialogueId(d.id).filter(a => a.type === "audio");
          return {
            imageDataUrl: imageAssets[imageAssets.length - 1]?.dataUrl || null,
            audioDataUrl: audioAssets[audioAssets.length - 1]?.dataUrl || null,
            captionText: `${character ? character.name + ": " : ""}${d.text}`
          };
        })
      ).filter(c => c.imageDataUrl); // skip clips with no image at all

      const result = await window.VideoEngine.renderSceneVideo(clips, (done, total) => {
        const pct = Math.round((done / total) * 100);
        window.Database.RenderJobs.update(jobId, { progress: pct });
        const bar = container.querySelector(`[data-job-id="${jobId}"] .acs-storage-meter__fill`);
        if (bar) bar.style.width = `${pct}%`;
      });

      const asset = window.Database.Assets.create({
        type: "video",
        name: `${label} — rendered`,
        dataUrl: result.dataUrl,
        storyId: job.storyId,
        meta: { sceneId: job.sceneId, jobId, isFullEpisode: job.isFullEpisode, durationMs: result.durationMs, mimeType: result.mimeType }
      });

      window.Database.RenderJobs.update(jobId, { status: "done", progress: 100, resultAssetId: asset.id });
      if (!job.isFullEpisode && scenesToRender[0]) {
        window.Database.Scenes.update(scenesToRender[0].id, { renderStatus: "done" });
      }
      window.NotificationCenter.push({ type: "success", title: "Render complete", message: `"${label}" is ready to preview and export.` });
    } catch (e) {
      window.Database.RenderJobs.update(jobId, { status: "failed", error: e.message });
      if (!job.isFullEpisode && scenesToRender[0]) {
        window.Database.Scenes.update(scenesToRender[0].id, { renderStatus: "failed" });
      }
      window.NotificationCenter.push({ type: "error", title: "Render failed", message: e.message });
    } finally {
      isProcessing = false;
      render(container);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }
  function escapeAttr(str) { return escapeHtml(str).replace(/"/g, "&quot;"); }

  window.Router.register("render", { render });

})();
