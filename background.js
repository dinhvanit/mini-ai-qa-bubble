importScripts("providers.js");

const GEMINI_URL = "https://gemini.google.com/app";

const QTYPE_INSTRUCTIONS = {
  single: "Đây là câu hỏi trắc nghiệm chỉ có 1 đáp án đúng. Yêu cầu trình bày: DÒNG ĐẦU TIÊN chỉ ghi đáp án đúng, đúng định dạng \"Đáp án: X\" (X là chữ cái hoặc nội dung phương án). Từ dòng thứ hai trở đi mới giải thích ngắn gọn vì sao đúng và vì sao các phương án khác sai.",
  multi: "Đây là câu hỏi trắc nghiệm có NHIỀU đáp án đúng. Yêu cầu trình bày: DÒNG ĐẦU TIÊN ghi tất cả đáp án đúng, đúng định dạng \"Đáp án: A, C\". Từ dòng thứ hai trở đi mới giải thích ngắn gọn từng phương án.",
  tf: "Đây là câu hỏi đúng/sai theo từng ý (a, b, c, d...). Yêu cầu trình bày: đầu tiên liệt kê kết quả từng ý trên các dòng riêng (vd: a) Đúng, b) Sai), sau đó giải thích ngắn gọn từng ý.",
  essay: "Đây là câu hỏi tự luận. Trình bày câu trả lời hoàn chỉnh, ngắn gọn, đủ ý chính, có thể gạch đầu dòng các luận điểm."
};

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-bubble" || command === "_execute_action") {
    forwardToTab({ action: "miniToggle" });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.action === "ping") {
    // Dùng để popup phát hiện service worker còn chạy code cũ (chưa Reload extension).
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version, tavily: true });
    return true;
  }
  if (msg.action === "askGemini") {
    askGemini(msg.text, msg.question, msg.qtype).then(sendResponse);
    return true;
  }
  if (msg.action === "openGeminiFull" || msg.action === "openGemini") {
    openFullWindow();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === "tavilySearch") {
    tavilySearchMessage(msg).then(sendResponse).catch((e) =>
      sendResponse({ ok: false, error: String(e.message || e) })
    );
    return true;
  }
});

// Test / tra cứu nhanh từ popup: cho phép truyền key + config chưa lưu.
async function tavilySearchMessage(msg) {
  const query = aiTavilyQuery(msg.query || "", "");
  if (!query) return { ok: false, error: "Chưa có nội dung để tra cứu" };

  const key = String(msg.key || "").trim();
  const cfg = aiTavilyConfig({ [TAVILY_PROVIDER.storage]: msg.config || null });

  if (key) {
    const res = await tavilyRequest(query, key, cfg);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, answer: res.answer, results: res.results, text: tavilyFallbackText(res) };
  }

  const stored = await chrome.storage.local.get(aiStorageKeys());
  const res = await runTavily(stored, query, cfg);
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    answer: res.answer,
    results: res.results,
    text: tavilyFallbackText(res)
  };
}

async function forwardToTab(payload) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !/^https?:/.test(tab.url || "")) return;
  try {
    await chrome.tabs.sendMessage(tab.id, payload);
  } catch (e) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-bubble.js"] });
      setTimeout(() => chrome.tabs.sendMessage(tab.id, payload).catch(() => {}), 300);
    } catch (err) {}
  }
}

// ---------- Provider helpers ----------

function tokenOrder(n, activeIdx) {
  const order = [];
  const start = n ? Math.max(0, Math.min(activeIdx || 0, n - 1)) : 0;
  for (let i = 0; i < n; i++) order.push((start + i) % n);
  return order;
}

function getKeys(stored, p) {
  return aiNormalizeKeys(stored[p.keysStorage], p.singleKey ? stored[p.singleKey] : "");
}

function providerOrder(stored) {
  const ids = AI_PROVIDER_ORDER.filter((id) => getKeys(stored, AI_PROVIDERS[id]).length > 0);
  const active = stored.activeProvider;
  if (active && ids.includes(active)) {
    return [active, ...ids.filter((id) => id !== active)];
  }
  return ids;
}

