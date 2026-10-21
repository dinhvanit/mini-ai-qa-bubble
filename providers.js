// Shared provider registry: dùng chung cho popup.js và background.js.
// Model list ở đây là fallback; popup còn tự gọi modelsEndpoint để cập nhật
// danh sách model mới nhất và cache lại trong chrome.storage.

const AI_MODELS_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 giờ

const AI_PROVIDERS = {
  gemini: {
    id: "gemini",
    name: "Gemini",
    kind: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    modelsEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    keysStorage: "geminiApiKeys",
    activeStorage: "geminiActiveIdx",
    singleKey: "geminiApiKey",
    keyUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza...",
    models: [
      "gemini-3.8-flash",
      "gemini-3.6-flash",
      "gemini-3-flash-preview",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-2.5-pro",
      "gemini-2.5-flash"
    ]
  },
  groq: {
    id: "groq",
    name: "Groq",
    kind: "openai",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    modelsEndpoint: "https://api.groq.com/openai/v1/models",
    keysStorage: "groqApiKeys",
    activeStorage: "groqActiveIdx",
    singleKey: "groqApiKey",
    keyUrl: "https://console.groq.com/keys",
    keyPlaceholder: "gsk_...",
    models: [
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.8-27b",
      "openai/gpt-oss-safeguard-20b"
    ]
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    kind: "openai",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    modelsEndpoint: "https://openrouter.ai/api/v1/models",
    keysStorage: "openrouterApiKeys",
    activeStorage: "openrouterActiveIdx",
    keyUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "sk-or-...",
    models: [
      "minimax/minimax-m3.1-flash:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "nvidia/nemotron-3.5-lightning:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "poolside/laguna-s-2.1:free",
      "xingchen-agi/xing4.0-29b-a4b:free",
      "openrouter/free"
    ]
  },
  nvidia: {
    id: "nvidia",
    name: "NVIDIA NIM",
    kind: "openai",
    endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
    modelsEndpoint: "https://integrate.api.nvidia.com/v1/models",
    keysStorage: "nvidiaApiKeys",
    activeStorage: "nvidiaActiveIdx",
    keyUrl: "https://build.nvidia.com/",
    keyPlaceholder: "nvapi-...",
    models: [
      "deepseek-ai/deepseek-v4-pro",
      "deepseek-ai/deepseek-v4-flash",
      "z-ai/glm-5.3",
      "z-ai/glm-5.3-flash",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia/nemotron-3.5-lightning-30b-a3b",
      "moonshotai/kimi-k3"
    ]
  },
  mistral: {
    id: "mistral",
    name: "Mistral",
    kind: "openai",
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    modelsEndpoint: "https://api.mistral.ai/v1/models",
    keysStorage: "mistralApiKeys",
    activeStorage: "mistralActiveIdx",
    keyUrl: "https://console.mistral.ai/api-keys",
    keyPlaceholder: "...",
    models: [
      "mistral-large-latest",
      "mistral-medium-latest",
      "mistral-small-latest",
      "ministral-14b-latest",
      "ministral-8b-latest",
      "ministral-3b-latest",
      "codestral-latest",
      "zai-glm-5-3"
    ]
  },
  ollama: {
    id: "ollama",
    name: "Ollama Cloud",
    kind: "openai",
    endpoint: "https://ollama.com/v1/chat/completions",
    modelsEndpoint: "https://ollama.com/v1/models",
    keysStorage: "ollamaApiKeys",
    activeStorage: "ollamaActiveIdx",
    keyUrl: "https://ollama.com/settings/keys",
    keyPlaceholder: "...",
    models: [
      "deepseek-v4-pro",
      "deepseek-v4-flash",
      "minimax-m3"
    ]
  },
  zai: {
    id: "zai",
    name: "Z.ai",
    kind: "openai",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    modelsEndpoint: "https://open.bigmodel.cn/api/paas/v4/models",
    keysStorage: "zaiApiKeys",
    activeStorage: "zaiActiveIdx",
    keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    keyPlaceholder: "...",
    models: [
      "glm-4.7-flash"
    ]
  },
  sambanova: {
    id: "sambanova",
    name: "SambaNova",
    kind: "openai",
    endpoint: "https://api.sambanova.ai/v1/chat/completions",
    modelsEndpoint: "https://api.sambanova.ai/v1/models",
    keysStorage: "sambanovaApiKeys",
    activeStorage: "sambanovaActiveIdx",
    keyUrl: "https://cloud.sambanova.ai/apis",
    keyPlaceholder: "...",
    models: [
      "DeepSeek-V3.2",
      "DeepSeek-V3.1",
      "MiniMax-M2.7"
    ]
  },
  opencode: {
    id: "opencode",
    name: "OpenCode Zen",
    kind: "openai",
    endpoint: "https://opencode.ai/inference/openai/v1/chat/completions",
    modelsEndpoint: "https://opencode.ai/inference/v1/models",
    keysStorage: "opencodeApiKeys",
    activeStorage: "opencodeActiveIdx",
    keyUrl: "https://opencode.ai/console",
    keyPlaceholder: "...",
    models: [
      "deepseek-v4.1-flash-free",
      "glm-5.3-flash-free",
      "minimax-m3.1-flash-free",
      "nemotron-3-ultra-free",
      "nemotron-3.5-lightning-free",
      "mimo-v2.6-flash-free",
      "mimo-v2.5-free",
      "big-pickle"
    ]
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    kind: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    modelsEndpoint: "https://api.openai.com/v1/models",
    keysStorage: "openaiApiKeys",
    activeStorage: "openaiActiveIdx",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-...",
    models: [
      "gpt-5.5-2026-04-23",
      "gpt-4.1-mini",
      "gpt-4.1"
    ]
  }
};

