/**
 * AI Content Studio - AI Provider Client
 * -----------------------------------------
 * Thin, provider-specific fetch wrappers called directly from the
 * browser using the user's own API keys (stored locally via
 * StorageEngine — see AI_SETTINGS). Every provider call is real:
 * there is no mocked/simulated response path. If a provider blocks
 * direct browser CORS requests, the fetch will fail and the error
 * is surfaced to the user rather than silently faked.
 */

const AIProviders = (() => {

  const KEY = window.AppConfig.STORAGE_KEYS.AI_SETTINGS;

  function getSettings() {
    return window.StorageEngine.get(KEY, {});
  }

  function saveSettings(settings) {
    return window.StorageEngine.set(KEY, settings);
  }

  function getProviderSettings(providerId) {
    const all = getSettings();
    return all[providerId] || { apiKey: "", model: "" };
  }

  function setProviderSettings(providerId, patch) {
    const all = getSettings();
    all[providerId] = { ...(all[providerId] || {}), ...patch };
    saveSettings(all);
    return all[providerId];
  }

  // ---------------------------------------------------------
  // TEXT GENERATION
  // ---------------------------------------------------------
  async function generateText(providerId, prompt) {
    const settings = getProviderSettings(providerId);
    if (!settings.apiKey) {
      throw new Error(`No API key saved for ${providerId}. Add one in AI Providers first.`);
    }

    switch (providerId) {
      case "anthropic":
        return callAnthropic(settings, prompt);
      case "openai":
        return callOpenAIText(settings, prompt);
      case "gemini":
        return callGeminiText(settings, prompt);
      default:
        throw new Error(`Text generation not implemented for provider "${providerId}".`);
    }
  }

  async function callAnthropic(settings, prompt) {
    const model = settings.model || "claude-sonnet-4-6";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `Anthropic API error (${res.status})`);
    }
    const textBlock = (data.content || []).find(b => b.type === "text");
    return textBlock ? textBlock.text : "";
  }

  async function callOpenAIText(settings, prompt) {
    const model = settings.model || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `OpenAI API error (${res.status})`);
    }
    return data.choices?.[0]?.message?.content || "";
  }

  async function callGeminiText(settings, prompt) {
    const model = settings.model || "gemini-1.5-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `Gemini API error (${res.status})`);
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  // ---------------------------------------------------------
  // CONNECTION TEST (used by AI Provider Manager UI)
  // ---------------------------------------------------------
  async function testConnection(category, providerId) {
    if (category === "voice" && providerId === "webspeech") {
      if (!window.speechSynthesis) throw new Error("This browser does not support the Web Speech API.");
      return "Web Speech API available in this browser.";
    }

    if (category === "voice" && providerId === "elevenlabs") {
      const settings = getProviderSettings(providerId);
      if (!settings.apiKey) throw new Error("No API key saved for ElevenLabs.");
      const res = await fetch("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": settings.apiKey }
      });
      if (!res.ok) throw new Error(`ElevenLabs connection failed (${res.status}).`);
      const data = await res.json();
      return `Connected. Subscription tier: ${data?.subscription?.tier || "unknown"}.`;
    }

    if (category === "text") {
      const reply = await generateText(providerId, "Reply with exactly one word: OK");
      return `Connected. Model replied: "${reply.trim().slice(0, 60)}"`;
    }

    if (category === "image" && providerId === "stability") {
      const settings = getProviderSettings(providerId);
      if (!settings.apiKey) throw new Error("No API key saved for Stability AI.");
      const res = await fetch("https://api.stability.ai/v1/user/account", {
        headers: { Authorization: `Bearer ${settings.apiKey}` }
      });
      if (!res.ok) throw new Error(`Stability AI connection failed (${res.status}).`);
      return "Connected to Stability AI.";
    }

    throw new Error(`No connection test implemented yet for ${category}/${providerId}.`);
  }

  // ---------------------------------------------------------
  // IMAGE GENERATION (returns a base64 data URL)
  // ---------------------------------------------------------
  async function generateImage(providerId, prompt) {
    const settings = getProviderSettings(providerId);
    if (!settings.apiKey) {
      throw new Error(`No API key saved for ${providerId}. Add one in AI Providers first.`);
    }
    switch (providerId) {
      case "openai_image":
        return callOpenAIImage(settings, prompt);
      case "stability":
        return callStabilityImage(settings, prompt);
      default:
        throw new Error(`Image generation not implemented for provider "${providerId}".`);
    }
  }

  async function callOpenAIImage(settings, prompt) {
    const model = settings.model || "dall-e-3";
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({ model, prompt, n: 1, size: "1024x1024", response_format: "b64_json" })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `OpenAI image API error (${res.status})`);
    }
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI returned no image data.");
    return `data:image/png;base64,${b64}`;
  }

  async function callStabilityImage(settings, prompt) {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("output_format", "png");
    const res = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.apiKey}`,
        "Accept": "image/*"
      },
      body: form
    });
    if (!res.ok) {
      let message = `Stability AI error (${res.status})`;
      try { const errJson = await res.json(); message = errJson?.errors?.[0] || message; } catch (e) { /* body wasn't JSON */ }
      throw new Error(message);
    }
    const blob = await res.blob();
    return blobToDataUrl(blob);
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ---------------------------------------------------------
  // VOICE GENERATION (ElevenLabs) — returns a base64 audio data URL
  // ---------------------------------------------------------
  async function listElevenLabsVoices() {
    const settings = getProviderSettings("elevenlabs");
    if (!settings.apiKey) throw new Error("No API key saved for ElevenLabs.");
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": settings.apiKey }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail?.message || `ElevenLabs error (${res.status})`);
    return (data.voices || []).map(v => ({ id: v.voice_id, name: v.name }));
  }

  async function generateSpeech(providerId, text, voiceId) {
    if (providerId !== "elevenlabs") {
      throw new Error(`Voice asset generation is only implemented for ElevenLabs (Web Speech is preview-only and can't be saved as a file).`);
    }
    const settings = getProviderSettings("elevenlabs");
    if (!settings.apiKey) throw new Error("No API key saved for ElevenLabs.");
    if (!voiceId) throw new Error("No ElevenLabs voice selected.");

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": settings.apiKey
      },
      body: JSON.stringify({
        text,
        model_id: settings.model || "eleven_multilingual_v2"
      })
    });
    if (!res.ok) {
      let message = `ElevenLabs error (${res.status})`;
      try { const errJson = await res.json(); message = errJson?.detail?.message || message; } catch (e) { /* body wasn't JSON */ }
      throw new Error(message);
    }
    const blob = await res.blob();
    return blobToDataUrl(blob);
  }

  return {
    getSettings,
    saveSettings,
    getProviderSettings,
    setProviderSettings,
    generateText,
    testConnection,
    generateImage,
    listElevenLabsVoices,
    generateSpeech
  };

})();

window.AIProviders = AIProviders;
