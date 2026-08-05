/**
 * AI Content Studio - AI Provider Manager + Prompt Builder Module
 * -----------------------------------------
 * Tab 1 (Providers): store API keys/models locally per provider,
 * test real connections.
 * Tab 2 (Prompt Builder): pick a story, walk its scenes, and
 * generate image-generation prompts per dialogue line using the
 * configured text provider — grounded in that character's
 * personality/visual profile so prompts stay consistent per GSIS.
 */

(function registerAIModule() {

  let activeTab = "providers"; // providers | prompts
  let busyKeys = new Set(); // tracks in-flight test/generate buttons to prevent double-click

  function render(container) {
    container.innerHTML = `
      <div class="acs-page-header">
        <div>
          <h1>AI Providers</h1>
          <p>Connect your own API keys and generate scene prompts. Keys are stored only in this browser's LocalStorage.</p>
        </div>
      </div>

      <div style="display:flex; gap:8px; margin-bottom:20px; border-bottom:1px solid var(--ink-700);">
        <button class="acs-btn ${activeTab === "providers" ? "acs-btn--primary" : "acs-btn--ghost"}" id="tab-providers" style="border-radius:6px 6px 0 0;">Provider Settings</button>
        <button class="acs-btn ${activeTab === "prompts" ? "acs-btn--primary" : "acs-btn--ghost"}" id="tab-prompts" style="border-radius:6px 6px 0 0;">Prompt Builder</button>
      </div>

      <div id="ai-tab-content"></div>
    `;

    container.querySelector("#tab-providers").addEventListener("click", () => { activeTab = "providers"; render(container); });
    container.querySelector("#tab-prompts").addEventListener("click", () => { activeTab = "prompts"; render(container); });

    const content = container.querySelector("#ai-tab-content");
    if (activeTab === "providers") renderProvidersTab(content);
    else renderPromptsTab(content);
  }

  // ===========================================================
  // TAB 1: PROVIDER SETTINGS
  // ===========================================================
  function renderProvidersTab(content) {
    const categories = [
      { key: "text", label: "Text Generation (scripts, prompts, dialogue)" },
      { key: "image", label: "Image Generation" },
      { key: "voice", label: "Voice Generation" }
    ];

    content.innerHTML = categories.map(cat => `
      <h2 class="acs-section-title">${cat.label}</h2>
      <div class="acs-story-list" style="margin-bottom:26px;">
        ${window.AppConfig.AI_PROVIDERS[cat.key].map(p => renderProviderRow(cat.key, p)).join("")}
      </div>
    `).join("");

    window.AppConfig.AI_PROVIDERS.text.concat(window.AppConfig.AI_PROVIDERS.image, window.AppConfig.AI_PROVIDERS.voice)
      .forEach(p => wireProviderRow(content, p));
  }

  function renderProviderRow(categoryKey, provider) {
    const settings = provider.requiresKey ? window.AIProviders.getProviderSettings(provider.id) : { apiKey: "", model: "" };
    return `
      <div class="acs-story-row" style="flex-direction:column; align-items:stretch; gap:10px;" data-provider-id="${provider.id}" data-category="${categoryKey}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="acs-story-row__title">${provider.label}${provider.enabled ? "" : " <span class='acs-tag'>coming soon</span>"}</div>
          <span id="status-${provider.id}" class="acs-story-row__meta"></span>
        </div>
        ${provider.enabled ? `
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${provider.requiresKey ? `
              <input type="password" class="provider-key-input" placeholder="API key" value="${escapeAttr(settings.apiKey || "")}"
                style="${inputStyle()} flex:1; min-width:220px;" />
            ` : `<div style="${inputStyle()} flex:1; min-width:220px; color:var(--fog-300);">No API key required (built into browser)</div>`}
            <input type="text" class="provider-model-input" placeholder="Model (optional override)" value="${escapeAttr(settings.model || "")}"
              style="${inputStyle()} width:200px;" ${provider.requiresKey ? "" : "disabled"} />
            <button class="acs-btn acs-btn--ghost provider-save-btn">Save</button>
            <button class="acs-btn acs-btn--primary provider-test-btn">Test Connection</button>
          </div>
        ` : `<div class="acs-empty-inline">This provider isn't wired up yet in this build.</div>`}
      </div>
    `;
  }

  function wireProviderRow(content, provider) {
    const row = content.querySelector(`[data-provider-id="${provider.id}"]`);
    if (!row || !provider.enabled) return;

    const saveBtn = row.querySelector(".provider-save-btn");
    const testBtn = row.querySelector(".provider-test-btn");
    const statusEl = row.querySelector(`#status-${provider.id}`);
    const category = row.getAttribute("data-category");

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const keyInput = row.querySelector(".provider-key-input");
        const modelInput = row.querySelector(".provider-model-input");
        window.AIProviders.setProviderSettings(provider.id, {
          apiKey: keyInput ? keyInput.value.trim() : "",
          model: modelInput ? modelInput.value.trim() : ""
        });
        window.NotificationCenter.push({ type: "success", title: "Saved", message: `${provider.label} settings saved locally.` });
      });
    }

    if (testBtn) {
      testBtn.addEventListener("click", async () => {
        if (busyKeys.has(provider.id)) return;
        busyKeys.add(provider.id);
        testBtn.disabled = true;
        statusEl.textContent = "Testing...";
        try {
          const result = await window.AIProviders.testConnection(category, provider.id);
          statusEl.textContent = "✅ " + result;
          window.NotificationCenter.push({ type: "success", title: "Connection OK", message: `${provider.label}: ${result}` });
        } catch (e) {
          statusEl.textContent = "❌ " + e.message;
          window.NotificationCenter.push({ type: "error", title: "Connection failed", message: e.message });
        } finally {
          busyKeys.delete(provider.id);
          testBtn.disabled = false;
        }
      });
    }
  }

  // ===========================================================
  // TAB 2: PROMPT BUILDER
  // ===========================================================
  function renderPromptsTab(content) {
    const storyId = window.AppState.getSelectedStoryId();
    const story = storyId ? window.Database.Stories.getById(storyId) : null;

    if (!story) {
      const stories = window.Database.Stories.getAll();
      content.innerHTML = `
        <p style="color:var(--fog-300); font-size:13px; margin-bottom:14px;">Select a story to build prompts for its scenes.</p>
        <div class="acs-story-list">
          ${stories.length ? stories.map(s => `
            <div class="acs-story-row" data-pick-story="${s.id}" style="cursor:pointer;">
              <div class="acs-story-row__title">${escapeHtml(s.title)}</div>
              <button class="acs-btn acs-btn--primary">Select</button>
            </div>
          `).join("") : `<div class="acs-empty-inline">No stories yet. Create one in Story Manager first.</div>`}
        </div>
      `;
      content.querySelectorAll("[data-pick-story]").forEach(row => {
        row.addEventListener("click", () => {
          window.AppState.setSelectedStoryId(row.getAttribute("data-pick-story"));
          renderPromptsTab(content);
        });
      });
      return;
    }

    const scenes = window.Database.Scenes.getByStory(story.id).sort((a, b) => a.order - b.order);
    const characters = window.Database.Characters.getByStory(story.id);

    content.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <div>
          <strong>${escapeHtml(story.title)}</strong>
          <span style="color:var(--fog-300); font-size:12.5px;"> — ${scenes.length} scene(s)</span>
        </div>
        <button class="acs-btn acs-btn--ghost" id="prompt-switch-story">↔ Switch Story</button>
      </div>
      ${scenes.length ? scenes.map(sc => renderSceneBlock(sc, characters)).join("")
        : `<div class="acs-empty-inline">No scenes yet in this story. Add scenes in Scene Manager first.</div>`}
    `;

    content.querySelector("#prompt-switch-story").addEventListener("click", () => {
      window.AppState.setSelectedStoryId(null);
      renderPromptsTab(content);
    });

    scenes.forEach(sc => wireSceneBlock(content, sc, characters, story));
  }

  function renderSceneBlock(scene, characters) {
    const prompts = window.Database.Prompts.getByScene(scene.id);
    return `
      <div class="acs-story-row" style="flex-direction:column; align-items:stretch; gap:10px;" data-scene-block="${scene.id}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="acs-story-row__title">#${scene.order + 1} — ${escapeHtml(scene.title)}</div>
          <button class="acs-btn acs-btn--primary generate-prompts-btn" data-scene-id="${scene.id}" ${scene.dialogues.length === 0 ? "disabled" : ""}>
            ✨ Generate Prompts
          </button>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${scene.dialogues.map(d => {
            const c = characters.find(ch => ch.id === d.characterId);
            const prompt = prompts.find(p => p.dialogueId === d.id);
            return `
              <div style="border-top:1px solid var(--ink-700); padding-top:8px;">
                <div style="font-size:12.5px; color:var(--fog-300);"><strong style="color:var(--fog-100);">${escapeHtml(c ? c.name : "Unknown")}:</strong> ${escapeHtml(d.text)}</div>
                ${prompt ? `
                  <textarea class="prompt-edit-text" data-prompt-id="${prompt.id}" rows="2"
                    style="${inputStyle()} width:100%; margin-top:6px; font-family:var(--font-mono); font-size:12px;">${escapeHtml(prompt.text)}</textarea>
                  <div style="display:flex; gap:6px; margin-top:4px;">
                    <button class="acs-btn acs-btn--ghost prompt-save-btn" data-prompt-id="${prompt.id}" style="font-size:11.5px; padding:5px 10px;">Save edit</button>
                  </div>
                ` : `<div style="font-size:12px; color:var(--ink-500); margin-top:4px; font-style:italic;">No prompt yet — click "Generate Prompts" above.</div>`}
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  function wireSceneBlock(content, scene, characters, story) {
    const block = content.querySelector(`[data-scene-block="${scene.id}"]`);
    if (!block) return;

    const genBtn = block.querySelector(".generate-prompts-btn");
    if (genBtn) {
      genBtn.addEventListener("click", async () => {
        const key = `gen-${scene.id}`;
        if (busyKeys.has(key)) return;
        busyKeys.add(key);
        genBtn.disabled = true;
        genBtn.textContent = "Generating...";

        const settings = window.AIProviders.getProviderSettings("anthropic");
        if (!settings.apiKey) {
          window.NotificationCenter.push({ type: "warn", title: "No API key", message: "Add an Anthropic API key in Provider Settings first." });
          genBtn.disabled = false;
          genBtn.textContent = "✨ Generate Prompts";
          busyKeys.delete(key);
          return;
        }

        try {
          for (const dialogue of scene.dialogues) {
            const existing = window.Database.Prompts.getByScene(scene.id).find(p => p.dialogueId === dialogue.id);
            if (existing) continue; // don't regenerate ones the user already has
            const character = characters.find(c => c.id === dialogue.characterId);
            const built = buildPromptRequest(story, scene, dialogue, character);
            const promptText = await window.AIProviders.generateText("anthropic", built);
            window.Database.Prompts.create({
              storyId: story.id,
              sceneId: scene.id,
              dialogueId: dialogue.id,
              characterId: character ? character.id : null,
              kind: "image",
              text: promptText.trim()
            });
          }
          window.NotificationCenter.push({ type: "success", title: "Prompts generated", message: `Scene "${scene.title}" is ready.` });
          renderPromptsTab(content);
        } catch (e) {
          window.NotificationCenter.push({ type: "error", title: "Generation failed", message: e.message });
          genBtn.disabled = false;
          genBtn.textContent = "✨ Generate Prompts";
        } finally {
          busyKeys.delete(key);
        }
      });
    }

    block.querySelectorAll(".prompt-save-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const promptId = btn.getAttribute("data-prompt-id");
        const textarea = block.querySelector(`.prompt-edit-text[data-prompt-id="${promptId}"]`);
        window.Database.Prompts.update(promptId, { text: textarea.value });
        window.NotificationCenter.push({ type: "success", title: "Prompt saved", message: "Your edit was saved." });
      });
    });
  }

  function buildPromptRequest(story, scene, dialogue, character) {
    const traits = character ? (character.personalityProfile.traits || []).join(", ") : "";
    const styleTags = character ? (character.imageConfig.styleTags || []).join(", ") : "";
    return `You are a visual prompt writer for an AI image generator, working on the story "${story.title}" (category: ${story.category}).
Scene: "${scene.title}".
Character speaking: ${character ? character.name : "Unknown"}${traits ? ` (traits: ${traits})` : ""}${styleTags ? ` (visual style: ${styleTags})` : ""}.
Dialogue line: "${dialogue.text}"

Write ONE detailed image-generation prompt (under 60 words) describing this character's pose, expression, and the scene's setting/mood while they say this line. Output ONLY the prompt text, nothing else.`;
  }

  function inputStyle() {
    return "background:var(--ink-800); border:1px solid var(--ink-700); color:var(--fog-100); border-radius:6px; padding:9px 12px; font-size:13px;";
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }
  function escapeAttr(str) { return escapeHtml(str).replace(/"/g, "&quot;"); }

  window.Router.register("ai", { render });

})();
