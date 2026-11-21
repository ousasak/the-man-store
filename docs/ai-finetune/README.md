# Fine-tune The Man Store chat (Colab) — Step 2

Use this **after** Laravel + Ollama chat works in production/dev.

## Goal

Teach the base model (Qwen) The Man Store tone + Khmer/English support phrases.  
**Does not replace** live DB facts from Laravel.

## Files

| File | Purpose |
|---|---|
| `themanstore-chat-samples.jsonl` | Starter Q&A pairs (expand to 200–1000+) |
| This README | How to fine-tune on Google Colab |

## Format

Each line is one chat example:

```json
{"messages":[{"role":"system","content":"..."},{"role":"user","content":"..."},{"role":"assistant","content":"..."}]}
```

## Colab outline (LoRA / QLoRA)

1. Open Google Colab (GPU runtime — T4 is enough for 7B QLoRA).
2. Install: `unsloth` or `trl` + `peft` + `transformers`.
3. Load base: `Qwen/Qwen2.5-7B-Instruct` (or smaller if VRAM limited).
4. Train on your expanded `.jsonl` (3–5 epochs, LoRA r=16).
5. Export merged GGUF **or** LoRA adapters.
6. Import into Ollama:

```bash
# Example after you have a GGUF / Modelfile
ollama create themanstore-chat -f Modelfile
```

7. Point Laravel to the new model:

```env
OLLAMA_MODEL=themanstore-chat
```

8. Run:

```bash
cd backend && php artisan ollama:diagnose --ping-chat
```

## Expand the dataset

Add real examples from:
- Admin questions you ask often
- FAQ answers (from Admin → FAQ)
- Customer chatbot transcripts (scrub PII)

Aim for balanced **Khmer + English**.

## Do NOT put in training data

- Live daily order counts / revenue (those change — come from Laravel)
- Customer PII (emails, phones, addresses)
- API keys
