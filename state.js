/**
 * AI Content Studio - Shared App State
 * -----------------------------------------
 * Small cross-module state holder. Story Manager sets the
 * "selected story", and Character Manager / Scene Manager read it
 * so they always operate within the correct GSIS-scoped story.
 * Persisted to sessionStorage-backed key so a page refresh keeps
 * context (survives reload, resets on new browser tab/session).
 */

const AppState = (() => {

  const KEY = window.AppConfig.STORAGE_KEYS.SESSION;
  const listeners = [];

  function load() {
    return window.StorageEngine.get(KEY, { selectedStoryId: null });
  }

  function save(state) {
    window.StorageEngine.set(KEY, state);
    listeners.forEach(fn => {
      try { fn(state); } catch (e) { console.error("[AppState] listener error:", e); }
    });
  }

  function getSelectedStoryId() {
    return load().selectedStoryId;
  }

  function setSelectedStoryId(storyId) {
    const state = load();
    state.selectedStoryId = storyId;
    save(state);
  }

  function getSelectedStory() {
    const id = getSelectedStoryId();
    if (!id || !window.Database) return null;
    return window.Database.Stories.getById(id);
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  return { getSelectedStoryId, setSelectedStoryId, getSelectedStory, onChange };

})();

window.AppState = AppState;
