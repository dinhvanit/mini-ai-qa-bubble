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
  if (msg.action === "askGemini") {
    askGemini(msg.text, msg.question, msg.qtype).then(sendResponse);
    return true;
  }
  if (msg.action === "openGeminiFull" || msg.action === "openGemini") {
    openFullWindow();
    sendResponse({ ok: true });
    return true;
  }
});

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

  if (!order.length) {
    return { ok: false, needKey: true, error: "Chưa có API key. Bấm icon extension → chọn provider và thêm token." };
  }

  const typeInstruction = QTYPE_INSTRUCTIONS[qtype] || QTYPE_INSTRUCTIONS.single;
  const prefix = String(stored.promptPrefix || "").trim();
  const baseTask = question
    ? `Ngữ cảnh:\n${selectionText}\n\nYêu cầu: ${question}`
    : `Nội dung câu hỏi:\n${selectionText}`;
  const prompt = `${prefix ? prefix + "\n\n" : ""}${typeInstruction}\n\n${baseTask}\n\nTrả lời bằng tiếng Việt.`;

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
            model: `${p.name} · ${model}`
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
            return { ok: true, text, provider: p.id, model: `${p.name} · ${found}` };
          }
        }
      } catch (e) {
        lastErr = `${p.name} token ${ki + 1} · ${found}: lỗi mạng ${String(e.message || e).slice(0, 150)}`;
      }
    }
  }

  return { ok: false, error: `Tất cả provider/token/model đều thất bại: ${lastErr.slice(0, 300)}` };
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
