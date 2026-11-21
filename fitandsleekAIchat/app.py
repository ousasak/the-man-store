"""The Man Store AI — Gradio entrypoint."""
from __future__ import annotations

import inspect
import json
import sys

# On Hugging Face ZeroGPU, `spaces` must be imported before CUDA packages.
try:
    import spaces  # noqa: F401
except ImportError:
    spaces = None

import gradio as gr

import config
from services.chat import (
    message_text,
    predict as predict_core,
    update_product_focus_after_turn,
)

try:
    from services.chat import normalize_cached_focus
except ImportError:
    try:
        from services.chat import _normalize_cached_focus as normalize_cached_focus
    except ImportError:

        def normalize_cached_focus(cached_focus):
            """Fallback if older chat.py has no helper yet."""
            if not cached_focus or not isinstance(cached_focus, dict):
                return None
            focus = dict(cached_focus)
            cat = focus.get("category")
            if isinstance(cat, list) and len(cat) >= 3:
                focus["category"] = (cat[0], cat[1], tuple(cat[2]))
            return focus


# Fix Windows console encoding for Khmer / Unicode output
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def _focus_for_state(focus):
    """JSON-safe State payload (tuples → lists) so Gradio never treats it as chat media."""
    if not focus or not isinstance(focus, dict):
        return None
    try:
        return json.loads(json.dumps(focus, default=list))
    except (TypeError, ValueError):
        out = dict(focus)
        cat = out.get("category")
        if isinstance(cat, tuple):
            out["category"] = [cat[0], cat[1], list(cat[2]) if len(cat) > 2 else []]
        return out


def chat(message, history, product_focus=None, request: gr.Request = None):
    """
    Gradio chat entry with explicit product-focus State.

    State survives across turns in the browser tab so follow-ups like
    «have size 20?» still know the prior product.

    `request` is injected by Gradio (session_hash). Without it, every website
    caller shares session_id "default" and inherits another shopper's colors.
    """
    product_focus = normalize_cached_focus(product_focus)
    reply = predict_core(message, history, product_focus=product_focus, request=request)

    text = message_text(message).strip()
    new_focus = update_product_focus_after_turn(text, history or [], product_focus)
    phrase = (new_focus or {}).get("phrase") if isinstance(new_focus, dict) else None
    print(
        f"[chat] hist={len(history or [])} focus={phrase!r} msg={text[:80]!r}",
        flush=True,
    )
    # Must return (message, *additional_outputs) — keep focus out of chatbot content
    return reply, _focus_for_state(new_focus)


def _accepts(fn, name: str) -> bool:
    try:
        return name in inspect.signature(fn).parameters
    except (TypeError, ValueError):
        return False


product_focus_state = gr.State(None)

_chatbot_kwargs = {"height": 560}
if _accepts(gr.Chatbot.__init__, "render_markdown"):
    _chatbot_kwargs["render_markdown"] = True
# Gradio 5.x only — messages format avoids tuples postprocess bugs with State
if _accepts(gr.Chatbot.__init__, "type"):
    _chatbot_kwargs["type"] = "messages"

_ci_kwargs = {
    "fn": chat,
    "additional_inputs": [product_focus_state],
    "additional_outputs": [product_focus_state],
    "additional_inputs_accordion": gr.Accordion(visible=False, open=False),
    "title": "The Man Store AI Assistant",
    "description": (
        "Ask in Khmer or English about The Man Store products, prices, stock, "
        "payment, and delivery. / សួរជាភាសាខ្មែរ ឬអង់គ្លេសបាន។"
    ),
    # With additional_inputs, each example is [message, *additional_input_values]
    "examples": [
        ["សួស្តី!", None],
        ["Hello", None],
        ["How to order?", None],
        ["How can I pay?", None],
        ["What is your return policy?", None],
        ["មានអាវទេ?", None],
        ["Which size should I choose?", None],
    ],
    "chatbot": gr.Chatbot(**_chatbot_kwargs),
    "concurrency_limit": None,
}
# HF Spaces defaults cache_examples=True; with State outputs that crashes
# chatbot postprocess (focus dict mistaken for message / file alt_text).
if _accepts(gr.ChatInterface.__init__, "cache_examples"):
    _ci_kwargs["cache_examples"] = False
if _accepts(gr.ChatInterface.__init__, "type"):
    _ci_kwargs["type"] = "messages"

demo = gr.ChatInterface(**_ci_kwargs)

demo.queue(default_concurrency_limit=8)


if __name__ == "__main__":
    # Lazy-load LLM on first need (avoids startup crash from background warmup)
    # Note: do not pass footer_links — unsupported on Gradio 5.x (HF Spaces sdk_version)
    demo.launch(
        server_name="0.0.0.0",
        server_port=config.PORT,
    )
