# Chọn model LLM free cho extension

Thống kê model free dùng được với **Mini AI QA Bubble**, cập nhật **22/10/2026**.

Số liệu tổng hợp từ tài liệu chính thức của từng provider, OpenRouter, Artificial Analysis (AA) và danh mục cộng đồng freellm.net. Ô ghi "chưa có số" nghĩa là chưa tìm được nguồn đo.

> **Lưu ý khi đọc tốc độ**
>
> - Tốc độ của Gemini, GLM, DeepSeek là số AA đo trên API gốc của hãng. Trên endpoint free của NVIDIA có thể chậm hơn vì dùng chung GPU.
> - Số của OpenRouter và Groq đo trực tiếp trên endpoint đó.
> - Danh sách model free đổi gần như hàng tuần. File này chỉ là tham chiếu; extension vẫn tự gọi `/models` để lấy danh sách mới (cache 6 giờ, nút ↻ trong popup).

## Chọn nhanh

| Nhu cầu | Model nên dùng | Lý do |
| --- | --- | --- |
| Mặc định, hỏi đáp thường ngày | `gemini-3.8-flash` (thinking low/medium) | Chất lượng cao, context 1M, free |
| Fallback khi Gemini hết quota | `deepseek-ai/deepseek-v4.1-flash` (NVIDIA) | AA-LCR cao nhất nhóm, TTFT ~0,9s |
| Ưu tiên độ trễ thấp | `nvidia/nemotron-3.5-lightning:free` hoặc `z-ai/glm-5.3-flash` (NVIDIA) | TTFT 0,36s / 2,6s |
| Hỏi đáp trên tài liệu dài | DeepSeek V4.1 Flash, MiniMax M3.1 Flash, Nemotron 3 Ultra | AA-LCR 84,0 / 79,7 / 79,3 |
| Cần tốc độ sinh chữ cực cao | `openai/gpt-oss-20b` (Groq) | ~1000 t/s, nhưng chỉ 8K TPM |

## 1. Các model chính

| Model (provider) | Context / max output | Quota free | Tốc độ, độ trễ | Chỉ số trí tuệ (AA) |
| --- | --- | --- | --- | --- |
| `gemini-3.8-flash` (Gemini) | 1.048.576 / 65.536 | Có free; Google không còn công bố số cụ thể, xem trong AI Studio | ~144 t/s; TTFT ~26s khi thinking = high | 41 |
| `z-ai/glm-5.3` (NVIDIA) | 1M / 944K (freellm) | 40 RPM | ~84 t/s (freellm) | 44,8 (freellm) |
| `z-ai/glm-5.3-flash` (NVIDIA) | 1M | 40 RPM | ~77 t/s; TTFT 2,6s | 42 |
| `deepseek-ai/deepseek-v4.1-flash` (NVIDIA) | 1M | 40 RPM | ~230–240 t/s (reasoning), 369 t/s (non-reasoning); TTFT 0,9s | 39 (bản 9/2026), 45 (bản 1017) |
| `minimax/minimax-m3.1-flash:free` (OpenRouter) | 1M / 524K | ~200 request/ngày | 80 t/s; độ trễ 1,42s; uptime ~100% | 42,7 |
| `nvidia/nemotron-3-ultra-550b-a55b:free` (OpenRouter) | 1M | ~200 request/ngày | 45 t/s; độ trễ 1,77s; uptime 97% | 22,9 |
| `nvidia/nemotron-3.5-lightning:free` (OpenRouter) | 1M | ~200 request/ngày | 82 t/s; độ trễ 0,36s | 12,9 |
| `openai/gpt-oss-120b` (Groq) | 131K / 65K | 30 RPM, 1K RPD, 8K TPM, 200K TPD | ~500 t/s | chưa có số |
| `openai/gpt-oss-20b` (Groq) | 131K / 65K | như trên | ~1000 t/s | chưa có số |
| `qwen/qwen3.8-27b` (Groq) | 131K / 16K | như trên | ~450 t/s | chưa có số |

## 2. Quota theo provider (các provider còn lại)

| Provider | Giới hạn free | Lưu ý |
| --- | --- | --- |
| Mistral | ~1 request/giây, 500K TPM, ~1 tỷ token/tháng mỗi model | Cần xác minh SĐT; request có thể dùng để huấn luyện. Medium 3.5 và Small 4 có context 256K; Large 4 chưa rõ |
| Ollama Cloud | Giới hạn theo phiên 5 giờ và theo tuần; 1 model đồng thời | Không công bố RPM. deepseek-v4-pro/v4-flash 1M context, minimax-m3 512K |
| Z.ai | 1 request đồng thời | glm-4.7-flash 200K context |
| SambaNova | 20 RPM, 20 request/ngày, 200K token/ngày | Rất chặt; số từ danh sách cộng đồng, chưa kiểm lại |
| OpenCode Zen | Không công bố | Docs ghi model free chỉ "trong thời gian giới hạn"; dữ liệu có thể dùng để cải thiện model |
| OpenAI | Không có free tier | Chỉ có chương trình đổi dữ liệu lấy token (1M/ngày flagship, 10M/ngày mini/nano), cần số dư dương |
| NVIDIA NIM | ~40 RPM, không giới hạn token công bố | Dùng chung GPU nên có thể chậm; input/output được log và có thể dùng huấn luyện |

