# Own Chat AI — setup (superseded)

> **Current production chat:** [huggingface-chat-space.md](./huggingface-chat-space.md)  
> Space: https://huggingface.co/spaces/Kalapak/themanstoreAIchat

This file previously described installing **Ollama** on a Mac for local chat.  
That path was removed from the Laravel app. Do **not** set `OLLAMA_*` for The Man Store chat anymore.

### What to do instead

1. Keep the Hugging Face Space **Running**
2. Set on local + Render:

```env
HF_CHAT_BASE_URL=https://kalapak-themanstoreaichat.hf.space
HF_CHAT_SPACE_ID=Kalapak/themanstoreAIchat
HF_CHAT_TIMEOUT=180
```

3. Verify:

```bash
cd backend && php artisan chat-ai:diagnose --ping-chat
```
