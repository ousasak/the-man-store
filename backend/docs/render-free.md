# Render Free — backend deploy (The Man Store)

Production API is proxied from Netlify (`fitandsleek.online/api/*`) to **one** Render web service. Use the same hostname everywhere (Netlify `_redirects`, `APP_URL`, OAuth redirect URIs, mobile `API_BASE_URL`).

**Canonical backend URL (current):** `https://fitandsleek-official.onrender.com`

## Why Netlify shows 502 on `/api/*`

- **502 + `x-render-routing: no-deploy`** — no successful deploy on that service (build failed or never deployed).
- **503 + `x-render-routing: suspend`** — Free tier spun down; first request wakes it (can take 30–60s).
- Netlify proxy errors in **~20–40ms** mean Render returned 502 immediately, not a slow Laravel boot.

**Verify:**

```bash
curl -sS "https://fitandsleek-official.onrender.com/api/health"
# expect: {"ok":true}  (HTTP 200)

curl -sS "https://fitandsleek.online/api/health"
# same JSON after proxy is correct
```

## Required secrets (Render dashboard → Environment)

| Variable | Notes |
|----------|--------|
| `APP_KEY` | `php artisan key:generate --show` |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `RESEND_API_KEY` | Mail |
| `RIELPAY_API_KEY` | KHQR |
| Google / Facebook OAuth client id + secret | |
| `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` | Or `AWS_*` aliases |
| `FITANDSLEEK_VECTOR_URL` | `https://kalapak-fitandsleek-vector.hf.space` (image scan search) |
| `FITANDSLEEK_VECTOR_API_KEY` | `fsv_…` from the Vector Space (or `QDRANT_API_KEY`) |
| `CHATBOT_HF_URL` (+ optional `CHATBOT_HF_*`) | Own Chat AI Space |

Set **`APP_URL`** to your Render service URL (no trailing slash), e.g. `https://fitandsleek-official.onrender.com`.

Set **`FRONTEND_URL`** to `https://www.fitandsleek.online` (or apex if that is canonical).

**OAuth:** `GOOGLE_REDIRECT_URI` and `FACEBOOK_REDIRECT_URI` must use **`APP_URL` + `/api/auth/.../callback`**.

## Light boot (Free tier — recommended)

Heavy boot (queue worker + scheduler + Qdrant indexing on every container start) often causes OOM, slow health checks, or failed deploys.

Set in Render **Environment** (defaults in `render.yaml`):

| Variable | Free value | Why |
|----------|------------|-----|
| `RUN_MIGRATIONS` | `false` | Run `php artisan migrate --force` manually after schema changes |
| `RUN_QUEUE_WORKER` | `false` | Use a separate worker service on paid plan, or run jobs via scheduler only when needed |
| `RUN_SCHEDULER` | `false` | Optional; enable on Starter if you need cron |
| `QDRANT_SETUP_ON_BOOT` | `false` | Run `qdrant:setup` once from shell |
| `QDRANT_INDEX_MISSING_ON_BOOT` | `false` | Index via `php artisan qdrant:index-products` when needed |

`QUEUE_CONNECTION=database` is fine; without `RUN_QUEUE_WORKER`, jobs stay queued until you process them manually or add a worker.

## After deploy is Live

1. **Health check path:** `/api/health` (Render service settings).
2. **Keep warm:** ping every 10 minutes, e.g. [cron-job.org](https://cron-job.org) → `GET https://fitandsleek-official.onrender.com/api/health`.
   Also ping `GET /api/homepage/bootstrap` — `/api/health` does not touch the storefront cache.
3. **Netlify:** redeploy frontend if you changed `_redirects` / `netlify.toml` proxy target.
4. Retire duplicate Render services (`fitandsleek-official-backend` vs `fitandsleek-official`) so only one URL is live.

## Netlify frontend build

If the site publishes **committed** `frontend/dist` without running `npm run build`, production will **not** pick up storefront fixes (API wake, fewer duplicate calls). Use repo-root **`netlify.toml`** (`base = frontend`, `publish = dist`) or set the same in the Netlify UI, then **Clear cache and deploy**.


- **Render Starter** — always-on, can set `RUN_QUEUE_WORKER=true` on a dedicated worker or enable scheduler.
- **Qdrant / CLIP** — run index jobs on deploy hook or CI, not on every Free boot.

## Telegram bot (`/start` silent but admin alerts work)

**Admin order alerts** = Laravel **sends** messages (outbound) → works if `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_ID` are set.

**Customer `/start`** = Telegram **POSTs webhook** (inbound) → Laravel must receive it, then reply. If webhook URL is wrong, old backend, or 502, the user sees **no reply** even though admin alerts still work.

On Render Shell (after deploy is Live):

```bash
php artisan telegram:webhook-info
php artisan telegram:set-webhook
```

Set `TELEGRAM_WEBHOOK_URL=https://fitandsleek-official.onrender.com` (same as `APP_URL`). Webhook URL is `…/api/telegram/webhook` with secret in header.

If `webhook-info` shows `last_error_message` (502, 404, SSL), fix Render/URL then run `set-webhook` again.
