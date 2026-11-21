# The Man Store — Chat AI decision log (archive)

> **Current:** Hugging Face Space — [huggingface-chat-space.md](./huggingface-chat-space.md)  
> Updated: 2026-08-03

## Status

| Path | Status |
|---|---|
| Dify + Gemini | Removed from app |
| Ollama (Laravel provider) | Removed from app |
| **Hugging Face Space** `Kalapak/themanstoreAIchat` | **Active** |

## What remains in code

- `HuggingFaceSpaceChatService`
- `AdminAiChatController` / `ChatbotController`
- `AdminDashboardContextService` (live admin DB facts)
- `AiConversationStore`, `ChatFaqContextService`
- `php artisan chat-ai:diagnose`

## Docs

| File | |
|---|---|
| [huggingface-chat-space.md](./huggingface-chat-space.md) | Production setup |
| [own-chat-ai-setup.md](./own-chat-ai-setup.md) | Points to HF (Ollama setup retired) |
| [vps-backend-ollama.md](./vps-backend-ollama.md) | Optional Laravel VPS (not for chat model) |
