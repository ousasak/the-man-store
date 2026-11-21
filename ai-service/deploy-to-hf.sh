#!/usr/bin/env bash
set -euo pipefail

SPACE_REPO="https://huggingface.co/spaces/Kalapak/fitandsleek-clip"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${TMPDIR:-/tmp}/fitandsleek-clip-hf"

if [[ -z "${HF_TOKEN:-}" ]]; then
  echo "Set HF_TOKEN (Hugging Face write token), e.g.:"
  echo "  export HF_TOKEN=hf_xxxxxxxx"
  exit 1
fi

if [[ ! -d "$WORK_DIR/.git" ]]; then
  git clone "$SPACE_REPO" "$WORK_DIR"
fi

cp "$SCRIPT_DIR/main.py" \
   "$SCRIPT_DIR/requirements.txt" \
   "$SCRIPT_DIR/Dockerfile" \
   "$SCRIPT_DIR/README.md" \
   "$SCRIPT_DIR/.dockerignore" \
   "$WORK_DIR/"

rm -f "$WORK_DIR/app.py"

cd "$WORK_DIR"
git add -A
if git diff --cached --quiet; then
  echo "No changes to push."
else
  git commit -m "Deploy CLIP vectorize service for The Man Store image search"
fi

git push "https://Kalapak:${HF_TOKEN}@huggingface.co/spaces/Kalapak/fitandsleek-clip" main

echo ""
echo "Pushed. Wait ~10-20 min, then check:"
echo "  https://kalapak-fitandsleek-clip.hf.space/health"