const AI_PROVIDER_ORDER = [
  "gemini",
  "groq",
  "openrouter",
  "nvidia",
  "mistral",
  "ollama",
  "zai",
  "sambanova",
  "opencode",
  "openai"
];
const AI_DEFAULT_PROVIDER = "gemini";

function aiProvider(id) {
  return AI_PROVIDERS[id] || AI_PROVIDERS[AI_DEFAULT_PROVIDER];
}

function aiNormalizeKeys(arr, single) {
  const out = [];
  if (Array.isArray(arr)) {
    for (const k of arr) {
      if (typeof k === "string" && k.trim()) out.push(k.trim());
    }
  }
  if (single && typeof single === "string" && single.trim() && !out.includes(single.trim())) {
    out.push(single.trim());
  }
  return out;
}

function aiParseKeys(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function aiMaskKey(key) {
  const k = String(key || "");
  return k.length > 10 ? k.slice(0, 4) + "…" + k.slice(-4) : k;
}

function aiTokenOrder(n, activeIdx) {
  const order = [];
  const start = n ? Math.max(0, Math.min(activeIdx || 0, n - 1)) : 0;
  for (let i = 0; i < n; i++) order.push((start + i) % n);
  return order;
}

// Lấy danh sách model từ response của các API khác nhau.
function aiExtractModels(data, provider) {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
        ? data.models
        : [];

  let ids = list.map((item) => {
    if (typeof item === "string") return item;
    return item?.id || item?.name || item?.model || "";
  });

  if (provider?.kind === "gemini") {
    ids = list
      .filter((m) => (m?.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name || "");
  }

  ids = ids
    .map((id) => String(id).replace(/^models\//, "").trim())
    .filter(Boolean)
    .filter((id) => !/embedding|embed-|rerank|whisper|tts|text-to-speech|moderation|transcribe|ocr|dall-e|gpt-image|sora|computer-use|realtime|audio/i.test(id));

  if (provider?.id === "openrouter") {
    ids = ids.filter((id) => id === "openrouter/free" || id.endsWith(":free"));
  }

  // Bỏ các model đã biết là bản trả phí / không còn trong free tier.
  if (provider?.id === "gemini") {
    ids = ids.filter((id) => !/gemini-4-argon|pro-preview/i.test(id));
  }
  if (provider?.id === "groq") {
    ids = ids.filter((id) => !/^llama-3\.(3-70b-versatile|1-8b-instant)$/i.test(id));
  }
  if (provider?.id === "opencode") {
    ids = ids.filter((id) => id.endsWith("-free") || id === "big-pickle");
  }
  if (provider?.id === "zai") {
    ids = ids.filter((id) => /flash/i.test(id) && !/flashx/i.test(id));
  }

  return [...new Set(ids)];
}

// Model order: đang chọn -> cache mới -> danh sách fallback trong registry.
function aiModelsFor(stored, provider, max) {
  const selectedMap = stored?.selectedModels && typeof stored.selectedModels === "object"
    ? stored.selectedModels
    : {};
  const legacy = provider.id === "gemini" ? stored?.geminiModel : "";
  const selected = String(selectedMap[provider.id] || legacy || "")
    .replace(/^models\//, "")
    .trim();

  const cached = Array.isArray(stored?.modelsCache?.[provider.id]?.models)
    ? stored.modelsCache[provider.id].models
    : [];

  const merged = [selected, ...cached, ...provider.models]
    .map((m) => String(m || "").replace(/^models\//, "").trim())
    .filter((m, i, a) => m && a.indexOf(m) === i);

  return Number.isFinite(max) ? merged.slice(0, max) : merged;
}

function aiStorageKeys() {
  const keys = ["activeProvider", "selectedModels", "modelsCache", "promptPrefix"];
  for (const p of Object.values(AI_PROVIDERS)) {
    keys.push(p.keysStorage, p.activeStorage);
    if (p.singleKey) keys.push(p.singleKey);
  }
  return keys;
}
