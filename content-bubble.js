// Mini Gemini v2.3 - content: panel mini tại chỗ, không popup to.
// - Bôi đen -> nút "○ Hỏi" ngay tại chỗ bôi.
// - Bấm -> panel 320px hiện câu trả lời ngay dưới, có ô hỏi thêm.
// - Bubble ○ -> mở/đóng hộp chat mini (không mở cửa sổ lớn nữa).
(function () {
  if (document.getElementById("mini-gemini-bubble-container")) return;

  function init() {
    if (!document.body) return setTimeout(init, 100);
    if (document.getElementById("mini-gemini-bubble-container")) return;

    const css = (el, s) => (el.style.cssText = s);

    // ---- Dạng câu hỏi: single (1 đáp án) / multi / tf (đúng-sai) / essay ----
    const QTYPES = {
      single: "1 đáp án",
      multi: "Nhiều đáp án",
      tf: "Đúng/Sai",
      essay: "Tự luận"
    };
    let quizType = "single";
    try {
      chrome.storage.local.get("quizType").then((d) => {
        if (d.quizType && QTYPES[d.quizType]) {
          quizType = d.quizType;
          paintTypeRows();
        }
      }).catch(() => {});
    } catch (e) {}
    function setQuizType(t) {
      if (!QTYPES[t]) return;
      quizType = t;
      try { chrome.storage.local.set({ quizType: t }).catch(() => {}); } catch (e) {}
      paintTypeRows();
    }
    function typeRowHTML() {
      return `<div class="mg-types" style="display:flex;gap:4px;padding:8px 10px 0;flex-wrap:wrap;">` +
        Object.keys(QTYPES).map((k) =>
          `<button data-qtype="${k}" style="flex:1;border:1px solid #dadce0;border-radius:8px;padding:4px 2px;cursor:pointer;font-size:11px;white-space:nowrap;">${QTYPES[k]}</button>`
        ).join("") + `</div>`;
    }
    function paintTypeRows() {
      document.querySelectorAll("#mini-gemini-bubble-container .mg-types button, #mini-gemini-mini .mg-types button").forEach((btn) => {
        const active = btn.getAttribute("data-qtype") === quizType;
        btn.style.background = active ? "rgba(218,220,224,0.9)" : "#fff";
        btn.style.color = active ? "#202124" : "#80868b";
        btn.style.fontWeight = active ? "700" : "400";
      });
    }
    function bindTypeRow(root, onPick) {
      root.querySelectorAll(".mg-types button").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          setQuizType(btn.getAttribute("data-qtype"));
          if (onPick) onPick();
        });
      });
      paintTypeRows();
    }
    // 1 đáp án / nhiều / đúng-sai: dòng đầu là đáp án -> tách ra cho nổi bật
    function renderAnswerHTML(text, qtype) {
      const safe = escapeHtml(text);
      if (qtype === "essay") {
        return `<div style="white-space:pre-wrap;">${safe}</div>`;
      }
      const lines = String(text).split("\n");
      let idx = lines.findIndex((l) => l.trim());
      if (idx < 0) return `<div style="white-space:pre-wrap;">${safe}</div>`;
      const first = escapeHtml(lines[idx].trim());
      const rest = escapeHtml([...lines.slice(0, idx), ...lines.slice(idx + 1)].join("\n").trim());
      return `<div style="padding:8px;border-radius:8px;background:#e8eaed;font-weight:700;font-size:14px;color:#202124;">${first}</div>` +
        (rest ? `<div style="margin-top:6px;white-space:pre-wrap;">${rest}</div>` : "");
    }

    // ---- Bubble ----
    const container = document.createElement("div");
    container.id = "mini-gemini-bubble-container";
    css(container, "position:fixed;bottom:20px;right:20px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:10px;font-family:sans-serif;pointer-events:none;");
    const bubble = document.createElement("div");
    bubble.textContent = "○";
    bubble.title = "Mini (Alt+G)";
    css(bubble, "width:34px;height:34px;border-radius:50%;background:rgba(241,243,244,0.7);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.12);pointer-events:auto;font-size:15px;border:1px solid rgba(218,220,224,0.9);user-select:none;color:#9aa0a6;");
    container.appendChild(bubble);
    document.body.appendChild(container);

    // ---- Hộp chat mini (mặc định ẩn) ----
    const chat = document.createElement("div");
    chat.id = "mini-gemini-chat";
    css(chat, "display:none;width:320px;max-height:420px;pointer-events:auto;background:#fff;border:1px solid #dadce0;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.25);overflow:hidden;font-family:sans-serif;overscroll-behavior:contain;");
    chat.innerHTML =
      '<div style="padding:10px 12px;background:rgba(241,243,244,0.95);color:#9aa0a6;font-size:13px;font-weight:500;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;"><span>○ Mini</span><span id="mg-close" style="cursor:pointer;">✕</span></div>' +
      typeRowHTML() +
      '<div id="mg-body" style="padding:10px 12px;font-size:13px;line-height:1.5;max-height:260px;overflow-y:auto;overscroll-behavior:contain;color:#5f6368;">Bôi đen text bất kỳ → bấm ○ Hỏi.<br>Hoặc gõ câu hỏi bên dưới.</div>' +
      '<div style="display:flex;gap:6px;padding:10px;border-top:1px solid #eee;"><input id="mg-input" placeholder="Hỏi gì đó..." style="flex:1;border:1px solid #dadce0;border-radius:8px;padding:7px 9px;font-size:13px;outline:none;"><button id="mg-send" style="background:rgba(218,220,224,0.8);color:#5f6368;border:none;border-radius:8px;padding:0 12px;cursor:pointer;font-size:14px;">➤</button></div>';
    container.appendChild(chat);

    const body = () => chat.querySelector("#mg-body");
    const input = () => chat.querySelector("#mg-input");
    // Kho đáp án + 1 listener duy nhất (innerHTML += làm mất handler lẻ nên dùng ủy quyền)
    const answerStore = [];
    chat.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest(".mg-copy-answer") : null;
      if (!btn) return;
      const t = answerStore[Number(btn.getAttribute("data-idx"))];
      if (t == null) return;
      navigator.clipboard.writeText(t).then(() => {
        const old = btn.textContent;
        btn.textContent = "Đã copy";
        setTimeout(() => { btn.textContent = old; }, 1200);
      }).catch(() => {});
    });
    const toggleChat = (force) => {
      const show = typeof force === "boolean" ? force : chat.style.display === "none";
      chat.style.display = show ? "block" : "none";
      if (show) setTimeout(() => input()?.focus(), 50);
    };
    bubble.addEventListener("click", () => { if (!dragMoved) toggleChat(); });
    chat.querySelector("#mg-close").addEventListener("click", () => toggleChat(false));
    bindTypeRow(chat);
    chat.querySelector("#mg-send").addEventListener("click", () => sendAsk("", input().value));
    input().addEventListener("keydown", (e) => { if (e.key === "Enter") sendAsk("", input().value); });

    async function sendAsk(selectionText, question) {
      const q = (question || "").trim();
      if (!q && !selectionText) return;
      toggleChat(true);
      const b = body();
      const qt = quizType;
      b.innerHTML += `<div style="margin-top:8px;padding:8px;border-radius:8px;background:#f1f3f4;"><b>Bạn:</b> <span style="font-size:11px;color:#9aa0a6;">[${QTYPES[qt]}]</span> ${escapeHtml(q || ("Giải thích: " + selectionText.slice(0, 120)))} </div><div class="mg-wait" style="color:#9aa0a6;">○ đang nghĩ...</div>`;
      b.scrollTop = b.scrollHeight;
      input().value = "";
      let res;
      try {
        res = await chrome.runtime.sendMessage({ action: "askGemini", text: selectionText || q, question: selectionText ? q : "", qtype: qt });
      } catch (e) {
        res = { ok: false, error: "Extension vừa reload, hãy Ctrl+R trang này rồi thử lại." };
      }
      b.querySelector(".mg-wait")?.remove();
      if (res?.ok) {
        const ansIdx = answerStore.length;
        answerStore.push(res.text);
        b.innerHTML += `<div style="margin-top:8px;padding:8px;border-radius:8px;background:#f1f3f4;">${renderAnswerHTML(res.text, qt)}<div style="margin-top:6px;text-align:right;"><button class="mg-copy-answer" data-idx="${ansIdx}" style="border:1px solid #dadce0;background:#fff;border-radius:8px;padding:3px 10px;cursor:pointer;font-size:11px;color:#80868b;">Copy đáp án</button></div></div>`;
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
    askBtn.textContent = "○ Hỏi";
    css(askBtn, "position:fixed;display:none;z-index:2147483647;background:rgba(241,243,244,0.92);color:#80868b;font-size:12px;font-weight:500;padding:6px 10px;border:1px solid rgba(218,220,224,0.9);border-radius:16px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.12);user-select:none;");
    document.body.appendChild(askBtn);

    const mini = document.createElement("div");
    mini.id = "mini-gemini-mini";
    css(mini, "position:fixed;display:none;z-index:2147483647;width:300px;max-height:260px;overflow-y:auto;overscroll-behavior:contain;background:#fff;border:1px solid #dadce0;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.25);padding:10px 12px;font-size:13px;line-height:1.5;color:#202124;font-family:sans-serif;");
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
      const qt = quizType;
      mini.innerHTML =
        typeRowHTML() +
        `<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;color:#5f6368;font-size:12px;margin:6px 0;"><span>“${escapeHtml(text.slice(0, 120))}${text.length > 120 ? "…" : ""}”</span><span class="mg-mini-close" style="cursor:pointer;color:#9aa0a6;">✕</span></div><div style="color:#9aa0a6;">○ đang nghĩ...</div>`;
      mini.style.display = "block";
      bindTypeRow(mini, () => showMini(text, rect, question));
      mini.querySelector(".mg-mini-close").onclick = () => { mini.style.display = "none"; };
      // sendMessage NÉM ĐỒNG BỘ khi extension vừa Reload (context invalidated),
      // .catch() không bắt được nên phải try/catch bao ngoài.
      let req;
      try {
        req = chrome.runtime.sendMessage({ action: "askGemini", text, question, qtype: qt });
      } catch (e) {
        mini.innerHTML = `<div style="color:#d93025;">Extension vừa Reload — hãy Ctrl+R trang này rồi hỏi lại.</div>`;
        return;
      }
      Promise.resolve(req).then((res) => {
        if (res?.ok) {
          mini.innerHTML =
            typeRowHTML() +
            `<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;color:#5f6368;font-size:12px;margin:6px 0;"><span>“${escapeHtml(text.slice(0, 120))}${text.length > 120 ? "…" : ""}”</span><span class="mg-mini-close" style="cursor:pointer;color:#9aa0a6;">✕</span></div>` +
            renderAnswerHTML(res.text, qt) +
            `<div style="margin-top:8px;display:flex;gap:6px;"><button id="mg-copy" style="flex:1;border:1px solid #dadce0;background:#fff;border-radius:8px;padding:5px;cursor:pointer;font-size:12px;">Copy</button><button id="mg-more" style="flex:1;background:rgba(218,220,224,0.8);color:#5f6368;border:none;border-radius:8px;padding:5px;cursor:pointer;font-size:12px;">Hỏi thêm</button></div>`;
          bindTypeRow(mini, () => showMini(text, rect, question));
          mini.querySelector(".mg-mini-close").onclick = () => { mini.style.display = "none"; };
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
      // Click/kéo thanh cuộn trong panel kết quả thì không đụng tới nút Hỏi
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
    // Cuộn TRONG panel/chat thì kệ (để user đọc tiếp); chỉ ẩn khi cuộn TRANG NGOÀI
    // vì lúc đó vị trí ghim theo đoạn bôi đen đã lệch.
    function insideUI(target) {
      return (target && (mini.contains(target) || container.contains(target))) || false;
    }
    document.addEventListener("scroll", (e) => {
      if (insideUI(e.target)) return;
      askBtn.style.display = "none";
      mini.style.display = "none";
    }, true);
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