function cleanModel(model) {
  return String(model || "").replace(/^models\//, "");
}

function modelsFor(stored, p) {
  // 60 model là quá đủ cho fallback; tránh vòng lặp quá dài khi provider trả về hàng trăm model.
  return aiModelsFor(stored, p, 60);
}

async function callProvider(p, prompt, key, model) {
  if (p.kind === "gemini") {
    return fetch(p.endpoint.replace("{model}", cleanModel(model)), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": String(key).trim()
      },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
  }

  return fetch(p.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${String(key).trim()}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2048
    })
  });
}

function extractText(p, data) {
  if (p.kind === "gemini") {
    return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  }
  const content = data?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || "").join("");
  }
  return content || data?.choices?.[0]?.text || "";
}

function isRetryableStatus(status, text) {
  if (status === 429 || status === 503 || status === 502 || status === 500) return true;
  if (/unavailable|overloaded|rate.?limit|too many/i.test(text || "")) return true;
  return false;
}

function isAuthError(status, text) {
  return status === 401 || status === 403 ||
    /invalid.*key|invalid_auth|authentication failed|permission_denied|API_KEY_INVALID|API key not valid/i.test(text || "");
}

async function saveActive(p, idx, key) {
  const patch = { [p.activeStorage]: idx };
  if (p.singleKey) patch[p.singleKey] = key;
  await chrome.storage.local.set(patch).catch(() => {});
}

// ---------- Tavily web search ----------

const TAVILY_TIMEOUT = 12000;
const TAVILY_MAX_CONTEXT = 6000;

function tavilyErrorText(data, status) {
  const detail = data?.detail;
  const msg = typeof detail === "string"
    ? detail
    : detail?.error || detail?.message || data?.error?.message || data?.error || data?.message;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  if (detail) {
    try { return JSON.stringify(detail).slice(0, 200); } catch (e) {}
  }
  return `HTTP ${status}`;
}

