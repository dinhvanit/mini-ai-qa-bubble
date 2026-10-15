// Mini Gemini v2.3 - background: gọi Gemini API, trả về panel mini.
// Không còn mở popup to mặc định. Chỉ mở bản full khi user bấm
// "Mở Gemini bản full" trong popup (action openGeminiFull).

const GEMINI_URL = "https://gemini.google.com/app";
// Model thực tế do popup.js dò qua GET /v1beta/models và lưu vào storage.
// FALLBACK_MODELS chỉ dùng khi chưa có model đã lưu hoặc model cũ bị xóa.
// (2.x đã bị Google tắt với user mới -> chuyển sang 3.x)
const FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"];
// Model cũ đã chết, gặp trong storage thì bỏ qua để khỏi gọi 404 vô ích.
const DEAD_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-1.5-flash", "gemini-1.5-flash-8b"];

// NOTE: đã khai báo default_popup nên click icon mở popup.html,
// chrome.action.onClicked không chạy trong cấu hình này.

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-bubble" || command === "_execute_action") {
    forwardToTab({ action: "miniToggle" });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.action === "askGemini") {
    askGemini(msg.text, msg.question, msg.qtype).then(sendResponse);
    return true; // async
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

async function callGemini(prompt, apiKey, model) {
  const cleanKey = apiKey.trim();
  const cleanModel = String(model || "").replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent`;
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": cleanKey
    },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
}

async function discoverModel(apiKey) {
  const listRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
    method: "GET",
    headers: { "x-goog-api-key": apiKey.trim() }
  });
  if (!listRes.ok) {
    return { ok: false, error: `ListModels HTTP ${listRes.status}: ${(await listRes.text()).slice(0, 200)}` };
  }
  const data = await listRes.json();
  const models = (data.models || []).filter((m) =>
    (m.supportedGenerationMethods || []).includes("generateContent") &&
    !/embedding/i.test(m.name || "")
  );
  if (!models.length) return { ok: false, error: "Không có model generateContent nào." };
  const pick =
    models.find((m) => /flash/i.test(m.name)) ||
    models[0];
  return { ok: true, model: pick.name.replace(/^models\//, "") };
}

const QTYPE_INSTRUCTIONS = {
  single: "Đây là câu hỏi trắc nghiệm chỉ có 1 đáp án đúng. Yêu cầu trình bày: DÒNG ĐẦU TIÊN chỉ ghi đáp án đúng, đúng định dạng \"Đáp án: X\" (X là chữ cái hoặc nội dung phương án). Từ dòng thứ hai trở đi mới giải thích ngắn gọn vì sao đúng và vì sao các phương án khác sai.",
  multi: "Đây là câu hỏi trắc nghiệm có NHIỀU đáp án đúng. Yêu cầu trình bày: DÒNG ĐẦU TIÊN ghi tất cả đáp án đúng, đúng định dạng \"Đáp án: A, C\". Từ dòng thứ hai trở đi mới giải thích ngắn gọn từng phương án.",
  tf: "Đây là câu hỏi đúng/sai theo từng ý (a, b, c, d...). Yêu cầu trình bày: đầu tiên liệt kê kết quả từng ý trên các dòng riêng (vd: a) Đúng, b) Sai), sau đó giải thích ngắn gọn từng ý.",
  essay: "Đây là câu hỏi tự luận. Trình bày câu trả lời hoàn chỉnh, ngắn gọn, đủ ý chính, có thể gạch đầu dòng các luận điểm."
};

async function askGemini(selectionText, question, qtype) {
  const stored = await chrome.storage.local.get(["geminiApiKey", "geminiModel"]);
  const apiKey = (stored.geminiApiKey || "").trim();
  if (!apiKey) {
    return { ok: false, needKey: true, error: "Chưa có API key. Bấm icon extension → dán key mới (key cũ đã lộ, nên tạo lại)." };
  }
  const typeInstruction = QTYPE_INSTRUCTIONS[qtype] || QTYPE_INSTRUCTIONS.single;
  const baseTask = question
    ? `Ngữ cảnh:\n${selectionText}\n\nYêu cầu: ${question}`
    : `Nội dung câu hỏi:\n${selectionText}`;
  const prompt = `${typeInstruction}\n\n${baseTask}\n\nTrả lời bằng tiếng Việt.`;
  try {
    // Model cũ đã lưu (2.x/1.5) luôn 404 với user mới -> bỏ qua, ưu tiên 3.x
    const savedModel = stored.geminiModel && !DEAD_MODELS.includes(String(stored.geminiModel).replace(/^models\//, ""))
      ? String(stored.geminiModel).replace(/^models\//, "")
      : null;
    if (stored.geminiModel && !savedModel) {
      chrome.storage.local.remove("geminiModel").catch(() => {});
    }
    const modelOrder = [
      ...(savedModel ? [savedModel] : []),
      ...FALLBACK_MODELS
    ].filter((model, index, arr) => arr.indexOf(model) === index);
    let lastErr = "";
    for (const model of modelOrder) {
      let res;
      try {
        res = await callGemini(prompt, apiKey, model);
      } catch (e) {
        lastErr = `model=${model}: lỗi mạng ${String(e.message || e).slice(0, 150)}`;
        continue; // lỗi mạng 1 model không chặn thử model khác
      }
      if (res.ok) {
        await chrome.storage.local.set({ geminiModel: model }).catch(() => {});
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "(rỗng)";
        return { ok: true, text };
      }
      const t = await res.text();
      lastErr = `model=${model}: HTTP ${res.status} ${t.slice(0, 200)}`;
      // 400 key sai / 403 quyền project -> dừng ngay, thử model khác vô ích
      if (res.status === 400 || /API_KEY_INVALID|API key not valid/i.test(t)) {
        return { ok: false, error: `Lỗi key (400): kiểm tra key và cơ chế x-goog-api-key. ${lastErr.slice(0, 300)}` };
      }
      if (res.status === 403 || /PERMISSION_DENIED/i.test(t)) {
        return { ok: false, error: `Lỗi quyền (403): kiểm tra API enable + project. ${lastErr.slice(0, 300)}` };
      }
      // 429 quota -> dừng, không spam thêm model
      if (res.status === 429) {
        return { ok: false, error: "Gemini API đã đạt giới hạn quota/tốc độ (429). Kiểm tra Usage và Rate Limit trong AI Studio." };
      }
      // 404 model chết -> thử model kế tiếp
      if (res.status === 404) continue;
      return { ok: false, error: `Gemini API lỗi: ${lastErr.slice(0, 500)}` };
    }
    // Model lưu sẵn đều 404 -> dò lại danh sách model rồi thử 1 lần
    const found = await discoverModel(apiKey);
    if (found.ok) {
      const res = await callGemini(prompt, apiKey, found.model);
      if (res.ok) {
        await chrome.storage.local.set({ geminiModel: found.model });
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "(rỗng)";
        return { ok: true, text };
      }
      lastErr = `model=${found.model}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
    }
    return { ok: false, error: `Gemini API lỗi: ${lastErr.slice(0, 300)}` };
  } catch (e) {
    return { ok: false, error: `Không thể kết nối Gemini API: ${String(e.message || e)}` };
  }
}

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
  // Nhỏ hơn trước (380x600 thay vì 430x720), chỉ dùng khi cần
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
