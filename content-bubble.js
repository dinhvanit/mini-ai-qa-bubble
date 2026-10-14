// Mini Gemini v2.3 - content: panel mini tại chỗ, không popup to.
// - Bôi đen -> nút "✨ Hỏi" ngay tại chỗ bôi.
// - Bấm -> panel 320px hiện câu trả lời ngay dưới, có ô hỏi thêm.
// - Bubble ✨ -> mở/đóng hộp chat mini (không mở cửa sổ lớn nữa).
(function () {
  if (document.getElementById("mini-gemini-bubble-container")) return;

  function init() {
    if (!document.body) return setTimeout(init, 100);
    if (document.getElementById("mini-gemini-bubble-container")) return;

    const css = (el, s) => (el.style.cssText = s);

    // ---- Bubble ----
    const container = document.createElement("div");
    container.id = "mini-gemini-bubble-container";
    css(container, "position:fixed;bottom:20px;right:20px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:10px;font-family:sans-serif;pointer-events:none;");
    const bubble = document.createElement("div");
    bubble.textContent = "✨";
    bubble.title = "Mini Gemini (Alt+G)";
    css(bubble, "width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#1a73e8,#8ab4f8);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(26,115,232,.5);pointer-events:auto;font-size:22px;border:2px solid #fff;user-select:none;");
    container.appendChild(bubble);
    document.body.appendChild(container);

    // ---- Hộp chat mini (mặc định ẩn) ----
    const chat = document.createElement("div");
    chat.id = "mini-gemini-chat";
    css(chat, "display:none;width:320px;max-height:420px;pointer-events:auto;background:#fff;border:1px solid #dadce0;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.25);overflow:hidden;font-family:sans-serif;");
    chat.innerHTML =
      '<div style="padding:10px 12px;background:#1a73e8;color:#fff;font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:center;"><span>✨ Mini Gemini</span><span id="mg-close" style="cursor:pointer;">✕</span></div>' +
      '<div id="mg-body" style="padding:10px 12px;font-size:13px;line-height:1.5;max-height:280px;overflow:auto;color:#202124;">Bôi đen text bất kỳ → bấm ✨ Hỏi.<br>Hoặc gõ câu hỏi bên dưới.</div>' +
      '<div style="display:flex;gap:6px;padding:10px;border-top:1px solid #eee;"><input id="mg-input" placeholder="Hỏi gì đó..." style="flex:1;border:1px solid #dadce0;border-radius:8px;padding:7px 9px;font-size:13px;outline:none;"><button id="mg-send" style="background:#1a73e8;color:#fff;border:none;border-radius:8px;padding:0 12px;cursor:pointer;font-size:14px;">➤</button></div>';
    container.appendChild(chat);

    const body = () => chat.querySelector("#mg-body");
    const input = () => chat.querySelector("#mg-input");
    const toggleChat = (force) => {
      const show = typeof force === "boolean" ? force : chat.style.display === "none";
      chat.style.display = show ? "block" : "none";
      if (show) setTimeout(() => input()?.focus(), 50);
    };
    bubble.addEventListener("click", () => { if (!dragMoved) toggleChat(); });
    chat.querySelector("#mg-close").addEventListener("click", () => toggleChat(false));
    chat.querySelector("#mg-send").addEventListener("click", () => sendAsk("", input().value));
    input().addEventListener("keydown", (e) => { if (e.key === "Enter") sendAsk("", input().value); });

    async function sendAsk(selectionText, question) {
      const q = (question || "").trim();
      if (!q && !selectionText) return;
      toggleChat(true);
      const b = body();
      b.innerHTML += `<div style="margin-top:8px;padding:8px;border-radius:8px;background:#e8f0fe;"><b>Bạn:</b> ${escapeHtml(q || ("Giải thích: " + selectionText.slice(0, 120)))} </div><div class="mg-wait" style="color:#888;">✨ đang nghĩ...</div>`;
      b.scrollTop = b.scrollHeight;
      input().value = "";
      let res;
      try {
        res = await chrome.runtime.sendMessage({ action: "askGemini", text: selectionText || q, question: selectionText ? q : "" });
      } catch (e) {
        res = { ok: false, error: "Extension vừa reload, hãy Ctrl+R trang này rồi thử lại." };
      }
      b.querySelector(".mg-wait")?.remove();
      if (res?.ok) {
        b.innerHTML += `<div style="margin-top:8px;padding:8px;border-radius:8px;background:#f1f3f4;white-space:pre-wrap;">${escapeHtml(res.text)}</div>`;
      } else if (res?.needKey) {
        b.innerHTML += `<div style="margin-top:8px;padding:8px;border-radius:8px;background:#fce8e6;color:#a50e0e;">${escapeHtml(res.error)}</div>`;
      } else {
        b.innerHTML += `<div style="margin-top:8px;color:#d93025;">Lỗi: ${escapeHtml(res?.error || "không rõ")}</div>`;
      }
      b.scrollTop = b.scrollHeight;
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // ---- Nút nổi khi bôi đen + panel kết quả tại chỗ ----
    const askBtn = document.createElement("div");
    askBtn.textContent = "✨ Hỏi";
    css(askBtn, "position:fixed;display:none;z-index:2147483647;background:#1a73e8;color:#fff;font-size:12px;font-weight:700;padding:6px 10px;border-radius:16px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);user-select:none;");
    document.body.appendChild(askBtn);

    const mini = document.createElement("div");
    mini.id = "mini-gemini-mini";
    css(mini, "position:fixed;display:none;z-index:2147483647;width:300px;max-height:260px;overflow:auto;background:#fff;border:1px solid #dadce0;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.25);padding:10px 12px;font-size:13px;line-height:1.5;color:#202124;font-family:sans-serif;");
    document.body.appendChild(mini);

    let currentSelection = "";
    let miniRect = null;
    askBtn.addEventListener("mousedown", (e) => e.preventDefault());
    askBtn.addEventListener("click", () => {
      const t = currentSelection;
      const r = miniRect;
      askBtn.style.display = "none";
      if (t) showMini(t, r, "");
    });

    function showMini(text, rect, question) {
      mini.style.left = Math.min(rect ? rect.left : 100, window.innerWidth - 320) + "px";
      mini.style.top = ((rect ? rect.bottom : 100) + 8) + "px";
      mini.innerHTML = `<div style="color:#5f6368;font-size:12px;margin-bottom:6px;">“${escapeHtml(text.slice(0, 120))}${text.length > 120 ? "…" : ""}”</div><div style="color:#888;">✨ đang nghĩ...</div>`;
      mini.style.display = "block";
      chrome.runtime.sendMessage({ action: "askGemini", text, question }).then((res) => {
        if (res?.ok) {
          mini.innerHTML =
            `<div style="color:#5f6368;font-size:12px;margin-bottom:6px;">“${escapeHtml(text.slice(0, 120))}${text.length > 120 ? "…" : ""}”</div>` +
            `<div style="white-space:pre-wrap;">${escapeHtml(res.text)}</div>` +
            `<div style="margin-top:8px;display:flex;gap:6px;"><button id="mg-copy" style="flex:1;border:1px solid #dadce0;background:#fff;border-radius:8px;padding:5px;cursor:pointer;font-size:12px;">📋 Copy</button><button id="mg-more" style="flex:1;background:#1a73e8;color:#fff;border:none;border-radius:8px;padding:5px;cursor:pointer;font-size:12px;">💬 Hỏi thêm</button></div>`;
          mini.querySelector("#mg-copy").onclick = () => navigator.clipboard.writeText(res.text).catch(() => {});
          mini.querySelector("#mg-more").onclick = () => { mini.style.display = "none"; toggleChat(true); sendAsk(text, ""); };
        } else {
          mini.innerHTML = `<div style="color:#d93025;">${escapeHtml(res?.error || "Lỗi không rõ")}</div><div style="font-size:12px;color:#5f6368;margin-top:4px;">Bấm icon extension để nhập API key.</div>`;
        }
      }).catch(() => {
        mini.innerHTML = `<div style="color:#d93025;">Extension vừa reload — hãy Ctrl+R trang rồi thử lại.</div>`;
      });
    }

    document.addEventListener("mouseup", (e) => {
      if (e.target === askBtn || e.target === mini || mini.contains(e.target)) return;
      setTimeout(() => {
        try {
          const sel = window.getSelection();
          const text = sel ? sel.toString().trim() : "";
          if (text && text.length > 1) {
            currentSelection = text.slice(0, 2000);
            miniRect = sel.getRangeAt(0).getBoundingClientRect();
            askBtn.style.left = Math.min(miniRect.left, window.innerWidth - 100) + "px";
            askBtn.style.top = miniRect.bottom + 6 + "px";
            askBtn.style.display = "block";
          } else {
            askBtn.style.display = "none";
          }
        } catch (err) { askBtn.style.display = "none"; }
      }, 10);
    });
    document.addEventListener("scroll", () => { askBtn.style.display = "none"; mini.style.display = "none"; }, true);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { askBtn.style.display = "none"; mini.style.display = "none"; }
      const key = (e.key || "").toLowerCase();
      if (((e.ctrlKey || e.metaKey) && e.shiftKey && key === "g") || (e.altKey && key === "g")) {
        e.preventDefault();
        const sel = window.getSelection();
        const t = sel ? sel.toString().trim() : "";
        if (t) {
          try {
            const r = sel.getRangeAt(0).getBoundingClientRect();
            showMini(t.slice(0, 2000), r, "");
          } catch (err) { toggleChat(); }
        } else toggleChat();
      }
    });

    chrome.runtime.onMessage.addListener((req) => {
      if (!req) return;
      if (req.action === "miniToggle") toggleChat();
      if (req.action === "askSelection" && req.text) {
        try {
          const sel = window.getSelection();
          const r = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
          showMini(req.text.slice(0, 2000), r, "");
        } catch (e) {}
      }
      // tương thích bản cũ
      if (req.action === "toggleBubble" || req.action === "openGemini") toggleChat(true);
    });

    // Kéo thả bubble
    let dragMoved = false, sx, sy, bx, by, dragging = false;
    bubble.onmousedown = (e) => {
      dragMoved = false; dragging = true; sx = e.clientX; sy = e.clientY;
      const cs = window.getComputedStyle(container);
      bx = parseInt(cs.right) || 20; by = parseInt(cs.bottom) || 20;
      document.onmousemove = (ev) => {
        if (!dragging) return;
        const dx = sx - ev.clientX, dy = sy - ev.clientY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          dragMoved = true;
          container.style.right = bx + dx + "px";
          container.style.bottom = by + dy + "px";
        }
      };
      document.onmouseup = () => { dragging = false; document.onmousemove = null; document.onmouseup = null; setTimeout(() => (dragMoved = false), 50); };
      e.preventDefault();
    };

    console.log("[MiniGemini] mini ready.");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  init();
})();
