/**
 * AI Content Studio - Voice Studio Module
 * -----------------------------------------
 * Generates real, saveable voice audio for each dialogue line using
 * ElevenLabs (Web Speech API is browser-only playback and cannot be
 * exported as a file, so it's offered here purely as a free preview
 * option, clearly labeled as such). Each character can be assigned
 * an ElevenLabs voice once, remembered on their voiceConfig, and
 * reused across every scene without re-selecting it each time.
 */

(function registerVoiceModule() {

  let elevenVoicesCache = null;
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
          <h1>Voice Studio</h1>
          <p>Select a story to generate dialogue audio.</p>
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

  async function renderStudio(container, story) {
    const characters = window.Database.Characters.getByStory(story.id);
    const scenes = window.Database.Scenes.getByStory(story.id).sort((a, b) => a.order - b.order);

    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <button class="acs-btn acs-btn--ghost" id="voice-switch-story" style="margin-bottom:10px;">↔ Switch Story</button>
          <h1>Voice Studio — ${escapeHtml(story.title)}</h1>
          <p>${characters.length} character(s) • ElevenLabs generates real, downloadable audio. Web Speech is preview-only.</p>
        </div>
        <button class="acs-btn acs-btn--ghost" id="voice-refresh-list">🔄 Refresh ElevenLabs voices</button>
      </div>

      <div id="voice-loading" class="acs-empty-inline">Loading ElevenLabs voice list...</div>
      <div id="voice-content" style="display:none;"></div>
    `;

    container.querySelector("#voice-switch-story").addEventListener("click", () => {
      window.AppState.setSelectedStoryId(null);
      render(container);
    });

    await loadElevenVoices(container, false);

    container.querySelector("#voice-refresh-list").addEventListener("click", () => loadElevenVoices(container, true));

    renderContent(container, story, characters, scenes);
  }

  async function loadElevenVoices(container, forceRefresh) {
    const loadingEl = container.querySelector("#voice-loading");
    if (!elevenVoicesCache || forceRefresh) {
      try {
        elevenVoicesCache = await window.AIProviders.listElevenLabsVoices();
        if (loadingEl) loadingEl.style.display = "none";
      } catch (e) {
        elevenVoicesCache = [];
        if (loadingEl) {
          loadingEl.textContent = `Couldn't load ElevenLabs voices: ${e.message}. Add your API key in AI Providers first.`;
        }
      }
    } else if (loadingEl) {
      loadingEl.style.display = "none";
    }
    const contentEl = container.querySelector("#voice-content");
    if (contentEl && elevenVoicesCache && elevenVoicesCache.length > 0) contentEl.style.display = "block";
  }

  function renderContent(container, story, characters, scenes) {
    const contentEl = container.querySelector("#voice-content");
    if (!contentEl) return;

    contentEl.innerHTML = `
      <h2 class="acs-section-title">Character Voice Assignment</h2>
      <div class="acs-story-list" style="margin-bottom:26px;">
        ${characters.length ? characters.map(c => renderCharacterVoiceRow(c)).join("") : `<div class="acs-empty-inline">No characters in this story yet.</div>`}
      </div>

      <h2 class="acs-section-title">Dialogue Audio</h2>
      ${scenes.length ? scenes.map(sc => renderSceneAudioBlock(sc, characters)).join("")
        : `<div class="acs-empty-inline">No scenes yet. Add scenes in Scene Manager first.</div>`}
    `;

    characters.forEach(c => wireCharacterVoiceRow(container, c, story));
    scenes.forEach(sc => wireSceneAudioBlock(container, sc, characters, story));
  }

  function renderCharacterVoiceRow(character) {
    const voiceOptions = (elevenVoicesCache || []).map(v =>
      `<option value="${v.id}" ${character.voiceConfig.elevenLabsVoiceId === v.id ? "selected" : ""}>${escapeHtml(v.name)}</option>`
    ).join("");

    return `
      <div class="acs-story-row" data-char-voice-row="${character.id}">
        <div class="acs-story-row__title">${escapeHtml(character.name)}</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <select class="char-voice-select" style="${inputStyle()} min-width:200px;">
            <option value="">-- No ElevenLabs voice assigned --</option>
            ${voiceOptions}
          </select>
          <button class="acs-btn acs-btn--ghost char-voice-save-btn" style="font-size:12px;">Assign</button>
        </div>
      </div>
    `;
  }

  function wireCharacterVoiceRow(container, character, story) {
    const row = container.querySelector(`[data-char-voice-row="${character.id}"]`);
    if (!row) return;
    row.querySelector(".char-voice-save-btn").addEventListener("click", () => {
      const voiceId = row.querySelector(".char-voice-select").value;
      window.Database.Characters.update(character.id, {
        voiceConfig: { ...character.voiceConfig, elevenLabsVoiceId: voiceId || null }
      });
      window.NotificationCenter.push({ type: "success", title: "Voice assigned", message: `${character.name} will use this voice going forward.` });
    });
  }

  function renderSceneAudioBlock(scene, characters) {
    return `
      <div class="acs-story-row" style="flex-direction:column; align-items:stretch; gap:10px;" data-scene-audio="${scene.id}">
        <div class="acs-story-row__title">#${scene.order + 1} — ${escapeHtml(scene.title)}</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${scene.dialogues.map(d => renderDialogueAudioRow(d, characters)).join("")}
        </div>
      </div>
    `;
  }

  function renderDialogueAudioRow(dialogue, characters) {
    const character = characters.find(c => c.id === dialogue.characterId);
    const assets = window.Database.Assets.getByDialogueId(dialogue.id).filter(a => a.type === "audio");
    const latest = assets[assets.length - 1];
    const hasVoice = character && character.voiceConfig.elevenLabsVoiceId;

    return `
      <div style="border-top:1px solid var(--ink-700); padding-top:8px;" data-dialogue-audio="${dialogue.id}">
        <div style="font-size:12.5px; color:var(--fog-300); margin-bottom:6px;">
          <strong style="color:var(--fog-100);">${escapeHtml(character ? character.name : "Unknown")}:</strong> ${escapeHtml(dialogue.text)}
        </div>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <button class="acs-btn acs-btn--primary gen-voice-btn" data-dialogue-id="${dialogue.id}" data-character-id="${character ? character.id : ""}"
            style="font-size:12px;" ${hasVoice ? "" : "disabled title='Assign an ElevenLabs voice to this character first'"}>
            ${latest ? "🔄 Regenerate audio" : "🎙️ Generate audio"}
          </button>
          <button class="acs-btn acs-btn--ghost preview-webspeech-btn" data-dialogue-id="${dialogue.id}" data-character-id="${character ? character.id : ""}" style="font-size:12px;">
            🔊 Quick browser preview
          </button>
          ${latest ? `<audio controls src="${latest.dataUrl}" style="height:32px;"></audio>` : ""}
        </div>
      </div>
    `;
  }

  function wireSceneAudioBlock(container, scene, characters, story) {
    const block = container.querySelector(`[data-scene-audio="${scene.id}"]`);
    if (!block) return;

    block.querySelectorAll(".gen-voice-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const dialogueId = btn.getAttribute("data-dialogue-id");
        const characterId = btn.getAttribute("data-character-id");
        if (busyKeys.has(dialogueId)) return;
        busyKeys.add(dialogueId);

        const character = characters.find(c => c.id === characterId);
        const dialogue = scene.dialogues.find(d => d.id === dialogueId);
        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Generating...";

        try {
          const dataUrl = await window.AIProviders.generateSpeech("elevenlabs", dialogue.text, character.voiceConfig.elevenLabsVoiceId);
          window.Database.Assets.create({
            type: "audio",
            name: `${character.name} — ${scene.title} — ${dialogue.id}`,
            dataUrl,
            storyId: story.id,
            characterId: character.id,
            meta: { sceneId: scene.id, dialogueId: dialogue.id, provider: "elevenlabs" }
          });
          window.NotificationCenter.push({ type: "success", title: "Audio generated", message: `Line for ${character.name} is ready.` });
          render(container);
        } catch (e) {
          window.NotificationCenter.push({ type: "error", title: "Voice generation failed", message: e.message });
          btn.disabled = false;
          btn.textContent = originalLabel;
        } finally {
          busyKeys.delete(dialogueId);
        }
      });
    });

    block.querySelectorAll(".preview-webspeech-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const characterId = btn.getAttribute("data-character-id");
        const dialogueId = btn.getAttribute("data-dialogue-id");
        const character = characters.find(c => c.id === characterId);
        const dialogue = scene.dialogues.find(d => d.id === dialogueId);
        if (!character || !dialogue || !window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(dialogue.text);
        utterance.rate = character.voiceConfig.rate || 1;
        utterance.pitch = character.voiceConfig.pitch || 1;
        window.speechSynthesis.speak(utterance);
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

  function destroy() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  window.Router.register("voice", { render, destroy });

})();
