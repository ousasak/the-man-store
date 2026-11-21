# The Man Store image search — Vector Space

> Space: https://huggingface.co/spaces/Kalapak/themanstore-vector  
> Host: https://kalapak-themanstore-vector.hf.space  
> Updated: 2026-08-03

## What it replaces

| Before | Now |
|---|---|
| External CLIP embed + Qdrant Cloud | **One** Space: embed + Qdrant-compatible API |

Laravel still uses `ImageSearchService` (embed → search → product IDs). Only URLs + API key change.

## Get an API key

1. Open the Space (must be **Running**)
2. Register / login via `/docs` → `/auth/register` or the Space UI
3. Create an API key (`fsv_…`)
4. Send it as header: `api-key: fsv_…` (same style as Qdrant Cloud)

## Env (local + Render)

```env
FITANDSLEEK_VECTOR_URL=https://kalapak-themanstore-vector.hf.space
FITANDSLEEK_VECTOR_API_KEY=fsv_your_key_here
# or:
# QDRANT_API_KEY=fsv_your_key_here

QDRANT_COLLECTION=products_themanstore_512
QDRANT_VECTOR_SIZE=512
IMAGE_SEARCH_TIMEOUT=90
```

Defaults (if you only set `FITANDSLEEK_VECTOR_URL`):

- Embed: `{URL}/embed/image`
- Collections/search: `{URL}` (Qdrant-compatible paths)

`FITANDSLEEK_VECTOR_URL` wins over a legacy `QDRANT_URL` (e.g. local Docker). Use `QDRANT_URL_OVERRIDE` only if search must hit a different host than embed.

## Index products (required once)

```bash
cd backend
php artisan config:clear
php artisan qdrant:diagnose
php artisan qdrant:setup
php artisan qdrant:index-products
# later: php artisan qdrant:index-products --only-missing
```

Without indexing, scan-to-search has nothing to match.

## Verify

```bash
curl -sS -H "api-key: fsv_…" https://kalapak-themanstore-vector.hf.space/healthz
curl -sS -H "api-key: fsv_…" https://kalapak-themanstore-vector.hf.space/collections
```

Then try **image search** in the storefront / mobile app.

## Notes

- Free HF Spaces can sleep — first request after idle may be slow (`IMAGE_SEARCH_TIMEOUT=90`).
- Space embedding model is `themanstore-vision-v1` (512-d). Re-index if you change the model.
- Chat AI is separate: [huggingface-chat-space.md](./huggingface-chat-space.md)
