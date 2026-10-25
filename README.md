# Mini AI QA Bubble

Extension Chrome (Manifest V3) giúp hỏi AI ngay tại chỗ đang đọc: bôi đen đoạn văn bản → bấm bong bóng `○` → nhận đáp án ngay trên trang, không phải chuyển tab.

Hỗ trợ 10 provider AI, xoay vòng nhiều API token, chọn model linh hoạt và tra cứu web qua Tavily.

## Tính năng

- **Bong bóng hỏi tại chỗ**: bôi đen text, một bong bóng nhỏ hiện ra, bấm để hỏi. Kết quả trả về trong panel mini, có thể thu gọn, kéo thả, copy đáp án.
- **Panel chat đầy đủ**: gõ câu hỏi tự do, xem lại các câu trả lời trước đó trong phiên.
- **4 chế độ trả lời** (dùng cho trắc nghiệm/tự luận):
  - `1 đáp án` – dòng đầu ghi `Đáp án: X`, sau đó giải thích.
  - `Nhiều đáp án` – dòng đầu ghi `Đáp án: A, C`.
  - `Đúng/Sai` – liệt kê từng ý a), b), c) rồi giải thích.
  - `Tự luận` – câu trả lời hoàn chỉnh, gạch đầu dòng các ý chính.
- **Đa provider**: Gemini, Groq, OpenRouter, NVIDIA NIM, Mistral, Ollama Cloud, Z.ai, SambaNova, OpenCode Zen, OpenAI.
- **Xoay vòng token**: mỗi provider lưu được nhiều key, chọn key đang dùng, tự chuyển key khi hết quota.
- **Tự tải danh sách model** từ endpoint `/models` của provider (cache 6 giờ, có nút ↻ để làm mới).
- **Prompt prefix**: ghép trước mọi câu hỏi (ví dụ: "Bạn là giáo viên, trả lời ngắn gọn, đi thẳng vào đáp án").
- **Tra cứu web Tavily** (tuỳ chọn): bật/tắt bằng một toggle, chọn độ sâu `basic`/`advanced`, số nguồn, kèm tối đa 3 link tham khảo trong câu trả lời.
- **Kiểm tra cấu hình**: nút Test token và Test search trước khi dùng thật.

## Cài đặt

Extension không cần build, chỉ cần nạp thư mục trực tiếp:

1. Tải repo:
   ```bash
   git clone https://github.com/dinhvanit/mini-ai-qa-bubble.git
   ```
2. Mở Chrome/Edge/Cốc Cốc → `chrome://extensions`.
3. Bật **Developer mode**.
4. Chọn **Load unpacked** → trỏ tới thư mục `mini-ai-qa-bubble`.
5. Bấm icon extension để mở popup cấu hình.

## Sử dụng

1. Trong popup: chọn **Provider** → **Model** → **Token**.
2. Mở **Quản lý token**, dán danh sách key (mỗi dòng một key), bấm **Lưu danh sách**.
3. (Tuỳ chọn) Bật **Tra cứu web Tavily** và thêm key Tavily trong mục `Web search · Tavily`.
4. (Tuỳ chọn) Đặt **Prompt prefix** nếu muốn câu trả lời theo văn phong riêng.
5. Ra lại trang web bất kỳ:
   - Bôi đen đoạn text → bấm bong bóng `○` để hỏi.
   - Hoặc nhấn `Alt+G` để mở/đóng panel chat.
   - Hoặc `Ctrl+Shift+G` để mở popup cấu hình.

Khi cần đổi nhanh chế độ trả lời, dùng dropdown ngay trên header của panel mini.

## Provider hỗ trợ

So sánh tốc độ, quota và benchmark để chọn model: xem **[MODELS.md](MODELS.md)**.

| Provider | Loại API | Lấy key |
| --- | --- | --- |
| Gemini | Gemini `generateContent` | https://aistudio.google.com/apikey |
| Groq | OpenAI-compatible | https://console.groq.com/keys |
| OpenRouter | OpenAI-compatible | https://openrouter.ai/keys |
| NVIDIA NIM | OpenAI-compatible | https://build.nvidia.com/ |
| Mistral | OpenAI-compatible | https://console.mistral.ai/api-keys |
| Ollama Cloud | OpenAI-compatible | https://ollama.com/settings/keys |
| Z.ai | OpenAI-compatible | https://open.bigmodel.cn/usercenter/apikeys |
| SambaNova | OpenAI-compatible | https://cloud.sambanova.ai/apis |
| OpenCode Zen | OpenAI-compatible | https://opencode.ai/console |
| OpenAI | OpenAI-compatible | https://platform.openai.com/api-keys |

Danh sách model mặc định nằm trong `providers.js`. Sau khi lưu token, bấm ↻ cạnh **Model** để lấy danh sách mới nhất từ provider.

## Tra cứu web với Tavily

Tavily là công cụ search, không phải LLM nên được cấu hình riêng:

- Toggle **🔎 Tra cứu web Tavily** ở popup: bật = tìm nguồn rồi mới hỏi model (chậm hơn nhưng có dẫn nguồn), tắt = hỏi thẳng model.
- Tuỳ chỉnh được: độ sâu tìm kiếm, số nguồn (1–10), lấy sẵn phần tóm tắt của Tavily.
- Key lấy tại https://app.tavily.com/home, mỗi dòng một key, hỗ trợ xoay vòng như các provider khác.

## Cấu trúc dự án

```
manifest.json        # Khai báo extension: quyền, content script, command
background.js        # Service worker: gọi provider, prompt theo chế độ, Tavily
providers.js         # Registry provider/model + helper dùng chung
content-bubble.js    # Bong bóng, panel mini và panel chat trên trang web
popup.html/css/js    # Giao diện cấu hình provider, token, prompt, Tavily
force-light.css/js   # Ép giao diện sáng cho panel (tránh bị dark mode trang web ghi đè)
rules.json           # Rule DNR thử nghiệm, chưa khai báo trong manifest
MODELS.md            # So sánh tốc độ, quota, benchmark các model free
```

Luồng xử lý: `content-bubble.js` → `chrome.runtime.sendMessage` → `background.js` (chọn key, ghép prompt, gọi API) → trả kết quả về panel.

## Quyền và quyền riêng tư

- `storage` – lưu token, model đã chọn, prompt prefix trong `chrome.storage.local` (chỉ trên máy bạn).
- `activeTab`, `scripting`, `tabs`, `contextMenus` – hiển thị panel/bong bóng trên tab hiện tại.
- `host_permissions` – chỉ mở đúng endpoint của các provider ở trên và `api.tavily.com`.

Token không được gửi đi đâu ngoài API của chính provider bạn chọn. Không có server trung gian, không telemetry.

## Phát triển

- Sửa code xong, vào `chrome://extensions` bấm **↻ Reload** ở extension, rồi **đóng và mở lại popup**. Nếu popup báo "Background chưa nạp code mới", nghĩa là service worker còn chạy bản cũ.
- Debug background: link **service worker** trong trang Extensions.
- Debug panel trên trang: DevTools → Console, log được prefix `[Mini]`.
- Muốn thêm provider mới: bổ sung một entry vào `AI_PROVIDERS` trong `providers.js` (endpoint, `modelsEndpoint`, storage key, key URL) và thêm domain vào `host_permissions` trong `manifest.json`.

## Phiên bản

Phiên bản hiện tại: **2.7.0** (xem `manifest.json`). Tag phát hành theo dạng `vX.Y.Z`.

## Giấy phép

Dự án cá nhân, dùng cho mục đích học tập và sử dụng nội bộ.
