# Hugging Face Docker Space (port 7860). Local docker-compose overrides CMD to port 8000.
FROM python:3.11-slim

RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"
ENV HF_HOME="/home/user/.cache/huggingface"

WORKDIR /app

COPY --chown=user requirements.txt requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY --chown=user main.py main.py

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
