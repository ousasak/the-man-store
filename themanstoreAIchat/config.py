"""App paths and runtime settings."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
PRODUCTS_FILE = BASE_DIR / "data" / "products.json"
STORE_INFO_FILE = BASE_DIR / "data" / "store_info.json"

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "fitandsleek_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "")
DB_PORT = os.getenv("DB_PORT", "5432")

DB_CACHE_TTL_SEC = 30
STORE_CACHE_TTL_SEC = 10
# With Gradio type="messages", each role is one list item — keep ~4 exchanges
MAX_HISTORY_TURNS = int(os.getenv("MAX_HISTORY_TURNS", "8"))
# Idle timeout for conversation memory (product focus / follow-ups). Default 10 minutes.
SESSION_TIMEOUT_SECONDS = int(os.getenv("SESSION_TIMEOUT_SECONDS", "600"))
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "64"))
PRODUCT_LIMIT = int(os.getenv("PRODUCT_LIMIT", "40"))
LOT_LIMIT = int(os.getenv("LOT_LIMIT", "20"))

ASSISTANT_NAME = "The Man Store AI Assistant"
MODEL_ID = os.getenv("MODEL_ID", "Qwen/Qwen2.5-3B-Instruct").strip()
HF_TOKEN = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN") or None
FORCE_CPU = os.getenv("FORCE_CPU", "").strip().lower() in {"1", "true", "yes"}
USE_LLM = os.getenv("USE_LLM", "0").strip().lower() in {"1", "true", "yes"}
LORA_ADAPTER = os.getenv("LORA_ADAPTER", "").strip()
PORT = int(os.getenv("PORT", "7860"))
