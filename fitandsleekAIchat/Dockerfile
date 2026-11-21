# Fitandsleek AI — Gradio chat (FAQ + DB + RAG + LLM)
FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=7860 \
    HF_HOME=/cache/huggingface \
    TRANSFORMERS_CACHE=/cache/huggingface \
    FORCE_CPU=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Prefer CUDA torch when GPU is available in the container; falls back to CPU wheels otherwise.
COPY requirements.txt .
RUN pip install --upgrade pip \
    && (pip install torch --index-url https://download.pytorch.org/whl/cu128 \
        || pip install torch --index-url https://download.pytorch.org/whl/cpu) \
    && grep -vE '^(torch|#|$)' requirements.txt > /tmp/reqs.txt \
    && pip install -r /tmp/reqs.txt

COPY app.py config.py ./
COPY services ./services
COPY data ./data

EXPOSE 7860

CMD ["python", "app.py"]
