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
        promptSave: document.getElementById("btn-save-prompt")
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
    const loaded = await loadTokens();
    setStatus(
        `Sẵn sàng · ${currentProvider().name}` +
        (loaded.keys.length ? ` · token ${loaded.idx + 1}/${loaded.keys.length}` : " · chưa có token"),
        null
    );
    refreshModels();
}
