# Railway — backend deploy (The Man Store)

Production API is proxied from Netlify (`fitandsleek.online/api/*`) to **one** Railway web service. Use the same hostname everywhere (Netlify `_redirects`, `APP_URL`, OAuth redirect URIs, mobile `API_BASE_URL`).

**Canonical backend URL (current):** `https://fitandsleek-official-production.up.railway.app`

Neon Postgres, Cloudflare R2, and Netlify frontend stay as-is.  
Chat AI + image search run on Hugging Face Spaces (not inside the Railway container).

## Deploy (dashboard)

1. [railway.app](https://railway.app) → New Project → **Deploy from GitHub** (this repo).
2. Service settings:
   - **Root Directory:** `backend`
   - **Builder:** Dockerfile (`backend/Dockerfile` / `railway.toml`)
3. Generate a public domain (Settings → Networking → Generate Domain), or attach a custom domain.
4. Paste variables from **Environment** below (secrets from Render / local `.env`).
5. Deploy → wait until `/api/health` returns `{"ok":true}`.

## CLI (optional)

```bash
cd backend
railway login
railway link          # pick project + service
railway up            # or push to GitHub if connected
railway domain        # generate / list public URL
railway variables     # set env
```

## Environment

Replace `APP_URL` if your Railway hostname differs. Never commit real secrets.

### Core

```env
APP_ENV=production
APP_DEBUG=false
APP_KEY=base64:PASTE_FROM_php_artisan_key_generate_show
APP_URL=https://fitandsleek-official-production.up.railway.app
FRONTEND_URL=https://www.fitandsleek.online
SANCTUM_STATEFUL_DOMAINS=fitandsleek.online,www.fitandsleek.online,fitandsleek-official-frontend.netlify.app,fitandsleek-official.vercel.app

DATABASE_URL=postgresql://USER:PASS@HOST/railway?sslmode=require
# Do not wrap the URL in extra quotes in the Railway dashboard (that makes the DB name railway" and returns 503).
DB_SSLMODE=require

CACHE_STORE=database
QUEUE_CONNECTION=database
SESSION_DRIVER=database

RUN_MIGRATIONS=false
RUN_QUEUE_WORKER=false
RUN_SCHEDULER=false
```

### OAuth

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://fitandsleek-official-production.up.railway.app/api/auth/google/callback
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
FACEBOOK_REDIRECT_URI=https://fitandsleek-official-production.up.railway.app/api/auth/facebook/callback
MOBILE_OAUTH_CALLBACK_URL=fitandsleek://oauth/callback
```

### Media (Cloudflare R2)

```env
FILESYSTEM_DISK=r2
ADMIN_PROFILE_IMAGE_DISK=r2
MEDIA_FALLBACK_TO_PUBLIC=false
ADMIN_PROFILE_IMAGE_FALLBACK_TO_PUBLIC=false
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=fitandsleek
R2_ENDPOINT=https://29531ec21763c961814bc2de1cf2aa75.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://media.fitandsleek.online
R2_REGION=auto
R2_USE_PATH_STYLE_ENDPOINT=true
```

### Mail

```env
MAIL_MAILER=resend
MAIL_FROM_ADDRESS=no-reply@fitandsleek.online
MAIL_FROM_NAME=The Man Store
RESEND_API_KEY=
```

### Payments (Rielpay)

```env
RIELPAY_API_URL=https://api-norng-rielpay.fitandsleek.online
RIELPAY_API_KEY=
RIELPAY_CURRENCY=KHR
RIELPAY_EXPIRES_IN=300
RIELPAY_DEEPLINK_APP_NAME=The Man Store
RIELPAY_DEEPLINK_ICON_URL=https://www.fitandsleek.online/logo-circle.png
RIELPAY_DEEPLINK_CALLBACK=fitandsleek://payment/callback
```

### Chat AI — Hugging Face Space

https://huggingface.co/spaces/Kalapak/fitandsleekAIchat

```env
CHATBOT_PROVIDER=huggingface
CHATBOT_HF_URL=https://kalapak-fitandsleekaichat.hf.space
CHATBOT_HF_TOKEN=
CHATBOT_HF_PROTOCOL=call
CHATBOT_HF_FN_INDEX=7
CHATBOT_HF_SEND_HISTORY=true
CHATBOT_HF_TIMEOUT=120
CHATBOT_HF_HISTORY_TURNS=6
HF_CHAT_SPACE_ID=Kalapak/fitandsleekAIchat
```

### Image scan search — Vector Space

https://huggingface.co/spaces/Kalapak/fitandsleek-vector  
Docs: `docs/ai/huggingface-vector-space.md`

```env
FITANDSLEEK_VECTOR_URL=https://kalapak-fitandsleek-vector.hf.space
FITANDSLEEK_VECTOR_API_KEY=fsv_PASTE_YOUR_KEY
QDRANT_COLLECTION=products_fitandsleek_512
QDRANT_VECTOR_SIZE=512
IMAGE_SEARCH_TIMEOUT=90
VECTOR_PROVIDER=fitandsleek_vector
QDRANT_SETUP_ON_BOOT=false
QDRANT_INDEX_MISSING_ON_BOOT=false
```

Do **not** set legacy `QDRANT_URL` / `FITANDSLEEK_CLIP_ENDPOINT` to Docker or Qdrant Cloud unless you intentionally override. `FITANDSLEEK_VECTOR_URL` is enough.

After first deploy (Railway shell / one-off):

```bash
php artisan qdrant:setup
php artisan qdrant:index-products
php artisan qdrant:diagnose
```

### Telegram (optional)

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_NAME=fitandsleek_bot
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_WEBHOOK_URL=https://fitandsleek-official-production.up.railway.app
TELEGRAM_ADMIN_CHAT_ID=
```

Then: `php artisan telegram:set-webhook`

## Performance (slow storefront)

Measured pattern: `/api/health` ~0.3s, but first `/api/homepage/bootstrap` or `/api/products` after idle can be **2–9s** while Neon wakes and cache rebuilds. After warm: ~0.5–0.7s.

### 1) Neon Free (biggest cold delay)

Free projects **suspend** after idle. Every storefront click then waits for DB wake.

Do one of:

- **Upgrade Neon** (Launch/Pro) and keep the compute endpoint **active** (disable scale-to-zero / set min CU > 0), **or**
- Stay on Free and accept cold spikes; mitigate with keep-warm (below) — never as good as paid Neon.

Prefer Neon region **Singapore / ap-southeast-1** (already used if host contains `ap-southeast-1`).

### 2) Railway Trial / Hobby

- Keep the service **deployed and awake** (Hobby does not sleep like old free tiers if the project has credit).
- Deploy region as close to Neon as possible (**Southeast Asia** if offered).
- Required vars:

```env
CACHE_STORE=database
QUEUE_CONNECTION=database
SESSION_DRIVER=database
```

Then once (Railway shell / one-off):

```bash
php artisan migrate --force   # only if cache/sessions tables missing
php artisan storefront:warm
php artisan qdrant:diagnose   # optional
```

Confirm:

```bash
curl -sS -o /dev/null -w 'bootstrap %{http_code} %{time_total}s\n' \
  https://fitandsleek-official-production.up.railway.app/api/homepage/bootstrap
# second run should be clearly faster than the first after a long idle
```

### 3) Keep-warm (optional)

Ping health + bootstrap every ~10 minutes (GitHub Actions `workflow` scope required to add `.github/workflows/keep-warm.yml`). This reduces Neon suspends and keeps bootstrap cache hot. It does **not** replace a paid Neon compute that never sleeps.

### 4) Do not move for speed (yet)

- Netlify (static) — fine  
- R2 — fine  
- Hugging Face chat/vector — only affect those features  

VPS is optional later (Laravel+Redis in Singapore). Fix Neon + `CACHE_STORE=database` first.

### 5) Frontend (already in repo when deployed)

Shorter `wakeBackend`, session cache for PLP/PDP, lazy product images. Redeploy Netlify after pushing those commits.



## Verify

```bash
curl -sS "https://fitandsleek-official-production.up.railway.app/api/health"
curl -sS "https://fitandsleek.online/api/health"
php artisan chat-ai:diagnose --ping-chat
php artisan qdrant:diagnose
```
