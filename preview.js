/**
 * AI Content Studio - Preview Studio Module
 * -----------------------------------------
 * Plays a story's rendered scene videos back-to-back as a real
 * playlist (auto-advances on 'ended'), and shows a gallery of every
 * generated image/audio/video asset for quick review before export.
 */

(function registerPreviewModule() {

  let currentPlaylistIndex = 0;

  function render(container) {
    const storyId = window.AppState.getSelectedStoryId();
    const story = storyId ? window.Database.Stories.getById(storyId) : null;

    if (!story) {
      renderStoryPicker(container);
      return;
    }

    currentPlaylistIndex = 0;
    renderPreview(container, story);
  }

  function renderStoryPicker(container) {
    const stories = window.Database.Stories.getAll();
    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <h1>Preview Studio</h1>
          <p>Select a story to preview its rendered scenes and generated assets.</p>
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

  function getPlaylist(story) {
    const scenes = window.Database.Scenes.getByStory(story.id).sort((a, b) => a.order - b.order);
    const videoAssets = window.Database.Assets.getAll().filter(a =>
      a.type === "video" && a.storyId === story.id && !a.meta?.isFullEpisode
    );
    return scenes
      .map(scene => {
        const assetsForScene = videoAssets.filter(a => a.meta?.sceneId === scene.id);
        const latest = assetsForScene[assetsForScene.length - 1];
        return latest ? { scene, asset: latest } : null;
      })
      .filter(Boolean);
  }

  function renderPreview(container, story) {
    const playlist = getPlaylist(story);
    const images = window.Database.Assets.getAll().filter(a => a.type === "image" && a.storyId === story.id);
    const audio = window.Database.Assets.getAll().filter(a => a.type === "audio" && a.storyId === story.id);
    const fullEpisode = window.Database.Assets.getAll()
      .filter(a => a.type === "video" && a.storyId === story.id && a.meta?.isFullEpisode)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <button class="acs-btn acs-btn--ghost" id="preview-switch-story" style="margin-bottom:10px;">↔ Switch Story</button>
          <h1>Preview Studio — ${escapeHtml(story.title)}</h1>
          <p>${playlist.length} rendered scene(s) in the playlist${fullEpisode ? " • full episode also available below" : ""}.</p>
        </div>
      </div>

      ${playlist.length ? `
        <video id="preview-player" controls style="width:100%; max-height:420px; background:#000; border-radius:10px; margin-bottom:10px;"
          src="${playlist[0].asset.dataUrl}"></video>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:26px;">
          <div id="preview-now-playing" style="font-size:13px; color:var(--fog-300);">Now playing: #${playlist[0].scene.order + 1} — ${escapeHtml(playlist[0].scene.title)}</div>
          <div style="display:flex; gap:8px;">
            <button class="acs-btn acs-btn--ghost" id="preview-prev">⏮ Prev</button>
            <button class="acs-btn acs-btn--ghost" id="preview-next">Next ⏭</button>
          </div>
        </div>
      ` : `<div class="acs-empty-inline" style="margin-bottom:26px;">No rendered scenes yet. Render some in the Render Queue first.</div>`}

      ${fullEpisode ? `
        <h2 class="acs-section-title">Full Episode</h2>
        <video controls style="width:100%; max-height:420px; background:#000; border-radius:10px; margin-bottom:26px;" src="${fullEpisode.dataUrl}"></video>
      ` : ""}

      <h2 class="acs-section-title">Generated Images (${images.length})</h2>
      <div class="acs-card-grid" style="grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));">
        ${images.length ? images.map(a => `
          <div class="acs-stat-card" style="padding:6px;"><img src="${a.dataUrl}" style="width:100%; height:110px; object-fit:cover; border-radius:6px;" /></div>
        `).join("") : `<div class="acs-empty-inline">No images generated yet.</div>`}
      </div>

      <h2 class="acs-section-title" style="margin-top:26px;">Generated Audio (${audio.length})</h2>
      <div class="acs-story-list">
        ${audio.length ? audio.map(a => `
          <div class="acs-story-row">
            <div class="acs-story-row__title" style="font-size:12.5px;">${escapeHtml(a.name)}</div>
            <audio controls src="${a.dataUrl}" style="height:32px;"></audio>
          </div>
        `).join("") : `<div class="acs-empty-inline">No audio generated yet.</div>`}
      </div>
    `;

    container.querySelector("#preview-switch-story").addEventListener("click", () => {
      window.AppState.setSelectedStoryId(null);
      render(container);
    });

    if (playlist.length) wirePlaylist(container, playlist);
  }

  function wirePlaylist(container, playlist) {
    const player = container.querySelector("#preview-player");
    const nowPlaying = container.querySelector("#preview-now-playing");

    function loadIndex(i) {
      currentPlaylistIndex = ((i % playlist.length) + playlist.length) % playlist.length;
      const entry = playlist[currentPlaylistIndex];
      player.src = entry.asset.dataUrl;
      player.play().catch(() => {}); // autoplay may be blocked; user can hit play manually
      nowPlaying.textContent = `Now playing: #${entry.scene.order + 1} — ${entry.scene.title}`;
    }

    player.addEventListener("ended", () => {
      if (currentPlaylistIndex < playlist.length - 1) loadIndex(currentPlaylistIndex + 1);
    });

    container.querySelector("#preview-prev").addEventListener("click", () => loadIndex(currentPlaylistIndex - 1));
    container.querySelector("#preview-next").addEventListener("click", () => loadIndex(currentPlaylistIndex + 1));
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  window.Router.register("preview", { render });

})();
