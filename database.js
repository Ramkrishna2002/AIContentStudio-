/**
 * AI Content Studio - Database & GSIS Engine
 * -----------------------------------------
 * GSIS (Global Story Identity System) guarantees that entities
 * belonging to different stories NEVER collide or mix, even if
 * they share the same display name (e.g. "Hanuman" in Story A
 * and "Hanuman" in Story B are fully isolated).
 *
 * Every Character record carries:
 *   - storyId            (which story it belongs to)
 *   - characterId         (globally unique)
 *   - voiceProfileId       (unique voice profile)
 *   - imageProfileId       (unique image/visual profile)
 *   - personalityProfileId (unique personality profile)
 *   - memory[]              (append-only memory log, scoped to storyId+characterId)
 *
 * This module owns all reads/writes to the underlying StorageEngine
 * for Stories, Characters, Scenes and Assets, and enforces
 * referential integrity between them.
 */

const Database = (() => {

  const KEYS = window.AppConfig.STORAGE_KEYS;
  const PREFIX = window.AppConfig.ID_PREFIXES;

  // ---------------------------------------------------------
  // ID Generation
  // ---------------------------------------------------------
  function generateId(prefix) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${timestamp}-${random}`.toUpperCase();
  }

  function nowISO() {
    return new Date().toISOString();
  }

  // ---------------------------------------------------------
  // Low-level collection helpers
  // ---------------------------------------------------------
  function loadCollection(key) {
    return window.StorageEngine.get(key, []);
  }

  function saveCollection(key, arr) {
    return window.StorageEngine.set(key, arr);
  }

  function findIndexById(arr, id) {
    return arr.findIndex(item => item.id === id);
  }

  function hasDuplicateId(arr, id) {
    return arr.some(item => item.id === id);
  }

  // ===========================================================
  // STORIES
  // ===========================================================
  const Stories = {
    getAll() {
      return loadCollection(KEYS.STORIES);
    },

    getById(storyId) {
      return Stories.getAll().find(s => s.id === storyId) || null;
    },

    create({ title, category, description = "", language = "hi-en" }) {
      if (!title || !title.trim()) {
        throw new Error("Story title is required.");
      }
      if (!category) {
        throw new Error("Story category is required.");
      }
      const stories = Stories.getAll();
      let id = generateId(PREFIX.STORY);
      while (hasDuplicateId(stories, id)) id = generateId(PREFIX.STORY); // safety net

      const story = {
        id,
        title: title.trim(),
        category,
        description,
        language,
        pipelineStage: "idea",
        characterIds: [],
        sceneIds: [],
        createdAt: nowISO(),
        updatedAt: nowISO()
      };

      stories.push(story);
      saveCollection(KEYS.STORIES, stories);
      Database.log("info", `Story created: ${story.title} (${story.id})`);
      return story;
    },

    update(storyId, patch) {
      const stories = Stories.getAll();
      const idx = findIndexById(stories, storyId);
      if (idx === -1) throw new Error(`Story not found: ${storyId}`);
      stories[idx] = { ...stories[idx], ...patch, id: storyId, updatedAt: nowISO() };
      saveCollection(KEYS.STORIES, stories);
      return stories[idx];
    },

    delete(storyId) {
      const stories = Stories.getAll();
      const target = stories.find(s => s.id === storyId);
      if (!target) return false;

      // Cascade delete: remove all characters, scenes tied to this story (GSIS isolation cleanup)
      const characters = Characters.getAll().filter(c => c.storyId !== storyId);
      saveCollection(KEYS.CHARACTERS, characters);

      const scenes = Scenes.getAll().filter(s => s.storyId !== storyId);
      saveCollection(KEYS.SCENES, scenes);

      const remaining = stories.filter(s => s.id !== storyId);
      saveCollection(KEYS.STORIES, remaining);
      Database.log("info", `Story deleted (cascade): ${storyId}`);
      return true;
    }
  };

  // ===========================================================
  // CHARACTERS (GSIS core)
  // ===========================================================
  const Characters = {
    getAll() {
      return loadCollection(KEYS.CHARACTERS);
    },

    getByStory(storyId) {
      return Characters.getAll().filter(c => c.storyId === storyId);
    },

    getById(characterId) {
      return Characters.getAll().find(c => c.id === characterId) || null;
    },

    /**
     * Creates a character strictly scoped to a storyId.
     * Two characters with the same "name" in different stories
     * will always receive different ids and isolated profiles —
     * this is the GSIS guarantee.
     */
    create({ storyId, name, role = "supporting", personality = {}, voiceConfig = {}, imageConfig = {} }) {
      const story = Stories.getById(storyId);
      if (!story) {
        throw new Error(`Cannot create character: story ${storyId} does not exist.`);
      }
      if (!name || !name.trim()) {
        throw new Error("Character name is required.");
      }

      const characters = Characters.getAll();

      let characterId = generateId(PREFIX.CHARACTER);
      while (hasDuplicateId(characters, characterId)) characterId = generateId(PREFIX.CHARACTER);

      const voiceProfileId = generateId(PREFIX.VOICE_PROFILE);
      const imageProfileId = generateId(PREFIX.IMAGE_PROFILE);
      const personalityProfileId = generateId(PREFIX.PERSONALITY_PROFILE);

      const character = {
        id: characterId,
        storyId,                 // GSIS isolation key
        name: name.trim(),
        role,
        voiceProfileId,
        imageProfileId,
        personalityProfileId,
        voiceConfig: { pitch: 1, rate: 1, voiceURI: null, language: story.language, ...voiceConfig },
        imageConfig: { referenceImageId: null, styleTags: [], ...imageConfig },
        personalityProfile: { traits: [], speakingStyle: "", background: "", ...personality },
        memory: [], // append-only, scoped to this storyId+characterId pair
        createdAt: nowISO(),
        updatedAt: nowISO()
      };

      characters.push(character);
      saveCollection(KEYS.CHARACTERS, characters);

      // link back to story
      Stories.update(storyId, {
        characterIds: [...story.characterIds, characterId]
      });

      Database.log("info", `Character created: ${character.name} in story ${storyId} (${characterId})`);
      return character;
    },

    update(characterId, patch) {
      const characters = Characters.getAll();
      const idx = findIndexById(characters, characterId);
      if (idx === -1) throw new Error(`Character not found: ${characterId}`);
      // storyId is immutable once set — prevents accidental cross-story identity leakage
      const { storyId, id, ...safePatch } = patch;
      characters[idx] = { ...characters[idx], ...safePatch, updatedAt: nowISO() };
      saveCollection(KEYS.CHARACTERS, characters);
      return characters[idx];
    },

    addMemory(characterId, memoryEntry) {
      const characters = Characters.getAll();
      const idx = findIndexById(characters, characterId);
      if (idx === -1) throw new Error(`Character not found: ${characterId}`);
      const entry = {
        id: generateId(PREFIX.MEMORY),
        storyId: characters[idx].storyId,
        characterId,
        content: memoryEntry,
        createdAt: nowISO()
      };
      characters[idx].memory.push(entry);
      characters[idx].updatedAt = nowISO();
      saveCollection(KEYS.CHARACTERS, characters);
      return entry;
    },

    delete(characterId) {
      const characters = Characters.getAll();
      const target = characters.find(c => c.id === characterId);
      if (!target) return false;

      const remaining = characters.filter(c => c.id !== characterId);
      saveCollection(KEYS.CHARACTERS, remaining);

      const story = Stories.getById(target.storyId);
      if (story) {
        Stories.update(story.id, {
          characterIds: story.characterIds.filter(id => id !== characterId)
        });
      }
      Database.log("info", `Character deleted: ${characterId}`);
      return true;
    },

    /** Checks for accidental identity collisions across stories (should always return []) */
    detectCrossStoryCollisions() {
      const all = Characters.getAll();
      const byName = {};
      all.forEach(c => {
        const key = c.name.trim().toLowerCase();
        if (!byName[key]) byName[key] = [];
        byName[key].push(c);
      });
      const collisions = [];
      Object.entries(byName).forEach(([name, chars]) => {
        const storyIds = new Set(chars.map(c => c.storyId));
        if (storyIds.size > 1) {
          // Same name across multiple stories is EXPECTED and fine as long as ids differ.
          const ids = new Set(chars.map(c => c.id));
          if (ids.size !== chars.length) {
            collisions.push({ name, chars });
          }
        }
      });
      return collisions;
    }
  };

  // ===========================================================
  // SCENES
  // ===========================================================
  const Scenes = {
    getAll() {
      return loadCollection(KEYS.SCENES);
    },

    getByStory(storyId) {
      return Scenes.getAll().filter(s => s.storyId === storyId);
    },

    getById(sceneId) {
      return Scenes.getAll().find(s => s.id === sceneId) || null;
    },

    create({ storyId, title, order = null, characterIds = [], dialogues = [] }) {
      const story = Stories.getById(storyId);
      if (!story) throw new Error(`Cannot create scene: story ${storyId} does not exist.`);

      // Validate that referenced characters belong to the SAME story (GSIS integrity check)
      characterIds.forEach(cid => {
        const c = Characters.getById(cid);
        if (!c) throw new Error(`Scene references unknown character: ${cid}`);
        if (c.storyId !== storyId) {
          throw new Error(
            `GSIS violation: character ${cid} belongs to story ${c.storyId}, not ${storyId}.`
          );
        }
      });

      const scenes = Scenes.getAll();
      let id = generateId(PREFIX.SCENE);
      while (hasDuplicateId(scenes, id)) id = generateId(PREFIX.SCENE);

      const scene = {
        id,
        storyId,
        title: title || `Scene ${scenes.filter(s => s.storyId === storyId).length + 1}`,
        order: order !== null ? order : scenes.filter(s => s.storyId === storyId).length,
        characterIds,
        dialogues: dialogues.map(d => ({
          id: generateId(PREFIX.DIALOGUE),
          characterId: d.characterId,
          text: d.text || "",
          promptId: null
        })),
        promptIds: [],
        imageIds: [],
        voiceIds: [],
        renderStatus: "pending", // pending | rendering | done | failed
        createdAt: nowISO(),
        updatedAt: nowISO()
      };

      scenes.push(scene);
      saveCollection(KEYS.SCENES, scenes);

      Stories.update(storyId, { sceneIds: [...story.sceneIds, id] });
      Database.log("info", `Scene created: ${scene.title} in story ${storyId} (${id})`);
      return scene;
    },

    update(sceneId, patch) {
      const scenes = Scenes.getAll();
      const idx = findIndexById(scenes, sceneId);
      if (idx === -1) throw new Error(`Scene not found: ${sceneId}`);
      const { storyId, id, ...safePatch } = patch;
      scenes[idx] = { ...scenes[idx], ...safePatch, updatedAt: nowISO() };
      saveCollection(KEYS.SCENES, scenes);
      return scenes[idx];
    },

    delete(sceneId) {
      const scenes = Scenes.getAll();
      const target = scenes.find(s => s.id === sceneId);
      if (!target) return false;
      const remaining = scenes.filter(s => s.id !== sceneId);
      saveCollection(KEYS.SCENES, remaining);

      const story = Stories.getById(target.storyId);
      if (story) {
        Stories.update(story.id, {
          sceneIds: story.sceneIds.filter(id => id !== sceneId)
        });
      }
      Database.log("info", `Scene deleted: ${sceneId}`);
      return true;
    }
  };

  // ===========================================================
  // ASSETS
  // ===========================================================
  const Assets = {
    getAll() {
      return loadCollection(KEYS.ASSETS);
    },

    getById(assetId) {
      return Assets.getAll().find(a => a.id === assetId) || null;
    },

    getByPromptId(promptId) {
      return Assets.getAll().filter(a => a.meta && a.meta.promptId === promptId);
    },

    getByDialogueId(dialogueId) {
      return Assets.getAll().filter(a => a.meta && a.meta.dialogueId === dialogueId);
    },

    create({ type, name, dataUrl = null, sourceUrl = null, storyId = null, characterId = null, meta = {} }) {
      if (!type) throw new Error("Asset type is required (image | audio | video | icon).");
      const assets = Assets.getAll();
      let id = generateId(PREFIX.ASSET);
      while (hasDuplicateId(assets, id)) id = generateId(PREFIX.ASSET);

      const asset = {
        id,
        type,
        name: name || id,
        dataUrl,
        sourceUrl,
        storyId,
        characterId,
        meta,
        createdAt: nowISO()
      };
      assets.push(asset);
      saveCollection(KEYS.ASSETS, assets);
      return asset;
    },

    delete(assetId) {
      const assets = Assets.getAll();
      const remaining = assets.filter(a => a.id !== assetId);
      if (remaining.length === assets.length) return false;
      saveCollection(KEYS.ASSETS, remaining);
      return true;
    }
  };

  // ===========================================================
  // LOGGING (Error Console / Performance Monitor feed from this)
  // ===========================================================
  function log(level, message, meta = {}) {
    const logs = window.StorageEngine.get(KEYS.LOGS, []);
    const entry = {
      id: generateId(PREFIX.LOG),
      level, // info | warn | error
      message,
      meta,
      timestamp: nowISO()
    };
    logs.push(entry);
    const max = window.AppConfig.LIMITS.MAX_LOG_ENTRIES;
    const trimmed = logs.length > max ? logs.slice(logs.length - max) : logs;
    window.StorageEngine.set(KEYS.LOGS, trimmed);

    if (window.NotificationCenter && level === "error") {
      window.NotificationCenter.push({ type: "error", title: "Error", message });
    }
    return entry;
  }

  function getLogs() {
    return window.StorageEngine.get(KEYS.LOGS, []);
  }

  // ===========================================================
  // INTEGRITY CHECK (referential integrity across all collections)
  // ===========================================================
  function runIntegrityCheck() {
    const issues = [];
    const stories = Stories.getAll();
    const characters = Characters.getAll();
    const scenes = Scenes.getAll();

    const storyIds = new Set(stories.map(s => s.id));

    characters.forEach(c => {
      if (!storyIds.has(c.storyId)) {
        issues.push({ type: "orphan_character", id: c.id, storyId: c.storyId });
      }
    });

    scenes.forEach(sc => {
      if (!storyIds.has(sc.storyId)) {
        issues.push({ type: "orphan_scene", id: sc.id, storyId: sc.storyId });
      }
      sc.characterIds.forEach(cid => {
        const c = characters.find(ch => ch.id === cid);
        if (!c) {
          issues.push({ type: "broken_character_ref", sceneId: sc.id, characterId: cid });
        } else if (c.storyId !== sc.storyId) {
          issues.push({ type: "gsis_cross_story_violation", sceneId: sc.id, characterId: cid });
        }
      });
    });

    // duplicate ID detection across all collections
    const allIds = [
      ...stories.map(s => s.id),
      ...characters.map(c => c.id),
      ...scenes.map(sc => sc.id)
    ];
    const seen = new Set();
    allIds.forEach(id => {
      if (seen.has(id)) issues.push({ type: "duplicate_id", id });
      seen.add(id);
    });

    return issues;
  }

  // ===========================================================
  // PROMPTS (generated by Prompt Builder, linked to scene/dialogue)
  // ===========================================================
  const Prompts = {
    getAll() {
      return loadCollection(KEYS.PROMPTS);
    },

    getByScene(sceneId) {
      return Prompts.getAll().filter(p => p.sceneId === sceneId);
    },

    getById(promptId) {
      return Prompts.getAll().find(p => p.id === promptId) || null;
    },

    create({ storyId, sceneId, dialogueId = null, characterId = null, kind = "image", text }) {
      const scene = Scenes.getById(sceneId);
      if (!scene) throw new Error(`Cannot create prompt: scene ${sceneId} does not exist.`);
      if (scene.storyId !== storyId) {
        throw new Error(`GSIS violation: scene ${sceneId} does not belong to story ${storyId}.`);
      }

      const prompts = Prompts.getAll();
      let id = generateId(PREFIX.PROMPT);
      while (hasDuplicateId(prompts, id)) id = generateId(PREFIX.PROMPT);

      const prompt = {
        id,
        storyId,
        sceneId,
        dialogueId,
        characterId,
        kind, // image | video | voice-direction
        text,
        createdAt: nowISO(),
        updatedAt: nowISO()
      };
      prompts.push(prompt);
      saveCollection(KEYS.PROMPTS, prompts);

      // link back to scene's prompt list and the specific dialogue line
      const promptIds = [...(scene.promptIds || []), id];
      const dialogues = dialogueId
        ? scene.dialogues.map(d => d.id === dialogueId ? { ...d, promptId: id } : d)
        : scene.dialogues;
      Scenes.update(sceneId, { promptIds, dialogues });

      return prompt;
    },

    update(promptId, patch) {
      const prompts = Prompts.getAll();
      const idx = findIndexById(prompts, promptId);
      if (idx === -1) throw new Error(`Prompt not found: ${promptId}`);
      prompts[idx] = { ...prompts[idx], ...patch, id: promptId, updatedAt: nowISO() };
      saveCollection(KEYS.PROMPTS, prompts);
      return prompts[idx];
    },

    delete(promptId) {
      const prompts = Prompts.getAll();
      const remaining = prompts.filter(p => p.id !== promptId);
      if (remaining.length === prompts.length) return false;
      saveCollection(KEYS.PROMPTS, remaining);
      return true;
    }
  };

  // ===========================================================
  // RENDER JOBS (Render Queue)
  // ===========================================================
  const RenderJobs = {
    getAll() {
      return loadCollection(KEYS.RENDER_QUEUE);
    },

    getByStory(storyId) {
      return RenderJobs.getAll().filter(j => j.storyId === storyId);
    },

    getById(jobId) {
      return RenderJobs.getAll().find(j => j.id === jobId) || null;
    },

    create({ storyId, sceneId = null, isFullEpisode = false }) {
      const story = Stories.getById(storyId);
      if (!story) throw new Error(`Cannot create render job: story ${storyId} does not exist.`);

      if (!isFullEpisode) {
        const scene = Scenes.getById(sceneId);
        if (!scene) throw new Error(`Cannot create render job: scene ${sceneId} does not exist.`);
        if (scene.storyId !== storyId) throw new Error(`GSIS violation: scene ${sceneId} does not belong to story ${storyId}.`);
      }

      const jobs = RenderJobs.getAll();
      let id = generateId(PREFIX.RENDER_JOB);
      while (hasDuplicateId(jobs, id)) id = generateId(PREFIX.RENDER_JOB);

      const job = {
        id,
        storyId,
        sceneId: isFullEpisode ? null : sceneId,
        isFullEpisode,
        status: "queued", // queued | rendering | done | failed
        progress: 0,
        resultAssetId: null,
        error: null,
        createdAt: nowISO(),
        updatedAt: nowISO()
      };
      jobs.push(job);
      saveCollection(KEYS.RENDER_QUEUE, jobs);
      return job;
    },

    update(jobId, patch) {
      const jobs = RenderJobs.getAll();
      const idx = findIndexById(jobs, jobId);
      if (idx === -1) throw new Error(`Render job not found: ${jobId}`);
      jobs[idx] = { ...jobs[idx], ...patch, id: jobId, updatedAt: nowISO() };
      saveCollection(KEYS.RENDER_QUEUE, jobs);
      return jobs[idx];
    },

    delete(jobId) {
      const jobs = RenderJobs.getAll();
      const remaining = jobs.filter(j => j.id !== jobId);
      if (remaining.length === jobs.length) return false;
      saveCollection(KEYS.RENDER_QUEUE, remaining);
      return true;
    }
  };

  const Database = {
    Stories,
    Characters,
    Scenes,
    Assets,
    Prompts,
    RenderJobs,
    generateId,
    log,
    getLogs,
    runIntegrityCheck
  };

  return Database;

})();

window.Database = Database;
