# AI Content Studio — Progress Tracker

**Last updated:** Phase 7 complete (Settings + Backup + Security + Error Console + Performance + Plugins).
**Stack:** Vanilla HTML/CSS/ES6+ JS, no build step, no external backend. Runs by opening `index.html`.
**Data:** All persisted to browser LocalStorage via `core/storage.js`. Nothing is placeholder/demo code — every button described below actually works, including real calls to Anthropic/OpenAI/Gemini/Stability/ElevenLabs using the user's own API keys (entered in AI Providers).

---

## File tree (as of now)

```
AIContentStudio/
  index.html          — shell: sidebar, topbar, view-root, lock overlay, script includes
  style.css           — "Reel & Ember" dark theme (ink/ember/teal palette), filmstrip pipeline widget
  app.js               — bootstrap: sidebar nav render, topbar wiring, clock, storage meter, app-lock check, router init

  config/
    config.js          — STORAGE_KEYS, ID_PREFIXES, CONTENT_CATEGORIES, AI_PROVIDERS registry, PIPELINE_STAGES, NAV_MODULES, LIMITS

  core/
    storage.js          — safe LocalStorage wrapper (get/set/remove/exportAll/importAll/estimateUsageBytes)
    notifications.js     — toast + notification log system (window.NotificationCenter)
    database.js          — GSIS engine: Stories / Characters / Scenes / Assets / Prompts / RenderJobs CRUD,
                            ID generation, cross-story collision detection, runIntegrityCheck(), log()/getLogs()
    router.js            — hash-based SPA router (window.Router.register/navigate/init)
    state.js             — AppState: cross-module "selected story" context (window.AppState)
    ai-providers.js       — window.AIProviders: generateText (Anthropic/OpenAI/Gemini), generateImage
                            (OpenAI Images/Stability), listElevenLabsVoices, generateSpeech (ElevenLabs), testConnection
    video-engine.js        — window.VideoEngine: real canvas+MediaRecorder+WebAudio video compositing (renderSceneVideo)
    security.js            — window.SecurityManager: PIN app-lock (SHA-256 via crypto.subtle), wipeAllData
    backup.js               — window.BackupSystem: snapshot/restore/export/import full app data as JSON

  modules/  (each self-registers via window.Router.register("id", { render, destroy? }))
    dashboard.js   — stats, pipeline filmstrip, quick story create, recent stories
    story.js        — Story Manager: full CRUD, search/filter, detail view w/ pipeline stage, exposes window.StoryModule.openDetail()
    character.js     — Character Manager: GSIS-scoped to AppState.selectedStoryId, personality/voice/image profile, Web Speech preview
    scene.js          — Scene Manager: GSIS-scoped, dialogue lines tied to in-story characters only
    ai.js              — AI Providers (key/model settings + test connection) + Prompt Builder (Claude-generated image prompts per dialogue)
    image.js            — Image Studio: generates images per prompt (OpenAI Images/Stability), saves as Assets
    voice.js             — Voice Studio: assigns ElevenLabs voice per character, generates real audio per dialogue line
    video.js              — Video Assembly: builds per-scene clip readiness timeline, sends jobs to Render Queue
    render.js              — Render Queue: actually encodes video via VideoEngine, tracks queued/rendering/done/failed, download
    preview.js              — Preview Studio: auto-advancing playlist of rendered scenes + asset gallery
    export.js                — Export Center: full-episode render, scene downloads, AI YouTube metadata (title/desc/tags), project.json export
    settings.js                — Settings hub: General/Backup/Security/Error Console/Performance/Plugins tabs
```

## Data model (core/database.js)

- **Story**: `{ id, title, category, description, language, pipelineStage, characterIds[], sceneIds[], createdAt, updatedAt }`
- **Character** (GSIS core): `{ id, storyId, name, role, voiceProfileId, imageProfileId, personalityProfileId, voiceConfig{rate,pitch,voiceURI,elevenLabsVoiceId}, imageConfig{styleTags[]}, personalityProfile{traits[],background,speakingStyle}, memory[] }`
  - `storyId` is immutable after creation — this is what guarantees two same-named characters in different stories never collide.
- **Scene**: `{ id, storyId, title, order, characterIds[], dialogues[{id,characterId,text,promptId}], promptIds[], renderStatus }`
- **Prompt**: `{ id, storyId, sceneId, dialogueId, characterId, kind:'image', text }`
- **Asset**: `{ id, type:'image'|'audio'|'video', dataUrl(base64), storyId, characterId, meta{sceneId,dialogueId,promptId,...} }`
- **RenderJob**: `{ id, storyId, sceneId(null if full-episode), isFullEpisode, status:'queued'|'rendering'|'done'|'failed', progress, resultAssetId, error }`

## Pipeline (implemented end-to-end)

Story → Character → Scene → Dialogue → Prompt (AI Providers tab) → Image (Image Studio) → Voice (Voice Studio) → Video Assembly → Render Queue (real .webm encoding) → Preview Studio → Export Center (full episode + YouTube metadata)

## NOT yet built (honest gaps)

1. **Project Manager** — no folders/collections to group multiple stories, no version history/snapshots per-story (Backup System snapshots the *whole app*, not per-story versioning).
2. **YouTube Publish Workflow** — Export Center generates metadata but does not OAuth-connect to YouTube Data API or actually upload/publish.
3. Video rendering relies on `MediaRecorder` + `canvas.captureStream()` — solid on desktop Chrome/Edge/Firefox, inconsistent on iOS Safari. This is disclosed in the UI, not hidden.
4. API keys are stored in plain LocalStorage (no real encryption) — disclosed honestly in Settings → Security tab.

## Conventions to keep following

- Every module: `render(container)`, optional `destroy(container)`, self-registers via `window.Router.register(id, {...})`.
- Every module that needs a story context checks `window.AppState.getSelectedStoryId()` and shows a story-picker if none selected.
- Dark theme variables live in `style.css` `:root` (`--ink-*`, `--ember-*`, `--teal-*`, `--fog-*`) — reuse them, don't hardcode new colors.
- All HTML string interpolation goes through local `escapeHtml`/`escapeAttr` helpers already present in each module — copy that pattern in new modules.
- No placeholders/TODOs — every button wired to a real function before considering a module "done".
- Add new `<script>` tags to `index.html` in dependency order: config → core/* → modules/*.
