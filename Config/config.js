/**
 * AI Content Studio - Global Configuration
 * -----------------------------------------
 * Central source of truth for app-wide constants, feature flags,
 * storage keys, and provider registries. All other modules read
 * from this file instead of hardcoding values.
 */

const AppConfig = (() => {

  const APP_NAME = "AI Content Studio";
  const APP_VERSION = "0.1.0";
  const BUILD_STAGE = "prototype"; // prototype | beta | production

  // ---------------------------------------------------------
  // Storage keys (LocalStorage namespacing)
  // ---------------------------------------------------------
  const STORAGE_KEYS = {
    ROOT: "acs_root_v1",
    STORIES: "acs_stories_v1",
    CHARACTERS: "acs_characters_v1",
    SCENES: "acs_scenes_v1",
    ASSETS: "acs_assets_v1",
    SETTINGS: "acs_settings_v1",
    RENDER_QUEUE: "acs_render_queue_v1",
    BACKUPS: "acs_backups_v1",
    LOGS: "acs_logs_v1",
    SESSION: "acs_session_v1",
    NOTIFICATIONS: "acs_notifications_v1",
    AI_SETTINGS: "acs_ai_settings_v1",
    PROMPTS: "acs_prompts_v1",
    SECURITY: "acs_security_v1"
  };

  // ---------------------------------------------------------
  // ID prefixes used across GSIS (Global Story Identity System)
  // ---------------------------------------------------------
  const ID_PREFIXES = {
    STORY: "STY",
    CHARACTER: "CHR",
    VOICE_PROFILE: "VOI",
    IMAGE_PROFILE: "IMG",
    PERSONALITY_PROFILE: "PER",
    MEMORY: "MEM",
    SCENE: "SCN",
    DIALOGUE: "DLG",
    PROMPT: "PMT",
    ASSET: "AST",
    RENDER_JOB: "RJB",
    EXPORT: "EXP",
    BACKUP: "BKP",
    NOTIFICATION: "NTF",
    LOG: "LOG"
  };

  // ---------------------------------------------------------
  // Content categories supported by the studio
  // ---------------------------------------------------------
  const CONTENT_CATEGORIES = [
    { id: "anime_episode", label: "Long Anime Episode" },
    { id: "ramayan", label: "Ramayan" },
    { id: "mahabharat", label: "Mahabharat" },
    { id: "krishna_leela", label: "Krishna Leela" },
    { id: "original_story", label: "Original Story" },
    { id: "youtube_video", label: "YouTube Video" },
    { id: "youtube_shorts", label: "YouTube Shorts" },
    { id: "news_video", label: "News Video" },
    { id: "funny_video", label: "Funny Video" },
    { id: "educational_video", label: "Educational Video" },
    { id: "multi_language", label: "Multi-language Content" }
  ];

  // ---------------------------------------------------------
  // AI Provider Registry (extensible; used by ai.js)
  // ---------------------------------------------------------
  const AI_PROVIDERS = {
    text: [
      { id: "anthropic", label: "Anthropic Claude", enabled: true, requiresKey: true },
      { id: "openai", label: "OpenAI", enabled: true, requiresKey: true },
      { id: "gemini", label: "Google Gemini", enabled: true, requiresKey: true },
      { id: "local", label: "Local Model", enabled: false, requiresKey: false }
    ],
    image: [
      { id: "stability", label: "Stability AI", enabled: true, requiresKey: true },
      { id: "openai_image", label: "OpenAI Images", enabled: true, requiresKey: true },
      { id: "local_image", label: "Local Diffusion", enabled: false, requiresKey: false }
    ],
    voice: [
      { id: "elevenlabs", label: "ElevenLabs", enabled: true, requiresKey: true },
      { id: "webspeech", label: "Browser Web Speech API", enabled: true, requiresKey: false }
    ]
  };

  // ---------------------------------------------------------
  // Story pipeline stage order (used by router + status tracking)
  // ---------------------------------------------------------
  const PIPELINE_STAGES = [
    "idea", "story", "episode", "scene", "dialogue",
    "prompt", "image", "voice", "animation",
    "render", "preview", "export"
  ];

  // ---------------------------------------------------------
  // Navigation / module registry (drives sidebar + router)
  // ---------------------------------------------------------
  const NAV_MODULES = [
    { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
    { id: "story", label: "Story Manager", icon: "book" },
    { id: "character", label: "Character Manager", icon: "users" },
    { id: "scene", label: "Scene Manager", icon: "film" },
    { id: "asset", label: "Asset Library", icon: "folder" },
    { id: "ai", label: "AI Providers", icon: "cpu" },
    { id: "image", label: "Image Studio", icon: "image" },
    { id: "voice", label: "Voice Studio", icon: "mic" },
    { id: "video", label: "Video Assembly", icon: "video" },
    { id: "render", label: "Render Queue", icon: "layers" },
    { id: "preview", label: "Preview Studio", icon: "eye" },
    { id: "export", label: "Export Center", icon: "download" },
    { id: "settings", label: "Settings", icon: "settings" }
  ];

  const LIMITS = {
    MAX_BACKUPS: 10,
    MAX_LOG_ENTRIES: 500,
    MAX_NOTIFICATIONS: 100,
    AUTOSAVE_INTERVAL_MS: 30000
  };

  return Object.freeze({
    APP_NAME,
    APP_VERSION,
    BUILD_STAGE,
    STORAGE_KEYS,
    ID_PREFIXES,
    CONTENT_CATEGORIES,
    AI_PROVIDERS,
    PIPELINE_STAGES,
    NAV_MODULES,
    LIMITS
  });

})();

// Expose globally (no module bundler in this prototype stage)
window.AppConfig = AppConfig;
