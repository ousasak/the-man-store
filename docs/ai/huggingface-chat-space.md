# The Man Store Chat AI — Hugging Face Space

> Space: https://huggingface.co/spaces/Kalapak/themanstoreAIchat  
> Host: https://kalapak-themanstoreaichat.hf.space  
> Updated: 2026-08-03

## Current stack (only)

```
Admin Ask AI / Customer chatbot
        ↓
Laravel API
        ↓
Hugging Face Gradio Space (trained The Man Store model + FAQ/RAG)
```

**Removed (do not use):** Dify · Gemini chatbot · Ollama chat provider.

## Env

```env
CHATBOT_PROVIDER=huggingface
CHATBOT_HF_URL=https://kalapak-themanstoreaichat.hf.space
CHATBOT_HF_TOKEN=
CHATBOT_HF_PROTOCOL=call
CHATBOT_HF_FN_INDEX=7
CHATBOT_HF_SEND_HISTORY=true
CHATBOT_HF_TIMEOUT=120
CHATBOT_HF_HISTORY_TURNS=6
HF_CHAT_SPACE_ID=Kalapak/themanstoreAIchat
```

Gradio `chat` expects `data=[message, history, product_focus]`. With `CHATBOT_HF_PROTOCOL=call`, Laravel posts to `/gradio_api/call/chat` (UI dependency `fn_index=7`).

Set the same on **Render** Environment. Remove old keys if present:

- `CHAT_AI_PROVIDER`
- `OLLAMA_*`
- `DIFY_*`
- `GEMINI_*` (unless you still use them for something else outside chat)

## Verify

```bash
cd backend
php artisan config:clear
php artisan chat-ai:diagnose --ping-chat
```

## Code kept (still used)

| File | Role |
|---|---|
| `HuggingFaceSpaceChatService` | Calls Gradio `/gradio_api/call/chat` |
| `AdminAiChatController` | Admin Ask AI + live DB context |
| `ChatbotController` | Storefront chatbot |
| `AiConversationStore` | Admin conversation history (cache) |
| `ChatFaqContextService` | Extra FAQ snippets for admin prompts |
| `AdminDashboardContextService` | Live admin metrics |

## Related docs

- [vps-backend-ollama.md](./vps-backend-ollama.md) — VPS for **Laravel backend** only (chat stays on HF Space)
- Archive notes: older Ollama/Dify plans were superseded by this Space