function tavilyResults(data) {
  return (Array.isArray(data?.results) ? data.results : [])
    .map((r) => ({
      title: String(r?.title || r?.url || "").replace(/\s+/g, " ").trim(),
      url: String(r?.url || "").trim(),
      content: String(r?.content || "").replace(/\s+/g, " ").trim()
    }))
    .filter((r) => /^https?:\/\//i.test(r.url));
}

async function tavilyRequest(query, key, cfg) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT);
  try {
    const res = await fetch(TAVILY_PROVIDER.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${String(key).trim()}`
      },
      body: JSON.stringify({
        query,
        search_depth: cfg.depth === "basic" ? "basic" : "advanced",
        topic: cfg.topic,
        max_results: cfg.maxResults,
        include_answer: cfg.includeAnswer ? "advanced" : false,
        include_raw_content: false,
        include_images: false
      }),
      signal: controller.signal
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        auth: isAuthError(res.status, JSON.stringify(data || {})),
        error: tavilyErrorText(data, res.status)
      };
    }

    return {
      ok: true,
      answer: String(data?.answer || "").trim(),
      results: tavilyResults(data)
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e.name === "AbortError" ? "hết thời gian chờ" : `lỗi mạng: ${String(e.message || e).slice(0, 120)}`
    };
  } finally {
    clearTimeout(timer);
  }
}

// Xoay vòng token Tavily, lưu lại token chạy được.
async function runTavily(stored, query, cfg) {
  const keys = aiTavilyKeys(stored);
  if (!keys.length) return { ok: false, error: "chưa có Tavily key" };

  const active = Number(stored[TAVILY_PROVIDER.activeStorage] || 0) || 0;
  let lastErr = "";

  for (const idx of tokenOrder(keys.length, active)) {
    const res = await tavilyRequest(query, keys[idx], cfg);
    if (res.ok && (res.answer || res.results.length)) {
      if (idx !== active) {
        await chrome.storage.local.set({ [TAVILY_PROVIDER.activeStorage]: idx }).catch(() => {});
      }
      return { ok: true, answer: res.answer, results: res.results, keyIndex: idx };
    }
    if (res.ok) return { ok: false, error: "không có kết quả" };
    lastErr = `token ${idx + 1}: ${res.error}`;
    if (!res.auth && res.status !== 429) break; // lỗi khác thì đổi token cũng vô ích
  }

  return { ok: false, error: lastErr || "không có kết quả" };
}

function tavilyContext(search) {
  if (!search || !search.ok) return "";
  const parts = [];
  if (search.answer) parts.push(`Tóm tắt nhanh: ${search.answer}`);
  search.results.forEach((r, i) => {
    parts.push(`[${i + 1}] ${r.title}\n${r.url}\n${r.content.slice(0, 600)}`);
  });
  let out = parts.join("\n\n").trim();
  if (out.length > TAVILY_MAX_CONTEXT) out = out.slice(0, TAVILY_MAX_CONTEXT) + "…";
  return out;
}

function tavilySources(search, max) {
  if (!search || !search.ok) return [];
  return search.results.slice(0, max || 3).map((r) => ({ title: r.title, url: r.url }));
}

// Dùng được cả khi không có key LLM: trả thẳng câu tóm tắt / kết quả của Tavily.
function tavilyFallbackText(search) {
  if (!search || !search.ok) return "";
  if (search.answer) return search.answer;
  const rows = search.results.slice(0, 5).map((r, i) =>
    `${i + 1}. ${r.title}\n${r.content.slice(0, 240)}\n${r.url}`
  );
  return rows.length ? `Kết quả tra cứu web:\n\n${rows.join("\n\n")}` : "";
}

async function discoverGeminiModel(apiKey) {
  const res = await fetch(AI_PROVIDERS.gemini.modelsEndpoint, {
    method: "GET",
    headers: { "x-goog-api-key": String(apiKey).trim() }
  });
  if (!res.ok) return null;

  const data = await res.json().catch(() => ({}));
  const models = (data.models || []).filter((m) =>
    (m.supportedGenerationMethods || []).includes("generateContent") &&
    !/embedding/i.test(m.name || "")
  );
  if (!models.length) return null;

  const ranked = models.sort((a, b) => {
    const score = (name) => (/flash/i.test(name) ? 0 : /gemini-2\.5-pro/i.test(name) ? 1 : 2);
    return score(a.name) - score(b.name);
  });
  return cleanModel(ranked[0].name) || null;
}

// ---------- Ask ----------

async function askGemini(selectionText, question, qtype) {
  const stored = await chrome.storage.local.get(aiStorageKeys());
  const order = providerOrder(stored);

  // Tra cứu web 1 lần cho cả câu hỏi, dùng chung cho mọi provider.
  const searchCfg = aiTavilyConfig(stored);
  let search = null;
  if (searchCfg.enabled && aiTavilyKeys(stored).length) {
    const query = aiTavilyQuery(selectionText, question);
    if (query) search = await runTavily(stored, query, searchCfg);
  }
  const sources = tavilySources(search, 3);
  const searchNote = search && !search.ok ? ` (Tavily lỗi: ${search.error})` : "";

  if (!order.length) {
    const fallback = tavilyFallbackText(search);
    if (fallback) {
      return {
        ok: true,
        text: fallback,
        provider: "tavily",
        model: "Tavily · web search",
        sources
      };
    }
    return {
      ok: false,
      needKey: true,
      error: `Chưa có API key. Bấm icon extension → thêm token LLM hoặc Tavily key.${searchNote}`
    };
  }

  const typeInstruction = QTYPE_INSTRUCTIONS[qtype] || QTYPE_INSTRUCTIONS.single;
  const prefix = String(stored.promptPrefix || "").trim();
  const baseTask = question
    ? `Ngữ cảnh:\n${selectionText}\n\nYêu cầu: ${question}`
    : `Nội dung câu hỏi:\n${selectionText}`;
  const webContext = tavilyContext(search);
  const webBlock = webContext
    ? `\n\nKết quả tra cứu web (Tavily):\n${webContext}\n\nHãy dùng thông tin trên khi liên quan, đối chiếu với kiến thức của bạn; nếu mâu thuẫn thì ưu tiên nguồn đáng tin và ghi rõ nguồn dạng [1], [2] ở cuối câu trả lời.`
    : "";
  const prompt = `${prefix ? prefix + "\n\n" : ""}${typeInstruction}\n\n${baseTask}${webBlock}\n\nTrả lời bằng tiếng Việt.`;

  let lastErr = "";

  for (const pid of order) {
    const p = AI_PROVIDERS[pid];
    const keys = getKeys(stored, p);
    if (!keys.length) continue;

    const activeIdx = Number(stored[p.activeStorage] || 0) || 0;
    const models = modelsFor(stored, p);

    for (const ki of tokenOrder(keys.length, activeIdx)) {
      const key = keys[ki];
      let keyBroken = false;

      for (const model of models) {
        let res;
        try {
          res = await callProvider(p, prompt, key, model);
        } catch (e) {
          lastErr = `${p.name} token ${ki + 1} · ${model}: lỗi mạng ${String(e.message || e).slice(0, 150)}`;
          break; // thử token khác
        }

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const text = extractText(p, data);
          if (!text) {
            lastErr = `${p.name} · ${model}: phản hồi rỗng`;
            continue;
          }
          await saveActive(p, ki, key);
          return {
            ok: true,
            text,
            provider: p.id,
            model: `${p.name} · ${model}`,
            sources
          };
        }

        const body = await res.text().catch(() => "");
        lastErr = `${p.name} token ${ki + 1} · ${model}: HTTP ${res.status} ${body.slice(0, 200)}`;

        if (isAuthError(res.status, body)) { keyBroken = true; break; }
        if (isRetryableStatus(res.status, body)) break; // quota/unavailable -> token khác
        if (res.status === 404) continue;               // model không tồn tại -> model khác
        // lỗi khác -> thử model kế tiếp
      }

      if (keyBroken) continue;
    }
  }

  // Gemini: nếu model trong danh sách đều fail, tự dò model đang hoạt động.
  if (order.includes("gemini")) {
    const p = AI_PROVIDERS.gemini;
    const keys = getKeys(stored, p);
    const activeIdx = Number(stored[p.activeStorage] || 0) || 0;

    for (const ki of tokenOrder(keys.length, activeIdx)) {
      const key = keys[ki];
      const found = await discoverGeminiModel(key).catch(() => null);
      if (!found) continue;

      try {
        const res = await callProvider(p, prompt, key, found);
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const text = extractText(p, data);
          if (text) {
            await saveActive(p, ki, key);
            return { ok: true, text, provider: p.id, model: `${p.name} · ${found}`, sources };
          }
        }
      } catch (e) {
        lastErr = `${p.name} token ${ki + 1} · ${found}: lỗi mạng ${String(e.message || e).slice(0, 150)}`;
      }
    }
  }

  // LLM đều fail nhưng Tavily có kết quả -> vẫn trả về thứ dùng được.
  const fallback = tavilyFallbackText(search);
  if (fallback) {
    return { ok: true, text: fallback, provider: "tavily", model: "Tavily · web search", sources };
  }

  return { ok: false, error: `Tất cả provider/token/model đều thất bại: ${lastErr.slice(0, 300)}${searchNote}` };
}

// ---------- Gemini full window ----------

async function openFullWindow() {
  try {
    const data = await chrome.storage.local.get("geminiWindowId");
    if (data.geminiWindowId) {
      try {
        await chrome.windows.update(data.geminiWindowId, { focused: true });
        return;
      } catch (e) {}
    }
  } catch (e) {}

  const win = await chrome.windows.create({ url: GEMINI_URL, type: "popup", width: 380, height: 600 });
  if (win?.id) await chrome.storage.local.set({ geminiWindowId: win.id });
}

chrome.windows.onRemoved.addListener(async (id) => {
  const data = await chrome.storage.local.get("geminiWindowId");
  if (data.geminiWindowId === id) await chrome.storage.local.remove("geminiWindowId");
});

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({ id: "ask-gemini-selection", title: '○ Hỏi: "%s"', contexts: ["selection"] });
  } catch (e) {}
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "ask-gemini-selection" && tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "askSelection", text: info.selectionText });
    } catch (e) {}
  }
});
