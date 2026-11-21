# Fitandsleek AI: FAQ + DB + RAG + LLM

## Layout
```
app.py              Gradio UI
config.py           settings / env
services/
  db.py             Neon products & bestsellers
  store.py          FAQ / store_info.json
  rag.py            retrieve context
  chat.py           language + answers + LLM
  utils.py          shared helpers
data/
  store_info.json
  products.json
```

## Step 1 — FAQ (Knowledge Base)
Edit `data/store_info.json` (policies + `faq` keywords/answers).
Backup catalog: `data/products.json`.
AI reloads store info within ~10 seconds.

## Step 2 — Database
Set Neon URL in `.env`:
```
DATABASE_URL=postgresql://...
```
Used for products, stock, bestsellers.

## Step 3 — RAG + LLM
Local:
```powershell
.\venv\Scripts\activate
python app.py
```

Or Docker Desktop:
```powershell
docker compose up --build -d
```
Open http://127.0.0.1:7860  
Stop: `docker compose down`

Flow: FAQ fast-path → else retrieve FAQ/DB (RAG) → Qwen answers (Khmer or English).

## Notes
- Stack: Knowledge Base + Database + RAG + LLM (no LoRA train needed).
- Edit JSON under `data/` to update store knowledge quickly.
