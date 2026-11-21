---
title: The Man Store CLIP
emoji: 🔍
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

CLIP image vectorization (`clip-ViT-B-32`, 512 dimensions) for [The Man Store](https://fitandsleek.online) image search.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Service health |
| `/vectorize` | POST | Multipart field `image` → `{ "vector": [...] }` |
