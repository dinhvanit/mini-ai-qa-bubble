document.addEventListener('DOMContentLoaded', async () => {
    const input = document.getElementById('api-key');
    const btnSave = document.getElementById('btn-save');
    const status = document.getElementById('key-status');
    const btnOpen = document.getElementById('btn-open');

    const setStatus = (msg, ok) => {
        status.textContent = msg;
        status.className = 'key-status ' + (ok ? 'ok' : 'err');
    };

    try {
        const data = await chrome.storage.local.get('geminiApiKey');
        if (data.geminiApiKey) {
            input.value = data.geminiApiKey;
            setStatus('Đã lưu key ✓', true);
        }
    } catch (e) {}

    async function testToken(token) {
        const apiKey = token.trim();
        const headers = {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
        };

        let listRes;
        try {
            listRes = await fetch(
                'https://generativelanguage.googleapis.com/v1beta/models',
                { method: 'GET', headers: { 'x-goog-api-key': apiKey } }
            );
        } catch (e) {
            return { ok: false, error: `Không kết nối được Google: ${e.message}` };
        }

        const listData = await listRes.json().catch(() => ({}));
        if (!listRes.ok) {
            return { ok: false, error: `ListModels HTTP ${listRes.status}: ${listData.error?.message || 'Không lấy được danh sách model'}` };
        }

        const models = (listData.models || [])
            .filter((m) =>
                (m.supportedGenerationMethods || []).includes('generateContent') &&
                !/embedding/i.test(m.name || '')
            )
            .sort((a, b) => {
                const aFlash = /flash/i.test(a.name) ? 0 : 1;
                const bFlash = /flash/i.test(b.name) ? 0 : 1;
                return aFlash - bFlash;
            });

        if (!models.length) {
            return { ok: false, error: 'Không tìm thấy model hỗ trợ generateContent.' };
        }

        const errors = [];
        for (const model of models) {
            const modelName = model.name.replace(/^models\//, '');
            try {
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/${model.name}:generateContent`,
                    {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with OK' }] }] })
                    }
                );
                if (res.ok) {
                    return { ok: true, via: 'x-goog-api-key', model: modelName };
                }
                const data = await res.json().catch(() => ({}));
                const message = data.error?.message || `HTTP ${res.status}`;
                errors.push(`${modelName}: HTTP ${res.status} - ${message}`);
                // Key/quyền sai thật thì dừng, khỏi thử tiếp
                if (res.status === 401 || /API_KEY_INVALID|API key not valid|API key expired/i.test(message)) {
                    return { ok: false, error: errors[errors.length - 1] };
                }
                // 404 model chết -> thử tiếp
                if (res.status === 404) continue;
                // 429 quota -> dừng
                if (res.status === 429) {
                    return { ok: false, error: `${modelName}: đã đạt giới hạn quota hoặc tốc độ gọi.` };
                }
                // 403 quyền -> dừng
                if (res.status === 403) {
                    return { ok: false, error: `${modelName}: HTTP 403 - ${message}` };
                }
            } catch (e) {
                errors.push(`${modelName}: ${e.message}`);
            }
        }
        return { ok: false, error: errors.slice(0, 4).join('\n') };
    }

    btnSave.addEventListener('click', async () => {
        const key = input.value.trim();
        // Bỏ check startsWith('AIza'): cho phép mọi token >= 10 ký tự (AQ..., ya29..., AIza...)
        if (key.length < 10) {
            setStatus('Token quá ngắn, hãy dán đầy đủ token.', false);
            return;
        }
        setStatus('Đang kiểm tra token...', true);
        try {
            const r = await testToken(key);
            if (r.ok) {
                await chrome.storage.local.set({ geminiApiKey: key, geminiAuthVia: r.via, geminiModel: r.model });
                setStatus(`Lưu thành công ✓ (${r.model} via ${r.via})`, true);
            } else {
                setStatus('Token lỗi: ' + r.error, false);
            }
        } catch (e) {
            setStatus('Không gọi được Google: ' + e.message, false);
        }
    });

    // Fallback: vẫn cho mở bản full khi cần (ít dùng)
    btnOpen.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'openGeminiFull' }, () => window.close());
    });
});
