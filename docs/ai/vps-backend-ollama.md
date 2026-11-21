# The Man Store — VPS Guide (Backend hosting)

> Updated: 2026-08-03  
> Chat AI is **not** hosted on the VPS — it uses the Hugging Face Space.  
> See [huggingface-chat-space.md](./huggingface-chat-space.md).

---

## 1. When you need a VPS

| Need | VPS? |
|---|---|
| Chat AI (Admin + Customer) | **No** — HF Space |
| Escape Render Free cold start / 504 | **Yes** — Laravel on VPS |
| Neon DB / R2 / Netlify frontend | Stay as-is |

```
Netlify (frontend)
      ↓ /api
VPS or Render (Laravel)
      ↓ chat
Hugging Face Space
      ↓
Neon + R2
```

---

## 2. Contabo (if hosting Backend)

| | Recommendation |
|---|---|
| Plan | Cloud VPS 8 (~24 GB) or smaller if **only** Laravel (no Ollama) |
| Region | **Singapore** |
| OS | Ubuntu 24.04 |
| Period | **1 Month** while testing |
| Panel | None |

For **Laravel only** (chat on HF), **8–12 GB RAM** is enough.  
24 GB was for Backend + Ollama together — no longer required for chat.

Links: https://contabo.com/en/vps/ · Singapore: https://contabo.com/en/locations/asia-singapore/

---

## 3. Do not put on VPS (unless you choose to)

| | |
|---|---|
| Frontend | Netlify |
| Postgres | Neon |
| Media | R2 |
| Chat model | Hugging Face Space |
| Qdrant / CLIP | Only if you self-host image search |

---

## 4. Backend on VPS — short checklist

1. Order Contabo Singapore + Ubuntu  
2. SSH · `ufw` allow 22/80/443  
3. Nginx + PHP 8.2/8.3 + Composer  
4. Deploy Laravel · `.env` with Neon + R2 + **HF_CHAT_***  
5. SSL (Certbot) · DNS `api.…` → VPS IP  
6. Point Netlify `/api` proxy to the new API URL  
7. Update OAuth redirect + Telegram webhook  
8. `php artisan chat-ai:diagnose --ping-chat`  
9. Retire Render after 24–48h stable  

**Do not** open Ollama ports — chat does not use Ollama anymore.

---

## 5. Env snippet (chat)

```env
HF_CHAT_BASE_URL=https://kalapak-themanstoreaichat.hf.space
HF_CHAT_SPACE_ID=Kalapak/themanstoreAIchat
HF_CHAT_TIMEOUT=180
```
