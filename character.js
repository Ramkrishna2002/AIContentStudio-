/**
 * AI Content Studio - Character Manager Module
 * -----------------------------------------
 * Operates strictly within the story selected via AppState
 * (set by Story Manager's "Manage Characters" button). This is
 * the GSIS enforcement point in the UI: there is no way to create
 * a character without an active story context, and every character
 * created here is permanently tied to that storyId.
 *
 * Voice profile uses the browser's Web Speech API (SpeechSynthesis)
 * for live preview. Voice list loading is async and inconsistent
 * across browsers, so we use the voiceschanged event with a
 * fallback poll — the same pattern used to fix the earlier
 * Hindi/English voice-loading bug in YouTube AI Studio.
 */

(function registerCharacterModule() {

  let editingCharacterId = null;
  let cachedVoices = [];

  function loadVoicesWithFallback(onReady) {
    const synth = window.speechSynthesis;
    if (!synth) { onReady([]); return; }

    const existing = synth.getVoices();
    if (existing && existing.length > 0) {
      onReady(existing);
      return;
    }

    let resolved = false;
    const handleVoicesChanged = () => {
      if (resolved) return;
      const voices = synth.getVoices();
      if (voices && voices.length > 0) {
        resolved = true;
        synth.removeEventListener("voiceschanged", handleVoicesChanged);
        onReady(voices);
      }
    };
    synth.addEventListener("voiceschanged", handleVoicesChanged);

    // Fallback poll in case voiceschanged never fires (older browsers / some mobile webviews)
    let attempts = 0;
    const pollId = setInterval(() => {
      attempts++;
      const voices = synth.getVoices();
      if (!resolved && voices && voices.length > 0) {
        resolved = true;
        clearInterval(pollId);
        synth.removeEventListener("voiceschanged", handleVoicesChanged);
        onReady(voices);
      } else if (attempts > 20) { // ~4s at 200ms
        clearInterval(pollId);
        if (!resolved) onReady(synth.getVoices() || []);
      }
    }, 200);
  }

  function render(container) {
    const storyId = window.AppState.getSelectedStoryId();
    const story = storyId ? window.Database.Stories.getById(storyId) : null;

    if (!story) {
      renderStoryPicker(container);
      return;
    }

    loadVoicesWithFallback(voices => {
      cachedVoices = voices;
      renderCharacterList(container, story);
    });
  }

  // ===========================================================
  // No story selected yet — pick one
  // ===========================================================
  function renderStoryPicker(container) {
    const stories = window.Database.Stories.getAll();
    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <h1>Character Manager</h1>
          <p>Select a story first — characters always belong to exactly one story (GSIS).</p>
        </div>
      </div>
      <div class="acs-story-list">
        ${stories.length ? stories.map(s => `
          <div class="acs-story-row" data-pick-story="${s.id}" style="cursor:pointer;">
            <div>
              <div class="acs-story-row__title">${escapeHtml(s.title)}</div>
              <div class="acs-story-row__meta">${s.id} • ${s.characterIds.length} characters</div>
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

  // ===========================================================
  // Character list within the selected story
  // ===========================================================
  function renderCharacterList(container, story) {
    const characters = window.Database.Characters.getByStory(story.id);

    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <button class="acs-btn acs-btn--ghost" id="char-switch-story" style="margin-bottom:10px;">↔ Switch Story</button>
          <h1>Characters — ${escapeHtml(story.title)}</h1>
          <p>${characters.length} character(s) isolated to this story (${story.id}).</p>
        </div>
        <button class="acs-btn acs-btn--primary" id="char-new-btn">+ New Character</button>
      </div>

      <div id="char-form-wrap" style="display:none; margin-bottom:22px;"></div>

      <div class="acs-story-list" id="char-list">
        ${characters.length ? characters.map(renderCharacterRow).join("") : `<div class="acs-empty-inline">No characters yet in "${escapeHtml(story.title)}". Add your first one.</div>`}
      </div>
    `;

    wireListEvents(container, story);
  }

  function renderCharacterRow(c) {
    const traits = (c.personalityProfile.traits || []).slice(0, 3).join(", ");
    return `
      <div class="acs-story-row" data-char-id="${c.id}">
        <div>
          <div class="acs-story-row__title">${escapeHtml(c.name)} <span class="acs-tag">${c.role}</span></div>
          <div class="acs-story-row__meta">${c.id} ${traits ? `• traits: ${escapeHtml(traits)}` : ""}</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="acs-btn acs-btn--ghost char-preview-voice" data-id="${c.id}" title="Preview voice">🔊</button>
          <button class="acs-btn acs-btn--ghost char-edit-btn" data-id="${c.id}" title="Edit">✏️</button>
          <button class="acs-btn acs-btn--ghost char-delete-btn" data-id="${c.id}" title="Delete">🗑️</button>
        </div>
      </div>
    `;
  }

  function renderForm(story, existing) {
    const voiceOptions = cachedVoices.map(v =>
      `<option value="${escapeAttr(v.voiceURI)}" ${existing && existing.voiceConfig.voiceURI === v.voiceURI ? "selected" : ""}>${escapeHtml(v.name)} (${v.lang})</option>`
    ).join("");

    return `
      <div class="acs-story-row" style="flex-direction:column; align-items:stretch; gap:12px;">
        <h3 style="margin:0; font-family:var(--font-display); font-size:15px;">${existing ? "Edit Character" : "New Character"}</h3>

        <input type="text" id="cf-name" placeholder="Character name (e.g. Hanuman)" value="${existing ? escapeAttr(existing.name) : ""}"
          style="${inputStyle()}" />

        <select id="cf-role" style="${inputStyle()}">
          ${["protagonist", "antagonist", "supporting", "narrator", "extra"].map(r =>
            `<option value="${r}" ${existing && existing.role === r ? "selected" : ""}>${capitalize(r)}</option>`
          ).join("")}
        </select>

        <input type="text" id="cf-traits" placeholder="Personality traits, comma-separated (e.g. brave, loyal, witty)"
          value="${existing ? escapeAttr((existing.personalityProfile.traits || []).join(", ")) : ""}" style="${inputStyle()}" />

        <textarea id="cf-background" placeholder="Background / backstory (optional)" rows="2" style="${inputStyle()} resize:vertical;">${existing ? escapeHtml(existing.personalityProfile.background || "") : ""}</textarea>

        <textarea id="cf-speaking-style" placeholder="Speaking style notes (optional, e.g. formal Sanskrit-inflected Hindi)" rows="2" style="${inputStyle()} resize:vertical;">${existing ? escapeHtml(existing.personalityProfile.speakingStyle || "") : ""}</textarea>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <select id="cf-voice" style="${inputStyle()} flex:1; min-width:220px;">
            <option value="">-- Browser default voice --</option>
            ${voiceOptions}
          </select>
          <input type="range" id="cf-rate" min="0.5" max="2" step="0.1" value="${existing ? existing.voiceConfig.rate : 1}" title="Speech rate" />
          <input type="range" id="cf-pitch" min="0" max="2" step="0.1" value="${existing ? existing.voiceConfig.pitch : 1}" title="Speech pitch" />
          <button class="acs-btn acs-btn--ghost" id="cf-test-voice" type="button">🔊 Test</button>
        </div>

        <input type="text" id="cf-style-tags" placeholder="Visual style tags, comma-separated (e.g. golden armor, blue skin)"
          value="${existing ? escapeAttr((existing.imageConfig.styleTags || []).join(", ")) : ""}" style="${inputStyle()}" />

        <div style="display:flex; gap:8px;">
          <button class="acs-btn acs-btn--primary" id="cf-submit">${existing ? "Save Changes" : "Create Character"}</button>
          <button class="acs-btn acs-btn--ghost" id="cf-cancel">Cancel</button>
        </div>
      </div>
    `;
  }

  function inputStyle() {
    return "background:var(--ink-800); border:1px solid var(--ink-700); color:var(--fog-100); border-radius:6px; padding:9px 12px; font-size:13px;";
  }

  function wireListEvents(container, story) {
    container.querySelector("#char-switch-story").addEventListener("click", () => {
      window.AppState.setSelectedStoryId(null);
      render(container);
    });

    const formWrap = container.querySelector("#char-form-wrap");

    container.querySelector("#char-new-btn").addEventListener("click", () => {
      editingCharacterId = null;
      formWrap.innerHTML = renderForm(story, null);
      formWrap.style.display = "block";
      wireFormEvents(container, formWrap, story, null);
      container.querySelector("#cf-name").focus();
    });

    container.querySelectorAll(".char-edit-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const c = window.Database.Characters.getById(btn.getAttribute("data-id"));
        editingCharacterId = c.id;
        formWrap.innerHTML = renderForm(story, c);
        formWrap.style.display = "block";
        wireFormEvents(container, formWrap, story, c);
        formWrap.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    container.querySelectorAll(".char-delete-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const c = window.Database.Characters.getById(id);
        if (!c) return;
        const confirmed = window.confirm(`Delete character "${c.name}"? This cannot be undone.`);
        if (!confirmed) return;
        window.Database.Characters.delete(id);
        window.NotificationCenter.push({ type: "info", title: "Character deleted", message: `"${c.name}" was removed.` });
        renderCharacterList(container, window.Database.Stories.getById(story.id));
      });
    });

    container.querySelectorAll(".char-preview-voice").forEach(btn => {
      btn.addEventListener("click", () => {
        const c = window.Database.Characters.getById(btn.getAttribute("data-id"));
        speakPreview(c.name, c.voiceConfig, `Namaste, main ${c.name} hoon.`);
      });
    });
  }

  function wireFormEvents(container, formWrap, story, existing) {
    formWrap.querySelector("#cf-cancel").addEventListener("click", () => {
      formWrap.style.display = "none";
      formWrap.innerHTML = "";
    });

    formWrap.querySelector("#cf-test-voice").addEventListener("click", () => {
      const name = formWrap.querySelector("#cf-name").value.trim() || "Character";
      const voiceConfig = collectVoiceConfig(formWrap);
      speakPreview(name, voiceConfig, `Namaste, main ${name} hoon.`);
    });

    formWrap.querySelector("#cf-submit").addEventListener("click", () => {
      const name = formWrap.querySelector("#cf-name").value.trim();
      if (!name) {
        window.NotificationCenter.push({ type: "warn", title: "Name required", message: "Please enter a character name." });
        return;
      }
      const role = formWrap.querySelector("#cf-role").value;
      const traits = formWrap.querySelector("#cf-traits").value.split(",").map(t => t.trim()).filter(Boolean);
      const background = formWrap.querySelector("#cf-background").value.trim();
      const speakingStyle = formWrap.querySelector("#cf-speaking-style").value.trim();
      const styleTags = formWrap.querySelector("#cf-style-tags").value.split(",").map(t => t.trim()).filter(Boolean);
      const voiceConfig = collectVoiceConfig(formWrap);

      try {
        if (existing) {
          window.Database.Characters.update(existing.id, {
            name, role,
            personalityProfile: { traits, background, speakingStyle },
            voiceConfig,
            imageConfig: { ...existing.imageConfig, styleTags }
          });
          window.NotificationCenter.push({ type: "success", title: "Character updated", message: `"${name}" saved.` });
        } else {
          window.Database.Characters.create({
            storyId: story.id,
            name, role,
            personality: { traits, background, speakingStyle },
            voiceConfig,
            imageConfig: { styleTags }
          });
          window.NotificationCenter.push({ type: "success", title: "Character created", message: `"${name}" added to "${story.title}".` });
        }
        renderCharacterList(container, window.Database.Stories.getById(story.id));
      } catch (e) {
        window.NotificationCenter.push({ type: "error", title: "Save failed", message: e.message });
      }
    });
  }

  function collectVoiceConfig(formWrap) {
    return {
      voiceURI: formWrap.querySelector("#cf-voice").value || null,
      rate: parseFloat(formWrap.querySelector("#cf-rate").value),
      pitch: parseFloat(formWrap.querySelector("#cf-pitch").value),
      language: "hi-en"
    };
  }

  function speakPreview(name, voiceConfig, text) {
    const synth = window.speechSynthesis;
    if (!synth) {
      window.NotificationCenter.push({ type: "warn", title: "Voice unavailable", message: "This browser doesn't support speech synthesis." });
      return;
    }
    synth.cancel(); // stop any currently playing preview
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = voiceConfig.rate || 1;
    utterance.pitch = voiceConfig.pitch || 1;
    if (voiceConfig.voiceURI) {
      const voice = cachedVoices.find(v => v.voiceURI === voiceConfig.voiceURI);
      if (voice) utterance.voice = voice;
    }
    synth.speak(utterance);
  }

  function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }
  function escapeAttr(str) { return escapeHtml(str).replace(/"/g, "&quot;"); }

  function destroy() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  window.Router.register("character", { render, destroy });

})();
