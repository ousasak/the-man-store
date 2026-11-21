#!/usr/bin/env bash
# Index products into Qdrant using production credentials (no Render Shell needed).
# 1. Copy DATABASE_URL, QDRANT_*, FITANDSLEEK_CLIP_* from Render dashboard into backend/.env
# 2. Run: ./scripts/index-qdrant-production.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required_any_db=(
  DATABASE_URL
  DB_HOST
)

has_db=false
for key in "${required_any_db[@]}"; do
  if grep -q "^${key}=" .env 2>/dev/null; then
    has_db=true
    break
  fi
done

if [ "$has_db" = false ]; then
  echo "Missing database config in backend/.env (DATABASE_URL or DB_HOST)."
  exit 1
fi

for key in QDRANT_URL QDRANT_API_KEY FITANDSLEEK_CLIP_ENDPOINT; do
  if ! grep -q "^${key}=" .env 2>/dev/null; then
    echo "Missing ${key} in backend/.env — copy from Render → Environment."
    exit 1
  fi
done

echo "Ensuring Qdrant collection..."
php artisan qdrant:setup

echo "Indexing all active products with images (this may take a while)..."
php artisan qdrant:index-products

echo ""
php artisan qdrant:diagnose