## 3. Chọn model cho hỏi đáp trên tài liệu

Chỉ số phù hợp nhất là **AA-LCR** (suy luận trên văn bản dài):

| Model | AA-LCR |
| --- | --- |
| DeepSeek V4.1 Flash | 84,0 |
| MiniMax M3.1 Flash | 79,7 |
| Nemotron 3 Ultra | 79,3 |
| Nemotron 3.5 Lightning | 60,3 |
| Gemini 3.8 Flash | chưa có số |

**Độ trễ của Gemini:** TTFT ~26s ở mức thinking `high` là quá chậm cho hỏi đáp. Nên đặt thinking `low` hoặc `medium` (API không hỗ trợ `minimal`, sẽ trả lỗi).

**Nguy cơ bịa:** tỉ lệ không bịa của AA-Omniscience:

| Model | Tỉ lệ không bịa |
| --- | --- |
| MiniMax M3.1 Flash | 7,2% |
| DeepSeek V4.1 Flash | 3,5% |
| Nemotron 3 Ultra | 70,3% |

Phép đo này dựa trên câu hỏi **không có tài liệu** nên chỉ để tham khảo. Prompt vẫn cần yêu cầu rõ "chỉ trả lời theo tài liệu, không có thì nói không có". Số liệu AA-Omniscience thường được báo theo chiều "càng thấp càng tốt" (tỉ lệ bịa), nên đối chiếu lại nguồn gốc trước khi so sánh.

**Groq không hợp tài liệu dài:** 8K token/phút không đủ chứa tài liệu.

**Thứ tự gợi ý:**

1. `gemini-3.8-flash` (thinking low/medium) — làm mặc định.
2. `deepseek-ai/deepseek-v4.1-flash` trên NVIDIA — làm fallback.
3. `z-ai/glm-5.3-flash` trên NVIDIA.

## 4. Điểm cần sửa trong registry

- **OpenCode Zen**: endpoint trong `providers.js` là `https://opencode.ai/inference/openai/v1/chat/completions`, còn docs ghi `https://opencode.ai/zen/v1/chat/completions` và `https://opencode.ai/zen/v1/models`. Có thể sai.
- **Model ID của OpenCode**: docs chỉ xác nhận `deepseek-v4-flash-free`, `mimo-v2.5-free`, `nemotron-3-ultra-free`, `big-pickle`. Các ID như `glm-5.3-flash-free`, `minimax-m3.1-flash-free` chưa xác minh được.
- **NVIDIA**: `deepseek-ai/deepseek-v4-pro` và `moonshotai/kimi-k3` không thấy trong danh sách NIM. Kimi K3 chỉ thấy trên OpenCode Zen; NIM có `moonshotai/kimi-k2.6`.
- **Mistral**: các alias `-latest` (như `ministral-14b-latest`) chưa thấy trong docs.
- **Nên thêm trên OpenRouter**: `nvidia/nemotron-3.5-super-vl:free` (1M context, có ảnh/video).
- **Cập nhật động**: danh sách free đổi gần như hàng tuần, nên tiếp tục dùng `aiExtractModels` gọi `/models`, coi danh sách trong file là fallback.

## Nguồn

- https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- https://ai.google.dev/gemini-api/docs/pricing
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/models
- https://openrouter.ai/minimax/minimax-m3.1-flash:free
- https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free
- https://openrouter.ai/nvidia/nemotron-3.5-lightning:free
- https://openrouter.ai/deepseek/deepseek-v4.1-flash-1017
- https://artificialanalysis.ai/models/gemini-3-8-flash
- https://artificialanalysis.ai/models/releases/comparisons/deepseek-v4-1-flash-vs-gemini-3-8-flash
- https://artificialanalysis.ai/models/comparisons/deepseek-v4-1-flash-vs-glm-5-3-flash
- https://freellm.net/models/
- https://freellm.net/models/nvidia-nim/z-ai-glm-5-3
- https://freellm.net/providers/opencode
- https://opencode.ai/docs/zen
- https://docs.mistral.ai/getting-started/models/models_overview/
- https://registry.ollama.ai/cloud
- https://forums.developer.nvidia.com/t/rpm-increase-request-40-rpm-200-rpm/376235
