document.addEventListener("DOMContentLoaded", () => {
    init().catch((e) => {
        const status = document.getElementById("status");
        if (status) {
            status.textContent = `Lỗi khởi tạo: ${e.message}`;
            status.className = "status err";
        }
    });
});

async function init() {
    const el = {
        provider: document.getElementById("sel-provider"),
        model: document.getElementById("sel-model"),
        refreshModels: document.getElementById("btn-refresh-models"),
        token: document.getElementById("sel-token"),
        textarea: document.getElementById("token-textarea"),
        status: document.getElementById("status"),
        save: document.getElementById("btn-save-tokens"),
        test: document.getElementById("btn-test"),
        open: document.getElementById("btn-open"),
        keyLink: document.getElementById("key-link"),
        promptTextarea: document.getElementById("prompt-textarea"),
        promptSave: document.getElementById("btn-save-prompt"),
        tavilyToggle: document.getElementById("chk-tavily"),
        tavilyAnswer: document.getElementById("chk-tavily-answer"),
        tavilyDepth: document.getElementById("sel-tavily-depth"),
        tavilyResults: document.getElementById("num-tavily-results"),
        tavilyTextarea: document.getElementById("tavily-textarea"),
        tavilySave: document.getElementById("btn-save-tavily"),
        tavilyTest: document.getElementById("btn-test-tavily"),
        tavilyKeyLink: document.getElementById("tavily-key-link"),
        bgWarn: document.getElementById("bg-warn"),
        reloadExt: document.getElementById("btn-reload-ext")
    };

    const stored = await chrome.storage.local.get(aiStorageKeys());

    let providerId = AI_PROVIDERS[stored.activeProvider] ? stored.activeProvider : "";
    if (!providerId) {
        providerId = AI_PROVIDER_ORDER.find((id) => {
            const p = AI_PROVIDERS[id];
            return aiNormalizeKeys(stored[p.keysStorage], p.singleKey ? stored[p.singleKey] : "").length > 0;
        }) || AI_DEFAULT_PROVIDER;
    }

    let selectedModels = stored.selectedModels && typeof stored.selectedModels === "object"
        ? { ...stored.selectedModels }
        : {};
    let modelsCache = stored.modelsCache && typeof stored.modelsCache === "object"
        ? { ...stored.modelsCache }
        : {};

    // Tương thích dữ liệu cũ: geminiModel -> selectedModels.gemini
    if (!selectedModels.gemini && stored.geminiModel) {
        selectedModels.gemini = String(stored.geminiModel).replace(/^models\//, "");
    }

    // Đổ danh sách provider
    el.provider.textContent = "";
    for (const id of AI_PROVIDER_ORDER) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = AI_PROVIDERS[id].name;
        el.provider.appendChild(opt);
    }
    el.provider.value = providerId;

    // Prompt prefix đã lưu
    el.promptTextarea.value = stored.promptPrefix || "";

    function setStatus(msg, ok) {
        el.status.textContent = msg || "";
        el.status.className = "status" + (ok === true ? " ok" : ok === false ? " err" : "");
    }

    // Background có code mới không? SW có thể đang giữ bản cũ trong RAM nên thử vài lần.
    async function backgroundReady() {
        for (let i = 0; i < 3; i++) {
            try {
                const bg = await chrome.runtime.sendMessage({ action: "ping" });
                if (bg && bg.tavily) return true;
            } catch (e) {}
            if (i < 2) await new Promise((r) => setTimeout(r, 400));
        }
        return false;
    }

    el.reloadExt.addEventListener("click", () => {
        try {
            chrome.tabs.create({ url: "chrome://extensions" });
            window.close();
        } catch (e) {}
    });

    // ---- Tavily web search ----
    function renderTavily() {
        const cfg = aiTavilyConfig(stored);
        el.tavilyToggle.checked = cfg.enabled;
        el.tavilyAnswer.checked = cfg.includeAnswer;
        el.tavilyDepth.value = cfg.depth;
        el.tavilyResults.value = String(cfg.maxResults);
        el.tavilyTextarea.value = aiTavilyKeys(stored).join("\n");
        el.tavilyKeyLink.href = TAVILY_PROVIDER.keyUrl;
        el.tavilyKeyLink.title = TAVILY_PROVIDER.keyUrl;
    }

    function tavilyConfigFromUI() {
        return aiTavilyConfig({
            [TAVILY_PROVIDER.storage]: {
                enabled: el.tavilyToggle.checked,
                includeAnswer: el.tavilyAnswer.checked,
                depth: el.tavilyDepth.value,
                maxResults: parseInt(el.tavilyResults.value, 10),
                topic: aiTavilyConfig(stored).topic
            }
        });
    }

    async function saveTavilyConfig() {
        const cfg = tavilyConfigFromUI();
        stored[TAVILY_PROVIDER.storage] = cfg;
        await chrome.storage.local.set({ [TAVILY_PROVIDER.storage]: cfg });
    }

    async function saveTavily(silent) {
        const keys = aiParseKeys(el.tavilyTextarea.value);
        const cfg = tavilyConfigFromUI();
        const prevIdx = Number(stored[TAVILY_PROVIDER.activeStorage] || 0) || 0;
        const idx = keys.length ? Math.min(Math.max(0, prevIdx), keys.length - 1) : 0;

        await chrome.storage.local.set({
            [TAVILY_PROVIDER.keysStorage]: keys,
            [TAVILY_PROVIDER.activeStorage]: idx,
            [TAVILY_PROVIDER.storage]: cfg
        });
        stored[TAVILY_PROVIDER.keysStorage] = keys;
        stored[TAVILY_PROVIDER.activeStorage] = idx;
        stored[TAVILY_PROVIDER.storage] = cfg;

        if (!silent) {
            setStatus(
                !cfg.enabled
                    ? "Tavily: đã tắt tra cứu web"
                    : keys.length
                        ? `Tavily: đã lưu ${keys.length} key · ${cfg.depth} · ${cfg.maxResults} nguồn`
                        : "Tavily: đã lưu cấu hình nhưng chưa có key",
                true
            );
        }
        return keys;
    }

    function currentProvider() {
        return aiProvider(providerId);
    }

    function renderMeta() {
        const p = currentProvider();
        el.textarea.placeholder = `${p.keyPlaceholder || "token..."}\n${p.keyPlaceholder || "token..."}`;
        el.keyLink.href = p.keyUrl;
        el.keyLink.title = p.keyUrl;
    }

    function renderModels() {
        const p = currentProvider();
        const list = aiModelsFor({ selectedModels, modelsCache }, p, 100);
        const saved = selectedModels[p.id];
        const model = list.includes(saved) ? saved : list[0];
        selectedModels[p.id] = model;

        el.model.textContent = "";
        for (const m of list) {
            const opt = document.createElement("option");
            opt.value = m;
            opt.textContent = m;
            el.model.appendChild(opt);
        }
        el.model.value = model;

        // Model cũ không còn tồn tại -> lưu lại model đang hiển thị.
        if (saved && saved !== model) {
            const patch = { selectedModels };
            if (p.id === "gemini") patch.geminiModel = model;
            chrome.storage.local.set(patch).catch(() => {});
        }
    }

    function renderTokens(keys, activeIdx) {
        el.token.textContent = "";
        if (!keys.length) {
            const opt = document.createElement("option");
            opt.value = "0";
            opt.textContent = "(chưa có token)";
            el.token.appendChild(opt);
            return 0;
        }

        const active = Math.min(Math.max(0, activeIdx || 0), keys.length - 1);
        keys.forEach((key, i) => {
            const opt = document.createElement("option");
            opt.value = String(i);
            opt.textContent = `Token ${i + 1} (${aiMaskKey(key)})`;
            el.token.appendChild(opt);
        });
        el.token.value = String(active);
        return active;
    }

    async function loadTokens() {
        const p = currentProvider();
        const keysToGet = [p.keysStorage, p.activeStorage];
        if (p.singleKey) keysToGet.push(p.singleKey);

        const data = await chrome.storage.local.get(keysToGet);
        const keys = aiNormalizeKeys(data[p.keysStorage], p.singleKey ? data[p.singleKey] : "");
        el.textarea.value = keys.join("\n");
        const idx = renderTokens(keys, Number(data[p.activeStorage] || 0));
        return { keys, idx };
    }

    async function persistTokens(pid = providerId) {
        const p = aiProvider(pid);
        const keys = aiParseKeys(el.textarea.value);
        const wanted = parseInt(el.token.value, 10) || 0;
        const idx = keys.length ? Math.min(Math.max(0, wanted), keys.length - 1) : 0;

        const patch = {
            [p.keysStorage]: keys,
            [p.activeStorage]: idx
        };
        if (p.singleKey) patch[p.singleKey] = keys[idx] || "";
        await chrome.storage.local.set(patch);
        return { keys, idx };
    }

    async function testProvider(p, key, model) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
            let res;
            if (p.kind === "gemini") {
                const cleanModel = String(model).replace(/^models\//, "");
                res = await fetch(p.endpoint.replace("{model}", cleanModel), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": key
                    },
                    body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with OK" }] }] }),
                    signal: controller.signal
                });
            } else {
                res = await fetch(p.endpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${key}`
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: "user", content: "Reply with OK" }],
                        temperature: 0,
                        max_tokens: 8
                    }),
                    signal: controller.signal
                });
            }

            const data = await res.json().catch(() => ({}));
            if (res.ok) return { ok: true };
            return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
        } catch (e) {
            return {
                ok: false,
                error: e.name === "AbortError" ? "Hết thời gian chờ" : `Lỗi kết nối: ${e.message}`
            };
        } finally {
            clearTimeout(timer);
        }
    }

    // Gọi Tavily trực tiếp từ popup: dùng khi background chưa kịp cập nhật,
    // đồng thời trả lỗi thật của API (thay vì "không rõ").
    async function tavilyDirect(query, key, cfg) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
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
                    include_images: false
                }),
                signal: controller.signal
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const detail = data?.detail;
                const msg = typeof detail === "string"
                    ? detail
                    : detail?.error || detail?.message || data?.error?.message || data?.error;
                return {
                    ok: false,
                    status: res.status,
                    error: String(msg || `HTTP ${res.status}`).slice(0, 200)
                };
            }

            return {
                ok: true,
                answer: String(data?.answer || ""),
                results: Array.isArray(data?.results) ? data.results : []
            };
        } catch (e) {
            return {
                ok: false,
                error: e.name === "AbortError" ? "hết thời gian chờ" : `lỗi mạng: ${e.message}`
            };
        } finally {
            clearTimeout(timer);
        }
    }

    async function fetchModelsFor(p, key) {
        if (!p.modelsEndpoint) return [];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
            const headers = {};
            if (p.kind === "gemini") headers["x-goog-api-key"] = key;
            else headers["Authorization"] = `Bearer ${key}`;

            const res = await fetch(p.modelsEndpoint, { headers, signal: controller.signal });
            if (!res.ok) return [];

            const data = await res.json().catch(() => ({}));
            return aiExtractModels(data, p);
        } catch (e) {
            return [];
        } finally {
            clearTimeout(timer);
        }
    }

    async function refreshModels(force) {
        const p = currentProvider();
        const cache = modelsCache[p.id];
        if (!force && cache && Date.now() - Number(cache.at || 0) < AI_MODELS_CACHE_TTL) return true;

        const keys = aiParseKeys(el.textarea.value);
        if (!keys.length) return false;
        const active = Math.min(Math.max(0, parseInt(el.token.value, 10) || 0), keys.length - 1);

        for (const idx of aiTokenOrder(keys.length, active)) {
            const models = await fetchModelsFor(p, keys[idx]);
            if (!models.length) continue;
            if (providerId !== p.id) return false; // đã chuyển provider trong lúc chờ

            modelsCache = { ...modelsCache, [p.id]: { models, at: Date.now() } };
            await chrome.storage.local.set({ modelsCache });
            renderModels();
            return true;
        }
        return false;
    }

    el.refreshModels.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setStatus("Đang tải danh sách model...", null);
        const ok = await refreshModels(true);
        setStatus(
            ok ? `Đã cập nhật model · ${currentProvider().name}` : "Không tải được model · kiểm tra token",
            ok
        );
    });

    // Provider -> Model -> Token
    el.provider.addEventListener("change", async () => {
        await persistTokens(providerId);
        providerId = AI_PROVIDERS[el.provider.value] ? el.provider.value : AI_DEFAULT_PROVIDER;
        el.provider.value = providerId;

        await chrome.storage.local.set({ activeProvider: providerId });
        renderModels();
        renderMeta();
        await loadTokens();
        setStatus(`Đang dùng ${currentProvider().name}`, null);
        refreshModels();
    });

    el.model.addEventListener("change", async () => {
        selectedModels[providerId] = el.model.value;
        const patch = { selectedModels };
        if (providerId === "gemini") patch.geminiModel = el.model.value;
        await chrome.storage.local.set(patch);
        setStatus("Đã lưu model", null);
    });

    el.token.addEventListener("change", async () => {
        const p = currentProvider();
        const keys = aiParseKeys(el.textarea.value);
        const idx = parseInt(el.token.value, 10) || 0;
        const patch = {
            [p.keysStorage]: keys,
            [p.activeStorage]: idx
        };
        if (p.singleKey) patch[p.singleKey] = keys[idx] || "";
        await chrome.storage.local.set(patch);
        setStatus(keys.length ? `Đang dùng token ${idx + 1}/${keys.length}` : "", null);
    });

    el.save.addEventListener("click", async () => {
        const { keys, idx } = await persistTokens();
        renderTokens(keys, idx);
        setStatus(keys.length
            ? `Đã lưu ${keys.length} token · đang dùng token ${idx + 1}`
            : "Chưa có token nào", keys.length > 0);
        refreshModels(true);
    });

    el.promptSave.addEventListener("click", async () => {
        const prefix = el.promptTextarea.value.trim();
        await chrome.storage.local.set({ promptPrefix: prefix });
        setStatus(prefix ? "Đã lưu prompt prefix" : "Đã xoá prompt prefix", true);
    });

    // ---- Tavily ----
    el.tavilySave.addEventListener("click", () => saveTavily(false));

    for (const ctl of [el.tavilyToggle, el.tavilyAnswer, el.tavilyDepth, el.tavilyResults]) {
        ctl.addEventListener("change", () => {
            saveTavilyConfig().catch(() => {});
            setStatus(
                el.tavilyToggle.checked
                    ? `Tavily: ${el.tavilyDepth.value} · ${parseInt(el.tavilyResults.value, 10) || 5} nguồn`
                    : "Tavily: đã tắt tra cứu web",
                null
            );
        });
    }

    el.tavilyTest.addEventListener("click", async () => {
        const keys = aiParseKeys(el.tavilyTextarea.value);
        if (!keys.length) {
            setStatus("Chưa có Tavily key", false);
            return;
        }

        setStatus("Đang tra cứu thử bằng Tavily...", null);

        const cfg = tavilyConfigFromUI();
        let res = null;
        let viaBackground = true;

        try {
            res = await chrome.runtime.sendMessage({
                action: "tavilySearch",
                query: "tin tức công nghệ mới nhất",
                key: keys[0],
                config: cfg
            });
        } catch (e) {
            res = null;
        }

        // Background cũ / chưa reload -> không trả lời. Gọi thẳng API để vẫn test được key.
        if (!res) {
            viaBackground = false;
            el.bgWarn.hidden = false;
            res = await tavilyDirect("tin tức công nghệ mới nhất", keys[0], cfg);
        }

        if (res?.ok) {
            const n = Array.isArray(res.results) ? res.results.length : 0;
            const top = res.results?.[0]?.title ? ` · ${res.results[0].title.slice(0, 36)}` : "";
            setStatus(
                viaBackground
                    ? `Tavily OK ✓ ${n} nguồn${top}`
                    : `Tavily OK ✓ ${n} nguồn${top} · key tốt, nhưng background chưa cập nhật`,
                true
            );
        } else {
            setStatus(`Tavily lỗi: ${res?.error || "không nhận được phản hồi"}`, false);
        }
    });

    el.test.addEventListener("click", async () => {
        const p = currentProvider();
        const keys = aiParseKeys(el.textarea.value);
        if (!keys.length) {
            setStatus(`Chưa có token ${p.name}`, false);
            return;
        }

        const idx = Math.min(Math.max(0, parseInt(el.token.value, 10) || 0), keys.length - 1);
        const model = el.model.value;
        setStatus(`Đang test ${p.name} · ${model}...`, null);

        const result = await testProvider(p, keys[idx], model);
        setStatus(
            result.ok ? `OK ✓ ${p.name}` : `Lỗi: ${result.error}`,
            result.ok
        );
    });

    el.open.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "openGeminiFull" }, () => window.close());
    });

    // Lần đầu mở popup
    renderModels();
    renderMeta();
    renderTavily();
    const loaded = await loadTokens();

    el.bgWarn.hidden = await backgroundReady();

    const tavilyOn = aiTavilyConfig(stored).enabled && aiTavilyKeys(stored).length > 0;
    setStatus(
        `Sẵn sàng · ${currentProvider().name}` +
        (loaded.keys.length ? ` · token ${loaded.idx + 1}/${loaded.keys.length}` : " · chưa có token") +
        (tavilyOn ? " · 🔎 Tavily" : ""),
        null
    );
    refreshModels();
}
