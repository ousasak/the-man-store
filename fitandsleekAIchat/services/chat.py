"""Chat orchestration: language, FAQ/product fast-path, LLM replies."""
from __future__ import annotations

import os
import re
import threading

import torch

import config
from services import session_memory
from services.db import get_db_products, get_top_sellers
from services.rag import retrieve_rag_context
from services.store import (
    fill_store_answer,
    load_json_products,
    load_store_info,
    match_faq_answer,
    store_template_vars,
)
from services.text_analytics import clean_text
from services.taxonomy import (
    apply_taxonomy_typos,
    category_tuple_from_match,
    color_display,
    color_search_tokens,
    detect_brand_name,
    detect_color_keys,
    match_product_type,
    related_color_ids,
    soft_sell_miss,
    wear_when_answer,
)
from services.utils import (
    has_khmer,
    is_bestseller_question,
    message_text,
    needs_product_data,
)

try:
    import spaces
except ImportError:
    spaces = None

ON_ZERO_GPU = (
    spaces is not None and bool(os.getenv("SPACES_ZERO_GPU")) and not config.FORCE_CPU
)

torch.set_num_threads(max(1, min(8, os.cpu_count() or 2)))
USE_CUDA = torch.cuda.is_available() and not config.FORCE_CPU

# Lazy-loaded — importing chat must stay fast so Gradio / instant paths are not blocked
tokenizer = None
model = None
_model_device = "cpu"
_model_lock = threading.Lock()
_model_loading = False


def ensure_model_loaded():
    """Load Qwen only when an LLM reply is actually needed."""
    global tokenizer, model, _model_device, _model_loading
    if model is not None and tokenizer is not None:
        return
    with _model_lock:
        if model is not None and tokenizer is not None:
            return
        from transformers import AutoModelForCausalLM, AutoTokenizer

        print(f"Loading Model: {config.MODEL_ID} ...")
        dtype = torch.float16 if USE_CUDA else torch.float32
        print(f"Device: {'cuda:' + torch.cuda.get_device_name(0) if USE_CUDA else 'cpu'}")
        tokenizer = AutoTokenizer.from_pretrained(
            config.MODEL_ID, token=config.HF_TOKEN
        )
        model = AutoModelForCausalLM.from_pretrained(
            config.MODEL_ID,
            token=config.HF_TOKEN,
            dtype=dtype,
            low_cpu_mem_usage=True,
            device_map="cuda" if USE_CUDA else None,
        )
        model.eval()
        _model_device = "cuda" if USE_CUDA else "cpu"

        if config.LORA_ADAPTER:
            adapter_path = config.LORA_ADAPTER
            if not os.path.isabs(adapter_path):
                adapter_path = str(config.BASE_DIR / adapter_path)
            if os.path.isdir(adapter_path):
                try:
                    from peft import PeftModel

                    model = PeftModel.from_pretrained(model, adapter_path)
                    model.eval()
                    print(f"Loaded LoRA adapter: {adapter_path}")
                except Exception as error:
                    print(f"Could not load LoRA adapter ({adapter_path}): {error}")
            else:
                print(f"LORA_ADAPTER path not found: {adapter_path}")
        print("Model ready.")


def gpu_task(func):
    if not ON_ZERO_GPU:
        return func
    return spaces.GPU(duration=30)(func)


def iter_history_turns(history):
    """
    Yield (role, text) from Gradio history.
    Supports dict messages, Gradio ChatMessage objects, and legacy [user, bot] pairs.
    """
    for item in history or []:
        if item is None:
            continue
        # Gradio 5/6 ChatMessage (not a dict)
        if hasattr(item, "role") and hasattr(item, "content") and not isinstance(
            item, (dict, list, tuple, str)
        ):
            role = getattr(item, "role", None)
            content = message_text(getattr(item, "content", None))
            if role in ("user", "assistant") and content:
                yield role, content
            continue
        if isinstance(item, dict):
            role = item.get("role")
            content = message_text(item.get("content"))
            if role in ("user", "assistant") and content:
                yield role, content
            continue
        if isinstance(item, (list, tuple)) and len(item) == 2:
            u, a = message_text(item[0]), message_text(item[1])
            if u:
                yield "user", u
            if a:
                yield "assistant", a


def history_user_texts(history):
    return [text for role, text in iter_history_turns(history) if role == "user"]


def history_recent_blob(history, max_msgs=8, user_only=False):
    """Flatten recent user+assistant text for topic detection."""
    turns = list(iter_history_turns(history))[-max_msgs:]
    if user_only:
        turns = [(r, t) for r, t in turns if r == "user"]
    return "\n".join(text for _role, text in turns).lower()


# Fee / charge follow-ups (Khmer + English)
FEE_ASK_MARKERS = (
    "\u1782\u17b7\u178f\u179b\u17bb\u1799",  # គិតលុយ
    "\u1782\u17b7\u178f\u179f\u17c1\u179c\u17b6",  # គិតសេវា
    "\u1782\u17b7\u178f\u1790\u17d2\u179b\u17c3",  # គិតថ្លៃ
    "\u1790\u17d2\u179b\u17c3\u1791\u17c1",  # ថ្លៃទេ
    "\u179f\u17c1\u179c\u17b6\u1791\u17c1",  # សេវាទេ
    "\u17a5\u178f\u1782\u17b7\u178f",  # ឥតគិត
    "fee",
    "charge",
    "service fee",
    "service charge",
    "free?",
    "how much",
)

# Full shop questions — never treat as short topic follow-ups
_STANDALONE_INTENTS = (
    "how to order",
    "how to buy",
    "how do i order",
    "how do i buy",
    "how can i order",
    "how can i buy",
    "how to pay",
    "how can i pay",
    "how to return",
    "how to exchange",
    "place order",
    "track order",
    "track my order",
    "របៀបទិញ",
    "របៀបកម្មង់",
    "ទិញយ៉ាងម៉េច",
    "ទិញម៉េច",
    "កម្មង់ម៉េច",
    "បង់ម៉េច",
    "តាមដានកម្មង់",
)


def has_standalone_shop_intent(text):
    cleaned = re.sub(r"\s+", " ", (text or "").strip().lower())
    return any(k in cleaned for k in _STANDALONE_INTENTS)


def detect_chat_topic(history):
    """Infer active shopping topic from recent USER turns (not assistant menus)."""
    blob = history_recent_blob(history, user_only=True)
    if not blob:
        return None
    topics = [
        (
            "return",
            (
                "ប្តូរ",
                "ដូរ",
                "ត្រឡប់",
                "return",
                "exchange",
                "refund",
                "សងលុយ",
                "replacement",
                "ផ្លាស់ប្តូរ",
                "ខូច",
            ),
            "ប្តូរ/ត្រឡប់ទំនិញ",
            "return/exchange",
        ),
        (
            "delivery",
            (
                "ដឹក",
                "delivery",
                "shipping",
                "ថ្លៃដឹក",
                "ship",
                "courier",
                "when arrive",
            ),
            "ដឹកជញ្ជូន",
            "delivery/shipping",
        ),
        (
            "payment",
            ("បង់", "ទូទាត់", "payment", "khqr", "visa", "bakong", "checkout"),
            "ការទូទាត់",
            "payment",
        ),
        (
            "size",
            ("ទំហំ", "size", "sizing", "xl", "xxl"),
            "ទំហំ",
            "sizing",
        ),
    ]
    # Prefer the most recent matching topic by scanning from the end
    best = None
    best_pos = -1
    for tid, keys, label_km, label_en in topics:
        for k in keys:
            pos = blob.rfind(k.lower())
            if pos > best_pos:
                best_pos = pos
                best = {
                    "id": tid,
                    "label_km": label_km,
                    "label_en": label_en,
                }
    return best


def is_short_followup(text):
    """Short replies that usually continue the previous topic."""
    cleaned = re.sub(r"\s+", " ", (text or "").strip().lower())
    if not cleaned:
        return False
    if has_standalone_shop_intent(cleaned):
        return False
    bare = re.sub(r"[^\w\s\u1780-\u17FF]", "", cleaned)
    if len(bare) > 48:
        return False
    markers = FEE_ASK_MARKERS + (
        "how long",
        "and?",
        "what about",
        "how about",
        "\u17a0\u17be\u1799",
        "\u1785\u17bb\u17c7",
        "\u1794\u17c9\u17bb\u1793\u17d2\u1798\u17b6\u1793",
        "\u1796\u17c1\u179b\u178e\u17b6",
        "\u1799\u17b6\u17c4\u1784\u1798\u17c9\u17c1\u1785",
        "\u1798\u17c9\u17c1\u1785\u178a\u17c2\u179a",
        "\u1791\u17c1?",
        "\u1794\u17b6\u1793\u1791\u17c1",
        "\u1798\u17c2\u1793\u1791\u17c1",
        "really",
        "sure?",
        "ok?",
        "then?",
    )
    if any(m in cleaned for m in markers):
        return True
    return len(bare) <= 18 and (
        cleaned.endswith("?")
        or cleaned.endswith("\u17d6")
        or "\u1791\u17c1" in cleaned
        or "\u17a2\u178f\u17cb" in cleaned
    )


def expand_with_chat_context(text, history, lang="km"):
    """Rewrite short follow-ups using the prior topic so FAQ/routing stay correct."""
    if not history or not is_short_followup(text):
        return text
    if has_standalone_shop_intent(text):
        return text
    topic = detect_chat_topic(history)
    if not topic:
        return text
    label = topic["label_en"] if lang == "en" else topic["label_km"]
    blob_check = text.lower()
    if topic["id"] == "return" and any(
        k in blob_check
        for k in (
            "\u1794\u17d2\u178f\u17bc\u179a",
            "\u178a\u17bc\u179a",
            "\u178f\u17d2\u179a\u17a1\u1794\u17cb",
            "return",
            "exchange",
            "refund",
        )
    ):
        return text
    if topic["id"] == "delivery" and any(
        k in blob_check for k in ("\u178a\u17b9\u1780", "delivery", "shipping")
    ):
        return text
    if topic["id"] == "payment" and any(
        k in blob_check
        for k in ("\u1794\u1784\u17cb", "payment", "khqr", "pay")
    ):
        return text
    if topic["id"] == "return":
        if any(k in blob_check for k in FEE_ASK_MARKERS) or "free" in blob_check:
            return f"{text} \u1794\u17d2\u178f\u17bc\u179a\u1782\u17b7\u178f\u179b\u17bb\u1799 return fee"
        return f"{text} {label} \u1794\u17d2\u178f\u17bc\u179a return"
    return f"{text} ({label})"


def _session_id_from_request(request) -> str:
    if request is None:
        return "default"
    sid = getattr(request, "session_hash", None)
    if sid:
        return str(sid)
    client = getattr(request, "client", None)
    if client is not None:
        host = getattr(client, "host", None)
        if host:
            return str(host)
    return "default"


def effective_history(history, session_id: str):
    """
    Keep Gradio history for follow-ups, unless this session idled past timeout.

    Important: a missing server session must NOT wipe Gradio history — that
    happens on first message / after restart and was dropping product context.
    """
    if session_memory.idle_expired(session_id):
        session_memory.clear(session_id)
        return []
    return history or []


def history_has_product_mention(history) -> bool:
    """True when a prior user turn named a product type / brand (not just «អាវនេះ»)."""
    for role, text in iter_history_turns(history or []):
        if role != "user":
            continue
        cleaned = normalize_khmer_digits(text or "").lower()
        # Strip pronouns so «អាវនេះ» alone doesn't count as naming a product
        probe = (
            cleaned.replace("អាវនេះ", " ")
            .replace("ខោនេះ", " ")
            .replace("មួយនេះ", " ")
            .replace("ម៉ូដនេះ", " ")
            .replace("this one", " ")
            .replace("this shirt", " ")
            .replace("this item", " ")
            .replace("this product", " ")
        )
        if detect_wanted_category(probe) or detect_wanted_brand(probe):
            return True
    return False


def drop_stale_product_focus(history, product_focus):
    """Ignore server/session focus when this chat never named a product."""
    if not product_focus:
        return None
    if history_has_product_mention(history):
        return product_focus
    return None


def try_unresolved_product_reference(text, history, product_focus=None, lang="km"):
    """«មួយនេះមានពណ៌អ្វី?» with no prior product → ask which item."""
    cleaned = normalize_khmer_digits((text or "").strip().lower())
    if not looks_like_product_reference(cleaned):
        return None
    # Typed pronouns («ខោនេះ», «this shirt») already carry a category
    if detect_pronoun_category(cleaned):
        return None
    focus = extract_product_focus(
        history, cached_focus=drop_stale_product_focus(history, product_focus)
    )
    if focus.get("category") or (focus.get("phrase") or "").strip():
        return None
    if detect_wanted_category(cleaned):
        return None
    if lang == "en":
        return (
            "Of course — happy to check that for you 😊✨ "
            "Which piece do you mean — **T-shirt / អាវយឺត, shirt / អាវ, pants / ខោ, "
            "hoodie, or jacket / អាវក្រៅ**?\n"
            "Or tell me the product name — I’ll help right away.\n"
            f"{sweet_close('en')}"
        )
    return (
        "បានជាក់ជា — រីករាយជួយពិនិត្យ 😊✨ "
        "តើ «មួយនេះ» សំដៅ **អាវយឺត / T-shirt · អាវ / shirt · ខោ / pants · "
        "hoodie · ឬអាវក្រៅ / jacket**?\n"
        "ឬប្រាប់ឈ្មោះទំនិញ — ខ្ញុំជួយបន្តភ្លាមៗ។\n"
        f"{sweet_close('km')}"
    )


def wants_size_advice_ask(text):
    """«Which size should I choose?» / «ទំហំណាល្អ?» — body-based sizing help."""
    cleaned = normalize_khmer_digits(re.sub(r"\s+", " ", (text or "").strip().lower()))
    if not cleaned:
        return False
    cues = (
        "which size",
        "what size should",
        "what size do i",
        "size should i",
        "size should i choose",
        "recommend a size",
        "recommend size",
        "help me choose size",
        "help me pick size",
        "sizing help",
        "ទំហំណា",
        "ទំហំមួយណា",
        "យកទំហំណា",
        "ជ្រើសទំហំ",
        "គួរយកទំហំ",
        "ទំហំគួរ",
        "ណែនាំទំហំ",
        "ទំហំសម",
        "size guide",
        "what size for me",
    )
    return any(k in cleaned for k in cues)


def parse_weight_kg(text):
    cleaned = normalize_khmer_digits((text or "").lower())
    m = re.search(
        r"(?:ទម្ងន់|weight|wt|kg|គីឡូ|គក)\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)"
        r"|(\d{2,3}(?:\.\d+)?)\s*(?:kg|គីឡូ|គក)\b",
        cleaned,
        flags=re.IGNORECASE,
    )
    if not m:
        # Bare number in a size-advice / follow-up turn: 58, 70
        m2 = re.search(r"(?<!\d)([4-9]\d|1[0-2]\d)(?:\.\d+)?(?!\d)", cleaned)
        if m2 and any(
            k in cleaned
            for k in ("kg", "ទម្ងន់", "weight", "គីឡូ", "size", "ទំហំ", "កម្ពស់", "cm")
        ):
            try:
                return float(m2.group(1))
            except ValueError:
                return None
        return None
    raw = m.group(1) or m.group(2)
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return None
    if 30 <= val <= 200:
        return val
    return None


def parse_height_cm(text):
    cleaned = normalize_khmer_digits((text or "").lower())
    m = re.search(
        r"(?:កម្ពស់|height|ht|cm|សង់ទីម៉ែត្រ)\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)"
        r"|(\d{2,3}(?:\.\d+)?)\s*(?:cm|សង់ទីម៉ែត្រ)\b"
        r"|(\d)\s*[m'\u2019]\s*(\d{1,2})",
        cleaned,
        flags=re.IGNORECASE,
    )
    if not m:
        return None
    if m.lastindex and m.lastindex >= 3 and m.group(3) and m.group(4):
        # 1'70 or 1m70 style
        try:
            return float(m.group(3)) * 100 + float(m.group(4))
        except ValueError:
            return None
    raw = m.group(1) or m.group(2)
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return None
    if 120 <= val <= 220:
        return val
    return None


def recommend_apparel_size(weight_kg, height_cm=None, prefer=None):
    """
    Soft size suggestion from weight (+ optional height).
    Same bands as store sizing_note — not a medical/fit guarantee.
    """
    w = float(weight_kg)
    if w <= 55:
        base, alts = "S", ["S", "M"]
    elif w <= 68:
        base, alts = "M", ["M", "L"]
    elif w <= 85:
        base, alts = "L", ["L", "XL"]
    else:
        base, alts = "XL", ["XL", "XXL"]

    note_bits = []
    if height_cm is not None:
        h = float(height_cm)
        if h >= 180 and base in ("S", "M"):
            # Tall + light/medium → often prefer the roomier of the band
            base = alts[-1] if alts else base
            note_bits.append("tall")
        elif h <= 160 and base in ("L", "XL") and w <= 75:
            base = alts[0] if alts else base
            note_bits.append("shorter")

    prefer = (prefer or "").lower()
    if prefer in ("oversize", "oversized", "relaxed", "loose", "ធូរ"):
        bump = {"S": "M", "M": "L", "L": "XL", "XL": "XXL"}
        base = bump.get(base, base)
        note_bits.append("oversize")
    elif prefer in ("slim", "fitted", "តឹង", "slim fit"):
        note_bits.append("slim")

    return base, alts, note_bits


def try_size_advice_answer(text, history=None, lang="km", profile=None):
    """Ask kg + height, then suggest a size band (never invent stock)."""
    cleaned = normalize_khmer_digits(re.sub(r"\s+", " ", (text or "").strip().lower()))
    weight = parse_weight_kg(cleaned)
    height = parse_height_cm(cleaned)

    # Also read prior turns for weight/height follow-ups
    if weight is None or height is None:
        for role, prev in reversed(list(iter_history_turns(history or []))):
            if role != "user":
                continue
            weight = weight if weight is not None else parse_weight_kg(prev)
            height = height if height is not None else parse_height_cm(prev)
            if weight is not None and height is not None:
                break

    advising = wants_size_advice_ask(cleaned) or (
        weight is not None
        and any(k in cleaned for k in ("size", "ទំហំ", "kg", "ទម្ងន់", "កម្ពស់", "cm"))
    )
    if not advising and weight is None:
        return None
    # Follow-up like «65kg 170cm» after we asked for body measurements
    prior_size_ask = any(
        wants_size_advice_ask(prev)
        for role, prev in iter_history_turns(history or [])
        if role == "user"
    )
    if weight is not None and prior_size_ask:
        advising = True
    # Bare weight reply after we asked — still advise
    if not advising and weight is None:
        return None
    if not advising:
        return None

    prefer = None
    if any(k in cleaned for k in ("oversize", "oversized", "relaxed", "ធូរ", "over size")):
        prefer = "oversize"
    elif any(k in cleaned for k in ("slim", "fitted", "តឹង")):
        prefer = "slim"

    if weight is None:
        if lang == "en":
            return (
                "Of course — I’d love to help you find a flattering size 😊✨\n"
                "Please tell me:\n"
                "1️⃣ **Weight (kg)**\n"
                "2️⃣ **Height (cm)** — optional but helpful\n"
                "Also: prefer **slim** or **relaxed/oversize**?\n"
                "I’ll suggest a size band just for you — then we double-check the product size chart.\n"
                f"{sweet_close('en')}"
            )
        return (
            "បានជាក់ជា — រីករាយជួយរកទំហំស៊ីអ្នក 😊✨\n"
            "សូមប្រាប់ខ្ញុំ៖\n"
            "1️⃣ **ទម្ងន់ (kg / គីឡូ)**\n"
            "2️⃣ **កម្ពស់ (cm)** — បើមាន កាន់តែច្បាស់\n"
            "និងចូលចិត្ត **តឹង (slim)** ឬ **ធូរ / oversize**?\n"
            "ខ្ញុំនឹងណែនាំទំហំសម្រាប់អ្នក — រួចពិនិត្យ size chart នៅទំព័រផលិតផលម្ដងទៀត។\n"
            f"{sweet_close('km')}"
        )

    size, alts, notes = recommend_apparel_size(weight, height, prefer=prefer)
    alt_txt = " / ".join(alts)
    h_txt = f", height **{height:g} cm**" if height else ""
    h_txt_km = f", កម្ពស់ **{height:g} cm**" if height else ""

    tip = ""
    if "oversize" in notes:
        tip = (
            " (+1 toward relaxed/oversize)"
            if lang == "en"
            else " (ផ្អែកលើ oversize / ធូរ)"
        )
    elif "slim" in notes:
        tip = " (slim lean — check chart)" if lang == "en" else " (slim — ពិនិត្យ chart)"
    elif "tall" in notes:
        tip = " (taller frame — roomier lean)" if lang == "en" else " (ខ្ពស់ — ផ្អែកលើទំហំធូរបន្តិច)"

    cat = detect_wanted_category(cleaned)
    cat_bit = ""
    if cat:
        label = format_category_label(cat, lang=lang)
        cat_bit = f" for **{label}**" if lang == "en" else f" សម្រាប់ **{label}**"

    if lang == "en":
        return (
            f"Perfect — thanks for sharing! 😊 Based on **{weight:g} kg**{h_txt}{cat_bit}, "
            f"I’d start with size **{size}**{tip}.\n"
            f"Common band: **{alt_txt}** — this should suit you really well.\n"
            "Soft guide only — please confirm on the product **size chart**, "
            "and tell me slim vs oversize if you want a tighter pick.\n"
            "Wrong fit? No worries — exchange within 30 days (unused + tags) via My Orders or /support.\n"
            f"{sweet_close('en')}"
        )
    return (
        f"ល្អណាស់ — អរគុណដែលប្រាប់! 😊 តាម **{weight:g} kg**{h_txt_km}{cat_bit} "
        f"ខ្ញុំណែនាំចាប់ផ្តើមទំហំ **{size}**{tip}។\n"
        f"ជម្រើសជិតៗ៖ **{alt_txt}** — គិតថាស៊ីអ្នកល្អណាស់។\n"
        "នេះជាមគ្គុទ្ទេសក៍ទន់ — សូមពិនិត្យ **size chart** នៅទំព័រផលិតផល "
        "និងប្រាប់បើចង់ slim ឬ oversize។\n"
        "មិនសម? មិនបាច់បារម្ភ — ប្តូរបានក្នុង ៣០ ថ្ងៃ (មិនប្រើ+ស្លាក) តាម My Orders ឬ /support។\n"
        f"{sweet_close('km')}"
    )


def _normalize_cached_focus(cached_focus):
    """Restore category tuple shape from session storage."""
    if not cached_focus or not isinstance(cached_focus, dict):
        return None
    focus = dict(cached_focus)
    cat = focus.get("category")
    if isinstance(cat, list) and len(cat) >= 3:
        focus["category"] = (cat[0], cat[1], tuple(cat[2]))
    return focus


# Public alias for app.py / Gradio State (avoid importing private `_` name)
normalize_cached_focus = _normalize_cached_focus


def _normalize_customer_profile(profile):
    if not profile or not isinstance(profile, dict):
        return {}
    out = dict(profile)
    cat = out.get("category")
    if isinstance(cat, list) and len(cat) >= 3:
        out["category"] = (cat[0], cat[1], tuple(cat[2]))
    return out


def extract_product_focus(history, cached_focus=None):
    """Pull category / color / brand / size / budget from recent turns + profile."""
    focus = {
        "category": None,  # (label_km, label_en, terms)
        "colors": [],
        "brand": None,
        "phrase": "",
        "size": None,
        "budget": None,
        "occasion": None,
        "favorite_colors": [],
    }
    cached_focus = _normalize_cached_focus(cached_focus)
    if cached_focus:
        focus["category"] = cached_focus.get("category") or None
        focus["colors"] = list(cached_focus.get("colors") or [])
        focus["brand"] = cached_focus.get("brand") or None
        focus["phrase"] = cached_focus.get("phrase") or ""
        focus["size"] = cached_focus.get("size") or None
        focus["budget"] = cached_focus.get("budget")
        focus["occasion"] = cached_focus.get("occasion")
        focus["favorite_colors"] = list(cached_focus.get("favorite_colors") or [])

    user_blob_parts = []
    for role, text in reversed(list(iter_history_turns(history))):
        if role != "user":
            continue
        cleaned = normalize_khmer_digits(text or "").lower()
        user_blob_parts.append(cleaned)
        # Prefer newer user turns over stale cache when they name a product
        cat = detect_wanted_category(cleaned)
        colors = detect_wanted_colors(cleaned)
        brand = detect_wanted_brand(cleaned)
        size = detect_wanted_size(cleaned)
        budget = parse_budget_usd(cleaned)
        from services.customer_nlu import detect_preference_color

        pref_colors = detect_preference_color(cleaned)
        if cat or colors or brand:
            if cat:
                # Don't let a broader bucket (អាវ) wipe a specific prior type (T-shirt)
                prev = focus.get("category")
                if prev and cat != prev:
                    prev_terms = {str(t).lower() for t in (prev[2] if len(prev) > 2 else ())}
                    new_terms = {str(t).lower() for t in (cat[2] if len(cat) > 2 else ())}
                    specific = {"t-shirt", "tee", "អាវយឺត", "jean", "jeans", "hoodie", "polo"}
                    if (prev_terms & specific) and not (new_terms & specific):
                        cat = prev
                focus["category"] = cat
            if colors:
                focus["colors"] = colors
            if brand:
                focus["brand"] = brand
            if size:
                focus["size"] = size
            if budget is not None:
                focus["budget"] = budget
            if pref_colors:
                focus["favorite_colors"] = pref_colors
            bits = []
            if focus["colors"]:
                bits.append(focus["colors"][0])
            if focus["category"]:
                bits.append(_category_user_term(focus["category"], cleaned))
            if focus["brand"]:
                bits.append(focus["brand"])
            if focus["size"]:
                bits.append(str(focus["size"]))
            focus["phrase"] = " ".join(b for b in bits if b).strip()
            break
        if size and not focus["size"]:
            focus["size"] = size
        if budget is not None:
            focus["budget"] = budget
        if pref_colors:
            focus["favorite_colors"] = pref_colors

    if not focus["phrase"] and (focus["category"] or focus["colors"] or focus["brand"]):
        blob = " ".join(user_blob_parts)
        bits = []
        if focus["colors"]:
            bits.append(focus["colors"][0])
        elif focus["favorite_colors"]:
            bits.append(focus["favorite_colors"][0])
        if focus["category"]:
            bits.append(_category_user_term(focus["category"], blob))
        if focus["brand"]:
            bits.append(focus["brand"])
        focus["phrase"] = " ".join(b for b in bits if b).strip()
    return focus


def _category_user_term(cat, blob):
    """Prefer the word the shopper used (jeans vs pants)."""
    if not cat:
        return ""
    _km, _en, terms = cat
    cleaned = (blob or "").lower()
    for term in terms:
        if _term_in_text(term, cleaned):
            return term
    # Prefer a Latin catalog term when available
    for term in terms:
        if not re.search(r"[\u1780-\u17FF]", term):
            return term
    return terms[0] if terms else ""


def looks_like_product_followup(text):
    """Size / color / stock follow-ups that usually continue the last product."""
    cleaned = normalize_khmer_digits((text or "").strip().lower())
    cleaned = apply_taxonomy_typos(cleaned)
    if not cleaned:
        return False
    # Preference / emotion / vague turns — do not glue prior product phrase
    from services.customer_nlu import (
        detect_preference_color,
        detect_customer_emotion,
        is_style_discovery_ask,
        is_vague_shop_ask,
    )

    if detect_preference_color(cleaned):
        return False
    if detect_customer_emotion(cleaned) in ("angry", "hesitant"):
        return False
    if is_vague_shop_ask(cleaned) or is_style_discovery_ask(cleaned):
        return False
    # Pronoun / "this item" continues prior product focus
    if looks_like_product_reference(cleaned):
        return True
    # Bare price / size / stock continues prior product («តម្លៃ?» «ទំហំ?»)
    if is_bare_product_attr_ask(cleaned):
        return True
    # Bare color (blue / ble→blue) continues prior jean/shirt/etc.
    if detect_wanted_colors(cleaned) and not detect_wanted_category(cleaned):
        return True
    if detect_wanted_category(cleaned):
        return False  # already names a product type
    if detect_wanted_size(cleaned):
        return True
    if is_short_followup(cleaned) and (
        wants_availability_ask(cleaned)
        or wants_stock_ask(cleaned)
        or wants_buy_ask(cleaned)
        or wants_price_ask(cleaned)
        or any(
            k in cleaned
            for k in (
                "have",
                "got",
                "any",
                "available",
                "in stock",
                "\u1798\u17b6\u1793",
                "\u17a2\u178f\u17cb",
            )
        )
    ):
        return True
    return False


def is_bare_product_attr_ask(text):
    """«តម្លៃ?» / «ទំហំ?» / «price?» — attr follow-ups that need prior product focus."""
    cleaned = normalize_khmer_digits(re.sub(r"\s+", " ", (text or "").strip().lower()))
    if not cleaned or detect_wanted_category(cleaned):
        return False
    bare = re.sub(r"[^\w\s\u1780-\u17FF]", "", cleaned).strip()
    bare = re.sub(r"\s+", " ", bare)
    exact = {
        "តម្លៃ",
        "តម្លៃប៉ុន្មាន",
        "ថ្លៃ",
        "ថ្លៃប៉ុន្មាន",
        "ប៉ុន្មាន",
        "price",
        "prices",
        "how much",
        "cost",
        "ទំហំ",
        "ទំហំអ្វី",
        "ទំហំណា",
        "មានទំហំអ្វី",
        "size",
        "sizes",
        "sizing",
        "what size",
        "which size",
        "ពណ៌",
        "ពណ៌អ្វី",
        "ពណ៌ណា",
        "ពណ៌ខ្លះ",
        "មានពណ៌",
        "មានពណ៌អ្វី",
        "មានពណ៌អីខ្លះ",
        "មានពណ៌អ្វីខ្លះ",
        "color",
        "colors",
        "colour",
        "colours",
        "what color",
        "which color",
        "ស្តុក",
        "stock",
        "in stock",
    }
    if bare in exact:
        return True
    # Normalize color typos before attr checks
    color_norm = cleaned.replace("ពណ័", "ពណ៌").replace("ពណ៍", "ពណ៌")
    bare_c = re.sub(r"[^\w\s\u1780-\u17FF]", "", color_norm).strip()
    if bare_c in exact or bare_c in {"ពណ៌", "មានពណ៌អីខ្លះ", "មានពណ៌អ្វីខ្លះ"}:
        return True
    if len(bare) <= 28 and (
        wants_price_ask(cleaned)
        or wants_color_question(cleaned)
        or any(k in cleaned for k in ("ទំហំ", "sizing", "sizes", "ពណ៍", "ពណ័"))
        or wants_stock_ask(cleaned)
    ):
        if not detect_wanted_brand(cleaned) and not detect_wanted_size(cleaned):
            return True
        if any(k in bare for k in ("ទំហំ", "size", "sizing")) and not detect_wanted_size(
            cleaned
        ):
            return True
    return False


def looks_like_product_reference(text):
    """«អាវនេះ» / «this one» — resolve against conversation product focus."""
    cleaned = normalize_khmer_digits((text or "").strip().lower())
    if not cleaned:
        return False
    cues = (
        "អាវនេះ",
        "ខោនេះ",
        "មួយនេះ",
        "ទំនិញនេះ",
        "ផលិតផលនេះ",
        "ស្បែកជើងនេះ",
        "this one",
        "that one",
        "this shirt",
        "this item",
        "this product",
        "that shirt",
        "the one above",
        "ម៉ូដនេះ",
    )
    if any(k in cleaned for k in cues):
        return True
    # Bare «មានពណ៌អីខ្លះ?» is a color attr ask — not an unresolved «this item» cue
    return False


def expand_product_followup(text, history, product_focus=None):
    """
    Rewrite follow-ups like 'have size 20?' / 'blue' using the prior product
    (e.g. black jeans) so catalog / RAG search stays on-topic.
    """
    if not text:
        return text
    focus = extract_product_focus(history, cached_focus=product_focus)
    phrase = (focus.get("phrase") or "").strip()
    # Prefer favorite color in phrase when following up without a new color
    if not phrase and (focus.get("category") or focus.get("favorite_colors")):
        bits = []
        fav = focus.get("favorite_colors") or []
        cols = focus.get("colors") or fav
        if cols:
            bits.append(str(cols[0]).replace("_", " "))
        if focus.get("category"):
            bits.append(_category_user_term(focus["category"], text))
        phrase = " ".join(b for b in bits if b).strip()
    if not phrase:
        return text
    cleaned = normalize_khmer_digits(text or "").lower()
    cleaned = apply_taxonomy_typos(cleaned)
    needs_merge = looks_like_product_followup(text) or (
        bool(detect_wanted_size(cleaned)) and not detect_wanted_category(cleaned)
    )
    if not needs_merge:
        return text
    extra_bits = []
    for bit in phrase.split():
        if bit.lower() not in cleaned:
            extra_bits.append(bit)
    # For pronoun asks, also inject favorite color if missing
    if looks_like_product_reference(cleaned):
        for c in focus.get("favorite_colors") or []:
            token = str(c).replace("_", " ")
            if token and token.lower() not in cleaned and token not in extra_bits:
                extra_bits.append(token)
    if not extra_bits:
        return text
    # Keep typo fixes (ble→blue) on the merged follow-up
    return apply_taxonomy_typos(f"{text} {' '.join(extra_bits)}".strip())


def update_product_focus_after_turn(text, history, prev_focus=None):
    """Refresh cached product focus after each user message."""
    # Include current message as if already in history for extraction
    synthetic = list(history or []) + [{"role": "user", "content": text}]
    return extract_product_focus(synthetic, cached_focus=prev_focus)


def asks_fee_followup(text):
    cleaned = normalize_khmer_digits((text or "").lower())
    return any(k in cleaned for k in FEE_ASK_MARKERS) or "free" in cleaned


def try_exchange_care_answer(text, store_info, lang="km"):
    """Soft customer-care replies for exchange / change-product (never bare yes/no)."""
    cleaned = normalize_khmer_digits(re.sub(r"\s+", " ", (text or "").strip().lower()))
    cleaned = cleaned.replace("ដូរទំនិញ", "ប្តូរទំនិញ").replace("ដូរ", "ប្តូរ")
    if not cleaned:
        return None

    damage = any(
        k in cleaned
        for k in (
            "ខូច",
            "damaged",
            "broken",
            "defect",
            "មានបញ្ហា",
            "torn",
            "stain",
        )
    )
    size_issue = any(
        k in cleaned
        for k in (
            "ទំហំ",
            "size",
            "តូច",
            "ធំ",
            "too small",
            "too big",
            "wrong size",
            "មិនសម",
            "តឹង",
            "ធូរ",
        )
    ) and any(
        k in cleaned
        for k in (
            "ប្តូរ",
            "exchange",
            "change",
            "replace",
            "ផ្លាស់",
            "តូចពេក",
            "ធំពេក",
            "wrong size",
            "too small",
            "too big",
        )
    )
    color_issue = any(
        k in cleaned
        for k in ("ពណ៌", "color", "colour")
    ) and any(
        k in cleaned
        for k in ("ប្តូរ", "exchange", "change", "wrong", "មិនត្រូវ", "មិនដូច")
    )
    cannot = any(
        k in cleaned
        for k in (
            "មិនអាចប្តូរ",
            "cannot exchange",
            "can't exchange",
            "not eligible",
            "no exchange",
        )
    )
    exchange_ask = any(
        k in cleaned
        for k in (
            "ប្តូរ",
            "ផ្លាស់ប្តូរ",
            "exchange",
            "replacement",
            "replace",
            "change product",
            "change item",
            "swap",
            "return",
            "ត្រឡប់",
            "សងលុយ",
            "refund",
        )
    )
    if not (exchange_ask or damage or size_issue or color_issue):
        return None

    if cannot:
        key = "exchange_cannot_care_en" if lang == "en" else "exchange_cannot_care_km"
        return fill_store_answer("{" + key + "}", store_info)
    if damage:
        key = "exchange_damage_care_en" if lang == "en" else "exchange_damage_care_km"
        return fill_store_answer("{" + key + "}", store_info)
    if size_issue:
        key = "exchange_size_care_en" if lang == "en" else "exchange_size_care_km"
        return fill_store_answer("{" + key + "}", store_info)
    if color_issue:
        key = "exchange_color_care_en" if lang == "en" else "exchange_color_care_km"
        return fill_store_answer("{" + key + "}", store_info)
    if exchange_ask:
        key = "exchange_care_en" if lang == "en" else "exchange_care_km"
        return fill_store_answer("{" + key + "}", store_info)
    return None


def try_contextual_followup_answer(text, history, store_info, lang="km"):
    """Answer short follow-ups from prior topic without losing the thread."""
    if not history or not is_short_followup(text):
        return None
    topic = detect_chat_topic(history)
    if not topic:
        return None
    cleaned = normalize_khmer_digits((text or "").lower())
    asks_fee = asks_fee_followup(cleaned)
    if topic["id"] == "return" and asks_fee:
        return fill_store_answer(
            "{return_fee_note_en}" if lang == "en" else "{return_fee_note}",
            store_info,
        )
    # After exchange topic, soft care for reason / size / color follow-ups
    if topic["id"] == "return":
        care = try_exchange_care_answer(text, store_info, lang=lang)
        if care:
            return care
        # Soft ask for reason — never «why change?»
        if any(
            k in cleaned
            for k in (
                "why",
                "reason",
                "មូលហេតុ",
                "ហេតុអ្វី",
                "ព្រោះអ្វី",
                "ម៉េចទើប",
            )
        ):
            if lang == "en":
                return (
                    "To help you correctly, may I know the reason you’d like to exchange? 😊\n"
                    "• Size not right\n"
                    "• Color not as expected\n"
                    "• Want a different style\n"
                    "• Item has an issue\n"
                    "• Other\n"
                    "Also share your Order ID if you have it."
                )
            return (
                "ដើម្បីជួយអ្នកបានត្រឹមត្រូវ តើអាចប្រាប់ខ្ញុំពីមូលហេតុដែលចង់ផ្លាស់ប្តូរបានទេ? 😊\n"
                "• ទំហំមិនសម\n"
                "• ពណ៌មិនដូចការរំពឹង\n"
                "• ចង់ប្តូរម៉ូដែលផ្សេង\n"
                "• ទំនិញមានបញ្ហា\n"
                "• ផ្សេងៗ\n"
                "បើមាន សូមប្រាប់លេខកម្មង់ផង។"
            )
    if topic["id"] == "delivery" and asks_fee:
        return fill_store_answer(
            "{delivery_note_en}" if lang == "en" else "{delivery_note}",
            store_info,
        )
    if topic["id"] == "payment" and (
        asks_fee
        or any(
            k in cleaned
            for k in ("\u1798\u17c9\u17c1\u1785", "how", "\u17a2\u17d2\u179c\u17b8", "what")
        )
    ):
        return fill_store_answer(
            "{payments_en}" if lang == "en" else "{payments}",
            store_info,
        )
    return None



def detect_reply_lang(text, history=None):
    """Pick reply language from explicit request, current script, then history."""
    cleaned = re.sub(r"\s+", " ", (text or "").strip().lower())
    en_req = (
        "english",
        "speak english",
        "in english",
        "reply in english",
        "i need english",
        "please say to english",
        "please say english",
        "say english",
        "ភាសាអង់គ្លេស",
        "និយាយអង់គ្លេស",
        "ឆ្លើយអង់គ្លេស",
    )
    km_req = (
        "khmer",
        "speak khmer",
        "in khmer",
        "speak in khmer",
        "ភាសាខ្មែរ",
        "និយាយខ្មែរ",
        "ឆ្លើយខ្មែរ",
    )

    if any(k in cleaned for k in en_req):
        return "en"
    if any(k in cleaned for k in km_req):
        return "km"

    # Current message script wins over older preference
    if has_khmer(text):
        return "km"
    if re.search(r"[a-zA-Z]", text or "") and not has_khmer(text):
        # Only treat as English if not forced Khmer earlier in chat without new latin-only msg
        for prev in reversed(history_user_texts(history)):
            prev_l = prev.lower()
            if any(k in prev_l for k in km_req):
                # User asked for Khmer before, but this message is Latin-only shop text
                break
            if any(k in prev_l for k in en_req):
                return "en"
        return "en"

    for prev in reversed(history_user_texts(history)):
        prev_l = prev.lower()
        if any(k in prev_l for k in en_req):
            return "en"
        if any(k in prev_l for k in km_req):
            return "km"

    return "km"


def compose_curated_khmer_reply(store_info, text):
    """Safe Khmer answers from store_info only — no small-model hallucination."""
    cleaned = re.sub(r"\s+", " ", (text or "").strip().lower())
    # Always try FAQ with Khmer templates first
    faq = match_faq_answer(cleaned, store_info, lang="km")
    if faq:
        return faq

    v = store_template_vars(store_info)
    # Light routing by topic words
    if any(k in cleaned for k in ("បង់", "ទូទាត់", "khqr", "visa", "payment")):
        return fill_store_answer(
            "អាចបង់តាម៖ {payments}។ {online_payment_policy}។ {cod_policy}",
            store_info,
        )
    if any(k in cleaned for k in ("ដឹក", "ផ្ញើ", "grab", "foodpanda", "delivery")):
        return fill_store_answer(
            "មានសេវាដឹកជញ្ជូន៖ {delivery}។ {delivery_note}",
            store_info,
        )
    if any(k in cleaned for k in ("កម្មង់", "ទិញ", "order")):
        return fill_store_answer("{how_to_order}", store_info)
    if any(k in cleaned for k in ("ទំហំ", "size")):
        return fill_store_answer("{sizing_note}", store_info)
    if any(k in cleaned for k in ("ខូច", "ប្តូរ", "ត្រឡប់", "return", "exchange", "ផ្លាស់")):
        return fill_store_answer("{exchange_care_km}", store_info)

    return (
        f"{v['brand_summary']} {v['owner_model']}\n"
        f"ប្រភេទទំនិញ៖ {v['categories']}។\n"
        f"{v['price_range']}\n"
        f"បង់បាន៖ {v['payments']}។ ដឹក៖ {v['delivery']}។\n"
        "សួរបន្តបានអំពីទំនិញ តម្លៃ ស្តុក ឬការកម្មង់។"
    )


def _format_sizes(size):
    if size in (None, "", []):
        return None
    if isinstance(size, (list, tuple)):
        # Show a short readable size range instead of a raw Python list
        bits = [str(s).strip() for s in size if str(s).strip()]
        if not bits:
            return None
        if len(bits) <= 3:
            return ", ".join(bits)
        return f"{bits[0]} … {bits[-1]} ({len(bits)} sizes)"
    return str(size)


def product_image_url(item):
    """Prefer absolute catalog image URLs for Gradio markdown."""
    if not item:
        return None
    for key in ("image_url", "main_image", "image", "photo", "thumbnail"):
        raw = item.get(key)
        if not raw:
            continue
        url = str(raw).strip()
        if url.startswith(("http://", "https://")):
            return url
    return None


def format_product_line(item, lang="km"):
    """One catalog card: optional image + price/size line (markdown for Gradio)."""
    name = item.get("name") or item.get("product") or "N/A"
    price = item.get("price")
    stock = item.get("stock")
    if stock is None:
        stock = item.get("qty")
    size = _format_sizes(item.get("size") or item.get("sizes"))
    color = item.get("color")
    category = item.get("category")

    parts = [f"**«{name}»**"]
    if lang == "en":
        if category:
            parts.append(str(category))
        if price is not None and price != "":
            try:
                parts.append(f"${float(price):g}")
            except (TypeError, ValueError):
                parts.append(f"${price}")
        if size:
            parts.append(f"size {size}")
        if color:
            parts.append(f"color {color}")
        if stock not in (None, ""):
            parts.append(f"stock {stock}")
    else:
        if category:
            parts.append(str(category))
        if price is not None and price != "":
            try:
                parts.append(f"តម្លៃ ${float(price):g}")
            except (TypeError, ValueError):
                parts.append(f"តម្លៃ ${price}")
        if size:
            parts.append(f"ទំហំ {size}")
        if color:
            parts.append(f"ពណ៌ {color}")
        if stock not in (None, ""):
            parts.append(f"ស្តុក {stock}")
    text = " — ".join(parts)

    img = product_image_url(item)
    if not img:
        return f"- {text}"
    safe_alt = (
        str(name)
        .replace("[", "")
        .replace("]", "")
        .replace("(", "")
        .replace(")", "")
        .replace("\n", " ")
        .strip()
        or "product"
    )
    return f"![{safe_alt}]({img})\n{text}"


def normalize_khmer_digits(text):
    """Convert Khmer digits ០-៩ to ASCII 0-9 for budget/size parsing."""
    table = str.maketrans("០១២៣៤៥៦៧៨៩", "0123456789")
    return (text or "").translate(table)


def _term_in_text(term, cleaned):
    """Khmer: substring OK. Latin: whole-word so «hat» ≠ «What»."""
    term = (term or "").lower().strip()
    if not term or not cleaned:
        return False
    if re.search(r"[\u1780-\u17FF]", term):
        if term == "អាវ":
            # «អាវនេះ» is a pronoun follow-up, not a fresh tops browse
            if "អាវនេះ" in cleaned and "អាវយឺត" not in cleaned and "អាវក្រៅ" not in cleaned:
                # Allow only if another bare shirt cue exists beyond the pronoun
                stripped = cleaned.replace("អាវនេះ", " ")
                return "អាវ" in stripped
            return "អាវ" in cleaned
        return term in cleaned
    # Multi-word phrases (dad hat, t shirt)
    if " " in term or "-" in term:
        return term in cleaned
    return re.search(rf"(?<!\w){re.escape(term)}(?!\w)", cleaned) is not None


def detect_pronoun_category(text):
    """
    «ខោនេះ» / «this shirt» embed the product type in the pronoun phrase.
    Return category tuple so we don't strip the type away and lose context.
    """
    cleaned = normalize_khmer_digits((text or "").strip().lower())
    cleaned = apply_taxonomy_typos(cleaned)
    if not cleaned:
        return None
    # Most specific first
    rules = [
        (
            (
                "ស្បែកជើងនេះ",
                "this shoe",
                "these shoes",
                "that shoe",
                "this sneaker",
            ),
            (
                "ស្បែកជើង",
                "shoes",
                (
                    "ស្បែកជើង",
                    "shoe",
                    "shoes",
                    "sneaker",
                    "sneakers",
                    "ប៉ាតា",
                ),
            ),
        ),
        (
            ("អាវយឺតនេះ", "this tee", "this t-shirt", "this tshirt", "that tee"),
            (
                "អាវយឺត",
                "T-shirts",
                ("អាវយឺត", "t-shirt", "tee", "tshirt"),
            ),
        ),
        (
            (
                "អាវក្រៅនេះ",
                "this jacket",
                "this hoodie",
                "that jacket",
                "this coat",
            ),
            (
                "អាវក្រៅ",
                "jackets",
                ("អាវក្រៅ", "jacket", "hoodie", "bomber", "ហ៊ូឌី"),
            ),
        ),
        (
            (
                "ខោនេះ",
                "this pant",
                "these pants",
                "this jean",
                "these jeans",
                "this chino",
                "these chinos",
                "that pant",
            ),
            (
                "ខោ",
                "pants",
                ("ខោ", "pants", "pant", "jean", "jeans", "chino", "jogger"),
            ),
        ),
        (
            ("កាបូបនេះ", "this bag", "this backpack"),
            ("កាបូប", "bags", ("កាបូប", "bag", "backpack")),
        ),
        (
            ("មួកនេះ", "this hat", "this cap"),
            ("មួក", "hats", ("មួក", "hat", "cap")),
        ),
        # Ambiguous tops — still a tops signal (colors for shirts), subtypes optional
        (
            ("អាវនេះ", "this shirt", "this top", "that shirt"),
            (
                "អាវ",
                "tops / shirts",
                ("អាវ", "shirt", "shirts", "top", "tops"),
            ),
        ),
    ]
    for cues, cat in rules:
        if any(c in cleaned for c in cues):
            return cat
    return None


def detect_wanted_category(text):
    """Return (label_km, label_en, match_terms) if user named a product type."""
    cleaned = normalize_khmer_digits(text or "").lower()
    cleaned = apply_taxonomy_typos(cleaned)
    # «ខោនេះ» / «this shirt» — type is inside the pronoun; resolve before stripping
    embedded = detect_pronoun_category(cleaned)
    if embedded:
        return embedded
    # Bare «មួយនេះ» / «this one» — keep prior focus; don't invent a category
    if looks_like_product_reference(cleaned):
        return None
    # Specific taxonomy products first (polo, bomber, loafer…) before broad buckets
    tax = match_product_type(cleaned)
    group_ids = {
        "tops",
        "bottoms",
        "outerwear",
        "footwear",
        "formal",
        "accessories",
        "bags",
        "hats",
        "sportswear",
        "beachwear",
        "underwear",
        "jewelry",
        "grooming",
    }
    if tax and tax.get("id") not in group_ids:
        return category_tuple_from_match(tax)
    # More specific first
    rules = [
        (
            "អាវយឺត / T-shirt",
            "T-shirts",
            (
                "អាវយឺត",
                "t-shirt",
                "tshirt",
                "t shirt",
                "tee",
                "tees",
            ),
        ),
        (
            "អាវ polo",
            "polo shirts",
            ("polo", "polos", "polo shirt"),
        ),
        (
            "hoodie / អាវក្រៅ",
            "hoodies / jackets",
            ("hoodie", "hoodies", "អាវក្រៅ", "jacket", "sweater", "ហ៊ូឌី"),
        ),
        (
            "ខោ / jogger",
            "pants / joggers",
            (
                "ខោ",
                "jogger",
                "joggers",
                "pants",
                "pant",
                "trousers",
                "trouser",
                "shorts",
                "chinos",
                "chino",
            ),
        ),
        (
            "ស្បែកជើង",
            "shoes",
            (
                "ស្បែកជើង",
                "shoe",
                "shoes",
                "sneaker",
                "sneakers",
                "boot",
                "boots",
                "loafer",
                "loafers",
                "sandal",
                "sandals",
                "ប៉ាតា",
                "ប៊ូ",
            ),
        ),
        (
            "មួក / cap",
            "hats / caps",
            ("មួក", "hat", "cap", "caps", "dad hat", "beanie"),
        ),
        (
            "កាបូប",
            "bags",
            ("កាបូប", "bag", "bags", "backpack", "wallet", "កាបូបលុយ", "messenger", "duffel"),
        ),
        (
            "អាវ",
            "tops / shirts",
            ("អាវ", "shirt", "shirts", "top", "tops"),
        ),
    ]
    for label_km, label_en, terms in rules:
        if any(_term_in_text(t, cleaned) for t in terms):
            return label_km, label_en, terms
    if tax:
        return category_tuple_from_match(tax)
    return None


def product_matches_category(item, terms):
    blob = " ".join(
        str(item.get(k, ""))
        for k in ("name", "product", "category", "description")
    ).lower()
    terms = tuple(terms or ())
    # T-shirt / tee: don't treat hoodie/jacket catalogued as "Men Shirts" as a hit
    tee_terms = {"t-shirt", "tshirt", "tee", "tees", "អាវយឺត"}
    if any(str(t).lower() in tee_terms for t in terms):
        outer = any(
            x in blob
            for x in ("hoodie", "jacket", "windbreaker", "bomber", "sweater", "fleece")
        )
        strong_tee = any(
            _term_in_text(x, blob)
            for x in (
                "t-shirt",
                "tshirt",
                "tee",
                "អាវយឺត",
                "short-sleeve",
                "short sleeve",
            )
        )
        if strong_tee:
            return True
        if outer:
            return False
        return "shirt" in blob
    for t in terms:
        if _term_in_text(t, blob):
            return True
        # Singular/plural: jean ↔ jeans, pant ↔ pants, etc.
        if t in ("jean", "jeans") and re.search(r"(?<!\w)jeans?(?!\w)", blob):
            return True
        if t in ("pant", "pants") and re.search(
            r"(?<!\w)pants?(?!\w)|(?<!\w)chinos?(?!\w)|(?<!\w)joggers?(?!\w)|(?<!\w)trousers?\b",
            blob,
        ):
            return True
        if t in ("trouser", "trousers") and re.search(
            r"(?<!\w)trousers?(?!\w)|(?<!\w)pants?(?!\w)", blob
        ):
            return True
        # Only full word «shorts» — never «short» alone (matches short-sleeve shirts)
        if t == "shorts" and re.search(r"(?<!\w)shorts(?!\w)", blob):
            return True
        if t in ("chino", "chinos") and re.search(r"(?<!\w)chinos?(?!\w)", blob):
            return True
        if t in ("jogger", "joggers") and re.search(r"(?<!\w)joggers?(?!\w)", blob):
            return True
    return False


def wants_order_track_ask(text):
    """Personal order/package status — not shipping-policy or catalog browse."""
    cleaned = normalize_khmer_digits((text or "").lower())
    # Common typo: ណាើយ → ណាហើយ
    cleaned = cleaned.replace("ដល់ណាើយ", "ដល់ណាហើយ").replace("ណាើយ", "ណាហើយ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return False

    explicit = (
        "តាមដាន",
        "track order",
        "track my order",
        "tracking number",
        "tracking no",
        "order status",
        "ស្ថានភាពកម្មង់",
        "where is my order",
        "where's my order",
        "where is my package",
        "where's my package",
        "where is my parcel",
        "ដឹកដល់ណា",
        "កម្មង់ខ្ញុំ",
        "my order",
        "my package",
        "my parcel",
        "my shipment",
        "awb",
    )
    if any(k in cleaned for k in explicit):
        return True

    status_cues = (
        "ដល់ណា",
        "ដល់ណាហើយ",
        "នៅណា",
        "មិនទាន់ដល់",
        "មិនទាន់មក",
        "មកដល់នៅណា",
        "arrived yet",
        "not arrived",
        "has it arrived",
        "order status",
        "shipment status",
        "package status",
    )
    mine_cues = (
        "ខ្ញុំ",
        "របស់ខ្ញុំ",
        "ទំនិញខ្ញុំ",
        "កញ្ចប់",
        "កម្មង់",
        "my order",
        "my package",
        "my parcel",
        "my shipment",
        "package",
        "parcel",
        "shipment",
        "order",
    )
    if any(k in cleaned for k in status_cues) and any(k in cleaned for k in mine_cues):
        return True

    # EN: where/where's + my order|package|parcel|shipment
    if re.search(
        r"\b(where'?s|where is)\b.{0,40}\b(my\s+)?(order|package|parcel|shipment)\b",
        cleaned,
    ) or re.search(
        r"\b(my\s+)?(order|package|parcel|shipment)\b.{0,40}\b(where'?s|where is)\b",
        cleaned,
    ):
        return True

    # «ទំនិញខ្ញុំដល់ណាហើយ» (often no spaces)
    if "ទំនិញ" in cleaned and "ខ្ញុំ" in cleaned and any(
        k in cleaned for k in ("ដល់", "នៅណា", "មិនទាន់", "តាមដាន")
    ):
        return True
    if "កញ្ចប់" in cleaned and any(k in cleaned for k in ("ដល់", "នៅណា", "តាមដាន")):
        return True
    return False


def try_order_track_answer(text, lang="km"):
    """Guide to /track-order and ask for Order ID — never dump catalog or shipping FAQ."""
    if not wants_order_track_ask(text):
        return None
    if lang == "en":
        return (
            "Of course — happy to help you track your order! 😊✨\n"
            "Please open **/track-order** or **Profile → My Orders** (login required).\n"
            "If you have it, share your **Order ID** here and I’ll guide the next step.\n"
            "Can’t find it? Visit **/support** — we’re here for you 💕"
        )
    return (
        "បានជាក់ជា — រីករាយជួយតាមដានកម្មង់ឱ្យ! 😊✨\n"
        "សូមមើល **/track-order** ឬ **Profile → My Orders** (ត្រូវចូលគណនី)។\n"
        "បើមាន សូមប្រាប់ **លេខកម្មង់ (Order ID)** មក — ខ្ញុំជួយជំហានបន្ទាប់ឱ្យ។\n"
        "មិនឃើញ? សូម **/support** — ខ្ញុំនៅជាមួយអ្នក 💕"
    )


def wants_new_shopper_ask(text):
    """Customer clarifies they have no order yet and/or no account."""
    cleaned = normalize_khmer_digits(re.sub(r"\s+", " ", (text or "").strip().lower()))
    if not cleaned:
        return False
    no_order = any(
        k in cleaned
        for k in (
            "មិនទាន់បានកម្មង់",
            "មិនទាន់កម្មង់",
            "មិនទាន់ទិញ",
            "មិនទាន់ដាក់កម្មង់",
            "មិនទាន់ order",
            "haven't ordered",
            "have not ordered",
            "didn't order",
            "did not order",
            "no order yet",
            "not ordered yet",
            "haven't bought",
            "no purchase yet",
        )
    )
    no_account = any(
        k in cleaned
        for k in (
            "មិនទាន់មានគណនី",
            "មិនមានគណនី",
            "គ្មានគណនី",
            "មិនទាន់ចុះឈ្មោះ",
            "មិនទាន់បង្កើតគណនី",
            "no account",
            "don't have an account",
            "dont have an account",
            "do not have an account",
            "haven't signed up",
            "no login",
            "not registered",
        )
    )
    # «មិនទាន់…ផង» with both order + account cues in one message
    if no_order or no_account:
        return True
    if "មិនទាន់" in cleaned and any(
        k in cleaned for k in ("កម្មង់", "គណនី", "account", "order", "ទិញ")
    ):
        # Avoid late-delivery: «មិនទាន់ដល់»
        if any(k in cleaned for k in ("ដល់", "មក", "កញ្ចប់", "arrived", "package")):
            return False
        return True
    return False


def try_new_shopper_answer(text, store_info, lang="km"):
    """Warm path when they haven't ordered / have no account yet."""
    if not wants_new_shopper_ask(text):
        return None
    how = fill_store_answer(
        "{how_to_order_en}" if lang == "en" else "{how_to_order}",
        store_info,
    )
    loyalty = fill_store_answer(
        "{loyalty_policy_en}" if lang == "en" else "{loyalty_policy}",
        store_info,
    )
    if lang == "en":
        return (
            "No worries at all! 😊✨ You don’t need an existing order to shop with us.\n\n"
            f"**Create an account first:** {loyalty}\n\n"
            f"**Then place your first order:**\n{how}\n\n"
            "Tell me what you’re looking for (pants, shirt, shoes…) — "
            "I’ll help you pick something lovely 💕"
        )
    return (
        "មិនបាច់បារម្ភទេ! 😊✨ បើមិនទាន់កម្មង់ និងមិនទាន់មានគណនី — ខ្ញុំនៅជួយបាន។\n\n"
        f"**បង្កើតគណនីមុន៖** {loyalty}\n\n"
        f"**រួចកម្មង់ដំបូង៖**\n{how}\n\n"
        "ប្រាប់ថាចង់រកអ្វី (ខោ · អាវ · ស្បែកជើង…) — ខ្ញុំជួយជ្រើសម៉ូដស៊ីអ្នក 💕"
    )


def wants_store_policy_ask(text):
    """Return / pay / ship / policy — answer FAQ before product browse."""
    cleaned = normalize_khmer_digits((text or "").lower())
    # Informal Khmer: ដូរ ≈ ប្តូរ (exchange)
    cleaned = cleaned.replace("ដូរទំនិញ", "ប្តូរទំនិញ").replace("ដូរ", "ប្តូរ")
    if wants_order_track_ask(cleaned):
        return True
    return any(
        k in cleaned
        for k in (
            "return",
            "returns",
            "exchange",
            "refund",
            "policy",
            "policies",
            "ប្តូរ",
            "ត្រឡប់",
            "សងលុយ",
            "ដូរ",
            "ដូរទំនិញ",
            "អាចដូរ",
            "អាចប្តូរ",
            "payment",
            "how can i pay",
            "how do i pay",
            "how to order",
            "how to buy",
            "how do i order",
            "how can i order",
            "របៀបទិញ",
            "របៀបកម្មង់",
            "ទិញម៉េច",
            "កម្មង់ម៉េច",
            "place order",
            "checkout",
            "បង់",
            "ទូទាត់",
            "khqr",
            "delivery",
            "shipping",
            "ដឹក",
            "shipping fee",
            "ថ្លៃដឹក",
            "track order",
            "តាមដាន",
            "cancel order",
            "លុបកម្មង់",
        )
    )



def load_catalog_products():
    db_data = get_db_products(use_cache=True) or {}
    products = list(db_data.get("products") or [])
    if not products:
        products = load_json_products()
    return products, list(db_data.get("inventory_lots") or [])


def wants_cheap_deals(text):
    cleaned = normalize_khmer_digits(text or "").lower()
    return any(
        k in cleaned
        for k in (
            "ថោក",
            "ចុះថ្លៃ",
            "sale",
            "cheap",
            "cheaper",
            "affordable",
            "budget friendly",
            "budget-friendly",
            "low price",
            "not expensive",
            "inexpensive",
            "តម្លៃថោក",
            "ថ្លៃថោក",
            "មិនថ្លៃ",
            "បញ្ចុះ",
            "បញ្ចុះតម្លៃ",
            "discount",
            "promo",
            "promotion",
            "មានប្រូម៉ូ",
            "any discount",
            "discunt",
        )
    )


def wants_price_ask(text):
    cleaned = normalize_khmer_digits((text or "").lower())
    if parse_budget_usd(cleaned) is not None:
        return True
    return any(
        k in cleaned
        for k in (
            "តម្លៃ",
            "ថ្លៃ",
            "ប៉ុន្មាន",
            "how much",
            "price",
            "cost",
            "hm?",
            "prc",
            "prise",
            "$",
        )
    )


def wants_stock_ask(text):
    cleaned = normalize_khmer_digits((text or "").lower())
    return any(
        k in cleaned
        for k in (
            "ស្តុក",
            "stock",
            "available",
            "availability",
            "in stock",
            "instock",
            "មានស្តុក",
            "នៅសល់",
            "sold out",
            "អស់ស្តុក",
            "oos",
        )
    )


def wants_new_arrival_ask(text):
    cleaned = normalize_khmer_digits((text or "").lower())
    return any(
        k in cleaned
        for k in (
            "ថ្មី",
            "new arrival",
            "new arrivals",
            "new products",
            "latest",
            "what's new",
            "whats new",
            "មានថ្មី",
            "new?",
            "latest?",
        )
    )


def wants_search_ask(text):
    cleaned = normalize_khmer_digits((text or "").lower())
    return any(
        k in cleaned
        for k in (
            "រក",
            "រកមើល",
            "search",
            "find",
            "look for",
            "looking for",
            "show me",
            "show",
            "need",
            "បង្ហាញ",
            "ស្វែង",
        )
    )


def wants_buy_ask(text):
    cleaned = normalize_khmer_digits((text or "").lower())
    return any(
        k in cleaned
        for k in (
            "ចង់ទិញ",
            "wanna buy",
            "want to buy",
            "want buy",
            "i wanna",
            "buy ",
            " buy",
            "need buy",
            "ទិញ",
            "purchase",
        )
    ) or re.search(r"(?<!\w)buy(?!\w)", cleaned) is not None


def detect_wanted_brand(text):
    return detect_brand_name(text)


def detect_wanted_size(text):
    """Extract size tokens like 42, L, XL, sz42."""
    cleaned = normalize_khmer_digits((text or "").lower())
    cleaned = cleaned.replace("sz", "size ")
    m = re.search(
        r"(?:size|ទំហំ)\s*([0-9]{2}|xxl|xl|xs|s|m|l)\b|\b([0-9]{2})\s*\?|\b(xxl|xl|xs)\b",
        cleaned,
        flags=re.IGNORECASE,
    )
    if not m:
        return None
    return next(g for g in m.groups() if g)


def wants_availability_ask(text):
    """មានអាវទេ? / got hoodie? / hv black? / មានអត់ / មានខោខ្មៅអត់ / មានសអត់"""
    cleaned = normalize_khmer_digits(text or "").lower()
    cleaned = cleaned.replace("សរ", "ស")
    has_shop_entity = bool(
        detect_wanted_category(cleaned)
        or detect_wanted_brand(cleaned)
        or detect_wanted_colors(cleaned)
        or detect_wanted_size(cleaned)
        or needs_product_data(cleaned)
        or wants_color_question(cleaned)
    )
    # Khmer: មាន…អត់ / មាន…ទេ (slang gap between មាន and អត់)
    km_have = bool(re.search(r"មាន.{0,24}(អត់|ទេ)", cleaned)) or any(
        k in cleaned for k in ("មានទេ", "មានអត់", "មានអត", "មែនទេ", "នៅមាន")
    )
    en_have = any(
        k in cleaned
        for k in (
            "have any",
            "do you have",
            "got any",
            "got ",
            "u got",
            "hv ",
            "any ",
        )
    )
    if has_shop_entity and (
        km_have
        or en_have
        or any(k in cleaned for k in ("មាន", "ទេ", "អត់", "got", "hv", "have", "any", "need", "មែន"))
    ):
        return True
    return (km_have or en_have) and has_shop_entity


def format_top_seller_answer(rows, lang="km"):
    if not rows:
        if lang == "en":
            return "I couldn't find sales data right now. I can help you browse popular styles on /search instead."
        return "មិនឃើញទិន្នន័យលក់ឥឡូវទេ។ ខ្ញុំអាចជួយរកម៉ូដពេញនិយមនៅ /search ជំនួសបាន។"

    top = rows[0]
    name = top.get("product_name") or "N/A"
    qty = top.get("total_qty") or 0
    sales = top.get("total_sales") or 0
    price = top.get("sample_price")

    if lang == "en":
        answer = f"Current top seller is «{name}» (sold {qty} units"
        if sales:
            answer += f", about ${sales} total"
        if price is not None:
            answer += f", sample price ${price}"
        answer += ")."
        if len(rows) > 1:
            runners = [
                f"{row.get('product_name')} ({row.get('total_qty') or 0} units)"
                for row in rows[1:3]
            ]
            answer += " Next: " + " and ".join(runners) + "."
        return answer

    answer = (
        f"ទំនិញលក់ដាច់បំផុតបច្ចុប្បន្នគឺ «{name}» "
        f"(លក់បាន {qty} ដើម"
    )
    if sales:
        answer += f" សរុបប្រហែល ${sales}"
    if price is not None:
        answer += f" តម្លៃគំរូ ${price}"
    answer += ")។"

    if len(rows) > 1:
        runners = []
        for row in rows[1:3]:
            runners.append(
                f"{row.get('product_name')} ({row.get('total_qty') or 0} ដើម)"
            )
        answer += " បន្ទាប់មក៖ " + " និង ".join(runners) + "។"

    return answer


def identity_answer(store_info, lang="km"):
    for item in store_info.get("faq") or []:
        if item.get("id") == "identity":
            template = (
                item.get("answer_en") if lang == "en" else item.get("answer", "")
            )
            if lang == "en" and not template:
                template = (
                    "I am {assistant_name} for {store_name}. "
                    "I do not have any other name."
                )
            return fill_store_answer(template, store_info)
    if lang == "en":
        return fill_store_answer(
            "I am {assistant_name} for {store_name}. I do not have any other name.",
            store_info,
        )
    return fill_store_answer(
        "ខ្ញុំជា {assistant_name} របស់ហាង {store_name}។ ខ្ញុំមិនមានឈ្មោះផ្សេងទេ។",
        store_info,
    )


def sanitize_reply(answer, store_info, lang="km"):
    """Stop small models from inventing fake names / checkout fluff."""
    if not answer:
        return identity_answer(store_info, lang=lang)

    text = answer.strip()
    lower = text.lower()
    bad_name = re.search(
        r"\bmy name is\b|\bi am (koh|alex|sam|ai|assistant)\b|ឈ្មោះខ្ញុំគឺ",
        lower,
    )
    if bad_name and "themanstore" not in lower:
        return identity_answer(store_info, lang=lang)

    if any(k in text for k in ("បញ្ជាក់ការលក់", "order confirmed", "checkout")):
        if lang == "en":
            return (
                "I can show product info, prices, and stock. "
                "Please send a product name or ask for the product list."
            )
        return (
            "ខ្ញុំអាចបង្ហាញព័ត៌មានទំនិញ តម្លៃ និងស្តុកបាន។ "
            "សូមផ្ញើឈ្មោះទំនិញ ឬសួរ «បញ្ជីផលិតផល»។"
        )

    return text


def try_product_answer(text, lang="km"):
    """Answer product/stock/price questions from DB/JSON without the LLM."""
    if is_bestseller_question(text):
        return None
    if wants_order_track_ask(text):
        return None

    db_data = get_db_products(use_cache=True) or {}
    products = list(db_data.get("products") or [])
    lots = list(db_data.get("inventory_lots") or [])
    if not products:
        products = load_json_products()

    cleaned = text.strip().lower()
    wants_list = any(
        k in cleaned
        for k in (
            "បញ្ជី",
            "ទាំងអស់",
            "all product",
            "product list",
            "list product",
            "មានអ្វីខ្លះ",
            "បង្ហាញទំនិញ",
            "បង្ហាញផលិតផល",
        )
    )

    tokens = [t for t in re.split(r"[\s,./?؟!]+", cleaned) if len(t) >= 3]

    def score(item):
        blob = " ".join(
            str(item.get(k, ""))
            for k in ("name", "product", "category", "color", "size", "sizes")
        ).lower()
        hits = sum(1 for t in tokens if t in blob)
        pname = str(item.get("name") or item.get("product") or "").lower()
        if pname and pname in cleaned:
            hits += 10
        return hits

    ranked_products = sorted(products, key=score, reverse=True)
    ranked_lots = sorted(lots, key=score, reverse=True)
    matched_products = [p for p in ranked_products if score(p) > 0][:5]
    matched_lots = [lot for lot in ranked_lots if score(lot) > 0][:5]

    if matched_products and score(matched_products[0]) >= 3:
        lines = [format_product_line(p, lang=lang) for p in matched_products[:3]]
        if lang == "en":
            return "Product info:\n- " + "\n- ".join(lines)
        return "ព័ត៌មានទំនិញ៖\n- " + "\n- ".join(lines)

    if not needs_product_data(text) and not wants_list and not matched_products:
        return None

    wants_stock = any(k in cleaned for k in ("ស្តុក", "stock", "មានទេ", "នៅសល់"))
    wants_price = any(k in cleaned for k in ("តម្លៃ", "price", "ថ្លៃ", "ប៉ុន្មាន"))

    if matched_lots and (wants_stock or wants_price or matched_products):
        lines = [format_product_line(lot, lang=lang) for lot in matched_lots]
        if lang == "en":
            return "Stock info:\n- " + "\n- ".join(lines)
        return "ព័ត៌មានទំនិញពីស្តុក៖\n- " + "\n- ".join(lines)

    if matched_products:
        lines = [format_product_line(p, lang=lang) for p in matched_products]
        if lang == "en":
            return "Related products:\n- " + "\n- ".join(lines)
        return "ទំនិញដែលពាក់ព័ន្ធ៖\n- " + "\n- ".join(lines)

    if products and (wants_list or needs_product_data(text)):
        # Bare «តម្លៃ?» / «ទំហំ?» without product context — don't dump whole catalog
        if is_bare_product_attr_ask(text) and not detect_wanted_category(text):
            return None
        lines = [format_product_line(p, lang=lang) for p in products[:8]]
        if lang == "en":
            return "Current products:\n- " + "\n- ".join(lines)
        return "ទំនិញបច្ចុប្បន្នមានដូចខាងក្រោម៖\n- " + "\n- ".join(lines)

    if needs_product_data(text) or wants_list:
        if lang == "en":
            return "I couldn't find product data right now. Want to browse /search, or tell me a style name?"
        return "មិនឃើញទិន្នន័យផលិតផលឥឡូវទេ។ ចង់មើល /search ឬប្រាប់ឈ្មោះម៉ូដ?"
    return None


def wants_flexible_reply(text):
    """Advice / open questions → LLM (Gemini-like), not rigid FAQ only."""
    keys = [
        "ណែនាំ",
        "មួយណា",
        "គួរយក",
        "សម្រាប់ខ្ញុំ",
        "ពន្យល់",
        "ហេតុអ្វី",
        "យ៉ាងម៉េចដែរ",
        "អាចជួយ",
        "recommend",
        "suggest",
        "which one",
        "which should",
        "what should",
        "help me choose",
        "compare",
        "difference",
        "advice",
        "explain",
        "why ",
        "why?",
        "how about",
        "can you help",
        "តើខ្ញុំគួរ",
        "ល្អជាង",
        "សាកសម",
    ]
    lower = (text or "").lower()
    return any(k in lower for k in keys)


def _levenshtein(a: str, b: str) -> int:
    """Tiny edit-distance for short greeting typo checks."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            ins = cur[j - 1] + 1
            delete = prev[j] + 1
            sub = prev[j - 1] + (ca != cb)
            cur.append(min(ins, delete, sub))
        prev = cur
    return prev[-1]


def is_simple_greeting(text):
    cleaned = re.sub(r"\s+", " ", (text or "").strip().lower())
    cleaned = cleaned.strip("\"'`“”")
    if not cleaned:
        return True
    bare = cleaned.rstrip("!?.។ ")
    exact = {
        "hi",
        "hello",
        "hey",
        "yo",
        "sup",
        "helo",
        "helllo",
        "helll",
        "hullo",
        "howdy",
        "good morning",
        "good afternoon",
        "good evening",
        "សួស្តី",
        "សួស្ដី",
        "ជំរាបសួរ",
        "ជម្រាបសួរ",
    }
    if bare in exact:
        return True
    if any(g in bare for g in ("សួស្តី", "សួស្ដី", "ជំរាបសួរ", "ជម្រាបសួរ")) and len(bare) <= 24:
        return True
    if re.match(r"^(hi|hello|hey|yo|sup|helo|helllo)\b(.{0,20})?$", bare) is not None:
        return True
    # Typos / elongated: helll, hiiii, heyyy, helllooo
    token = re.sub(r"[^a-z]", "", bare)
    if 2 <= len(token) <= 12 and token.isalpha():
        if re.fullmatch(r"h+i+", token):
            return True
        if re.fullmatch(r"h+e+y+", token):
            return True
        if re.fullmatch(r"h+e+l+o*", token) and len(token) >= 4:
            return True
        for greet in ("hi", "hey", "hello", "yo", "sup"):
            if token[0] != greet[0]:
                continue
            if abs(len(token) - len(greet)) <= 2 and _levenshtein(token, greet) <= 1:
                return True
    return False


_greeting_n = 0
_greeting_lock = threading.Lock()


def greeting_reply(lang="km", text=""):
    """Rotate greeting phrasing so repeats don't feel copy-pasted (still instant)."""
    global _greeting_n
    cleaned = re.sub(r"\s+", " ", (text or "").strip().lower())
    casual = any(
        w in cleaned
        for w in ("bro", "brother", "dude", "mate", "friend", "bong", "បង", "មិត្ត")
    )
    with _greeting_lock:
        _greeting_n += 1
        n = _greeting_n

    if lang == "en":
        casual_pool = [
            "Hey! Welcome to The Man Store 🙂 "
            "I can help with products, sizes, orders, or delivery — what are you looking for?",
            "What's up! I'm your The Man Store shopping assistant. "
            "Want men, women, or kids styles — or tell me a budget and I'll suggest options?",
            "Hi friend! Glad you're here. "
            "I can find products, track orders, explain payment (KHQR/card), or recommend an outfit.",
            "Hey again 🙂 Looking for shoes, a hoodie, sale picks, or help tracking an order?",
        ]
        pool = [
            "Hi! 😊✨ Welcome — I'm your The Man Store shopping advisor. "
            "What are you looking for today?",
            "Welcome to The Man Store! 😊 How can I assist you today? "
            "Work, casual, or a special occasion?",
            "Hello! 😊 Great to see you. "
            "Which type of product are you interested in — or what’s the occasion?",
            "Hi there! 😊 May I know your preferred size, "
            "or shall we start with the style you’re after?",
            "Welcome! 💕 I’m here to help you find a great match. "
            "May I know what occasion you need it for — work, casual, or a date?",
            "Hello again 🙂✨ What are you looking for today?",
        ]
        chosen = casual_pool if casual else pool
        return chosen[(n + abs(hash(cleaned or "x"))) % len(chosen)]

    casual_pool_km = [
        "សួស្តីបង! ស្វាគមន៍មក The Man Store 🙂 "
        "ខ្ញុំជួយរកទំនិញ ទំហំ កម្មង់ ឬដឹក — ថ្ងៃនេះចង់រកអ្វី?",
        "ហេ៎! ខ្ញុំជា shopping assistant របស់ The Man Store។ "
        "បុរស ស្ត្រី កុមារ — ឬប្រាប់ថវិកា មក ខ្ញុំណែនាំជម្រើសឱ្យ!",
        "សួស្តីមិត្ត! រីករាយដែលមក។ "
        "អាចរកទំនិញ តាមដានកម្មង់ បង់ KHQR/កាត ឬណែនាំឈុតបាន។",
    ]
    pool_km = [
        "សួស្តី! 😊✨ ស្វាគមន៍ — ខ្ញុំជាទីប្រឹក្សាទិញ The Man Store។ "
        "ថ្ងៃនេះតើអ្នកកំពុងស្វែងរកអ្វីដែរ?",
        "ស្វាគមន៍មក The Man Store! 😊 តើខ្ញុំអាចជួយអ្នកបានយ៉ាងដូចម្តេច? "
        "ការងារ ប្រចាំថ្ងៃ ឬកម្មវិធីពិសេស?",
        "សួស្តី 🙂✨ តើអ្នកចាប់អារម្មណ៍ផលិតផលប្រភេទណា — ឬសម្រាប់ឱកាសអ្វី?",
        "សួស្តី! 😊 អាចប្រាប់ខ្ញុំអំពីទំហំដែលអ្នកចូលចិត្តបានទេ — "
        "ឬចាប់ផ្តើមពីស្ទីលដែលចង់បាន?",
        "សួស្តីម្តងទៀត 🙂💕 ថ្ងៃនេះតើអ្នកកំពុងស្វែងរកអ្វីដែរ?",
    ]
    chosen = casual_pool_km if casual else pool_km
    return chosen[(n + abs(hash(cleaned or "x"))) % len(chosen)]


def try_fast_answer(text, store_info, lang="km", allow_faq=True, allow_products=True):
    """Instant answers for greetings and common store FAQ (no model)."""
    cleaned = re.sub(r"\s+", " ", text.strip().lower())
    if not cleaned or is_simple_greeting(cleaned):
        return greeting_reply(lang, text=cleaned)

    how_are_you_keys = (
        "how are you",
        "how about you",
        "how's it going",
        "how is it going",
        "how r you",
        "អ្នកសុខសប្បាយទេ",
        "សុខសប្បាយទេ",
    )
    bare = cleaned.rstrip("!?.")
    if bare in how_are_you_keys or any(
        bare.startswith(k) or k in bare for k in how_are_you_keys
    ):
        if lang == "en":
            return (
                "I'm doing great, thank you! 😊✨ I’m your The Man Store AI Assistant. "
                "Would you like to ask about products or the store?\n"
                f"{sweet_close('en')}"
            )
        return (
            "សុខសប្បាយណាស់ អរគុណ! 😊✨ ខ្ញុំជា The Man Store AI Assistant។ "
            "តើអ្នកចង់សួរអ្វីអំពីទំនិញ ឬហាង?\n"
            f"{sweet_close('km')}"
        )

    thanks = {"អរគុណ", "សូមអរគុណ", "thanks", "thank you", "thx"}
    if cleaned in thanks or cleaned.rstrip("!?.") in thanks:
        if lang == "en":
            return (
                "You're so welcome! 😊💕 Ask anytime about The Man Store products or policies.\n"
                f"{sweet_close('en')}"
            )
        return (
            "សូមអរគុណដែរ! 😊💕 បើចង់សួរបន្តអំពីទំនិញ ឬហាង The Man Store សូមសរសេរមកបាន។\n"
            f"{sweet_close('km')}"
        )

    # «ទំនិញខ្ញុំដល់ណាហើយ» → track, never product dump / shipping-policy FAQ
    track = try_order_track_answer(text, lang=lang)
    if track:
        return track

    new_shopper = try_new_shopper_answer(text, store_info, lang=lang)
    if new_shopper:
        return new_shopper

    faq_answer = match_faq_answer(cleaned, store_info, lang=lang)
    # Return / exchange / pay / ship must win over bare «ទំនិញ» catalog listing
    if faq_answer and wants_store_policy_ask(cleaned):
        return faq_answer

    if faq_answer and any(
        k in cleaned
        for k in (
            "english",
            "khmer",
            "ភាសាខ្មែរ",
            "ភាសាអង់គ្លេស",
            "និយាយខ្មែរ",
            "និយាយអង់គ្លេស",
            "ឆ្លើយខ្មែរ",
            "ឆ្លើយអង់គ្លេស",
            "speak english",
            "speak khmer",
            "i need english",
        )
    ):
        return faq_answer

    if faq_answer and any(
        k in cleaned
        for k in (
            "cost",
            "តម្លៃដើម",
            "ប្រាក់ចំណេញ",
            "profit",
            "អ្នកផ្គត់ផ្គង់",
            "supplier",
            "role-based",
            "alert ស្តុក",
            "ប្រព័ន្ធគ្រប់គ្រង",
        )
    ):
        return faq_answer

    wants_buy = any(
        k in cleaned
        for k in (
            "want buy",
            "want to buy",
            "i want buy",
            "i wanna buy",
            "ចង់ទិញ",
            "ទិញទំនិញ",
            "buy a product",
            "buy product",
            "buy products",
            "buy produts",
        )
    ) or (
        re.search(r"\bbuy\b", cleaned)
        and any(k in cleaned for k in ("product", "produt", "item", "something", "ទំនិញ"))
    )
    if wants_buy and allow_products:
        product_answer = try_product_answer(text, lang=lang)
        how = fill_store_answer(
            "{how_to_order_en}" if lang == "en" else "{how_to_order}",
            store_info,
        )
        if product_answer:
            return f"{how}\n\n{product_answer}"
        return how

    if not is_shop_related(cleaned) and re.search(
        r"\bwhat (is|are)\b|\bwho (is|are|'s)\b|\bdefine\b|\bceo\b|\bfounder\b|"
        r"តើអ្វីជា|អ្វីទៅជា|ជាអ្វី|នាយក|ស្ថាបនិក",
        cleaned,
    ):
        return None

    if not allow_faq:
        return None

    if is_bestseller_question(cleaned):
        rows = get_top_sellers(use_cache=True)
        if rows is None:
            if lang == "en":
                return "Could not load sales data from the database. Please try again."
            return "មិនអាចទាញទិន្នន័យលក់ពី Database បានទេ។ សូមព្យាយាមម្តងទៀត។"
        return format_top_seller_answer(rows, lang=lang)

    # Dry FAQ/catalog lists → skip when LLM will do a sales pitch
    if not allow_products and wants_sales_catalog_chat(cleaned):
        return None

    # Product/budget/cheap asks beat generic style/price FAQ templates
    if allow_products:
        colors = try_colors_answer(text, store_info, lang=lang)
        if colors:
            return colors
        browse = try_category_browse_answer(text, lang=lang)
        if browse:
            return browse
        budget = try_budget_answer(text, lang=lang)
        if budget:
            return budget
        product_answer = try_product_answer(text, lang=lang)
        if product_answer and (
            wants_availability_ask(cleaned)
            or detect_wanted_category(cleaned)
            or wants_cheap_deals(cleaned)
            or wants_color_question(cleaned)
            or needs_product_data(cleaned)
        ):
            return product_answer

    if faq_answer:
        # Don't let style/price FAQ steal concrete product questions
        if allow_products and (
            wants_cheap_deals(cleaned)
            or detect_wanted_category(cleaned)
            or parse_budget_usd(cleaned) is not None
            or wants_color_question(cleaned)
        ):
            pass
        else:
            return faq_answer

    if not allow_products:
        return None

    product_answer = try_product_answer(text, lang=lang)
    if product_answer:
        return product_answer

    return None


@gpu_task
def generate_reply(prompt):
    global _model_device, model, tokenizer

    ensure_model_loaded()

    device = _model_device if _model_device in {"cpu", "cuda"} else "cpu"
    if USE_CUDA:
        device = "cuda"
        if _model_device != "cuda":
            model.to(device=device, dtype=torch.float16)
            _model_device = "cuda"
    elif ON_ZERO_GPU and torch.cuda.is_available():
        device = "cuda"
        if _model_device != "cuda":
            model.to(device=device, dtype=torch.float16)
            _model_device = "cuda"

    inputs = tokenizer(prompt, return_tensors="pt").to(device)
    # Cap prompt size — long RAG context makes every token slower
    max_prompt_tokens = 1536
    input_len = inputs["input_ids"].shape[-1]
    if input_len > max_prompt_tokens:
        inputs["input_ids"] = inputs["input_ids"][:, -max_prompt_tokens:]
        if "attention_mask" in inputs:
            inputs["attention_mask"] = inputs["attention_mask"][
                :, -max_prompt_tokens:
            ]
        input_len = max_prompt_tokens

    with torch.inference_mode():
        generated = model.generate(
            **inputs,
            max_new_tokens=config.MAX_NEW_TOKENS,
            do_sample=False,
            use_cache=True,
            pad_token_id=tokenizer.eos_token_id,
        )
    new_tokens = generated[0][input_len:]
    return tokenizer.decode(new_tokens, skip_special_tokens=True).strip()


def is_shop_related(text):
    cues = [
        "themanstore",
        "ហាង",
        "ទំនិញ",
        "ផលិតផល",
        "តម្លៃ",
        "ស្តុក",
        "បង់",
        "ទូទាត់",
        "ដឹក",
        "កម្មង់",
        "អាវ",
        "ស្បែកជើង",
        "កាបូប",
        "មួក",
        "នាឡិកា",
        "ស្រោម",
        "ខ្សែ",
        "ប៉ាតា",
        "ប៊ូ",
        "ទំហំ",
        "ប្រូម៉ូ",
        "ចុះថ្លៃ",
        "អំណោយ",
        "ថែទាំ",
        "ខេត្ត",
        "ភ្នំពេញ",
        "វិក្កយបត្រ",
        "លុបកម្មង់",
        "សាកពាក់",
        "ថវិកា",
        "បុរស",
        "លក់ដាច់",
        "ណែនាំ",
        # Latin: use whole-word match below for short words
        "product",
        "price",
        "stock",
        "payment",
        "delivery",
        "shipping",
        "order",
        "sneaker",
        "sneakers",
        "boots",
        "jacket",
        "hoodie",
        "watch",
        "belt",
        "sock",
        "socks",
        "bestseller",
        "popular",
        "recommend",
        "suggest",
        "purchase",
        "fashion",
        "outfit",
        "gift",
        "return",
        "exchange",
        "promo",
        "discount",
        "budget",
        "store",
        "shop",
        "khqr",
        "visa",
        "grab",
        "foodpanda",
        "vireak",
        "the man store",
        "ថោក",
        "ត្រឹម",
        "ថវិកា",
        "អាវយឺត",
        "sale",
        "cheap",
        "មានអត់",
        "មានទេ",
        "បញ្ចុះ",
        "ថ្មី",
        "nike",
        "adidas",
        "hoodie",
        "jogger",
        "discount",
        "promo",
        "stock",
        "available",
    ]
    short_en = {
        "pay",
        "buy",
        "size",
        "shoe",
        "shoes",
        "boot",
        "bag",
        "hat",
        "cap",
        "care",
        "men",
        "tee",
        "got",
        "hv",
        "blk",
        "new",
        "cost",
        "find",
        "need",
        "pant",
        "pants",
        "jean",
        "jeans",
        "shirt",
        "top",
    }
    lower = (text or "").lower()
    if "$" in lower or "៛" in lower:
        return True
    if any(c in lower for c in cues):
        return True
    return any(
        re.search(rf"(?<!\w){re.escape(w)}(?!\w)", lower) for w in short_en
    )


def try_scope_answer(text, lang="km"):
    """Instant replies for compliments / dangerous code asks (no LLM)."""
    cleaned = re.sub(r"\s+", " ", (text or "").strip().lower())
    bare = cleaned.rstrip("!?.")

    compliments = {
        "you are good",
        "you're good",
        "you are great",
        "good job",
        "well done",
        "nice",
        "awesome",
        "ពូកែ",
        "អស្ចារ្យ",
        "ល្អណាស់",
    }
    if bare in compliments or any(c in bare for c in compliments):
        if lang == "en":
            return (
                "Thank you! I can help with The Man Store products, prices, stock, "
                "payment, delivery, and ordering. What would you like to know?"
            )
        return (
            "សូមអរគុណ! ខ្ញុំអាចជួយអំពីទំនិញ The Man Store តម្លៃ ស្តុក "
            "ការទូទាត់ ដឹកជញ្ជូន និងការកម្មង់។ តើអ្នកចង់សួរអ្វី?"
        )

    # Only block writing code / exploits — "what is Python?" is allowed
    wants_write_code = any(
        k in cleaned
        for k in (
            "write code",
            "write a script",
            "write a program",
            "សរសេរ code",
            "សរសេរកូដ",
            "leetcode",
            "hack",
            "malware",
            "exploit",
        )
    ) or (
        re.search(r"\b(write|generate|create)\b.{0,20}\b(code|script|program)\b", cleaned)
        is not None
    )
    if wants_write_code and not is_shop_related(cleaned):
        if lang == "en":
            return (
                "I can briefly explain what programming languages are, "
                "but I don't write code or scripts here. "
                "I'm mainly The Man Store's shopping assistant — ask about products, "
                "payment, or delivery anytime! 😊"
            )
        return (
            "ខ្ញុំអាចពន្យល់ខ្លីៗថា programming ជាអ្វីបាន "
            "ប៉ុន្តែមិនសរសេរ code/script នៅទីនេះទេ។ "
            "ខ្ញុំជាចម្បងជួយហាង The Man Store — សួរទំនិញ ការទូទាត់ ឬដឹកបាន! 😊"
        )

    return None


def wants_recommend_ask(text):
    cleaned = normalize_khmer_digits((text or "").lower())
    return any(
        k in cleaned
        for k in (
            "ណែនាំ",
            "មួយណា",
            "គួរយក",
            "សម្រាប់ខ្ញុំ",
            "សម្រាប់ទៅ",
            "ស្លៀកអ្វី",
            "ពាក់អ្វី",
            "recommend",
            "suggest",
            "which one",
            "which should",
            "what should",
            "help me choose",
            "what to wear",
            "outfit for",
            "សាកសម",
            "ល្អជាង",
            "look for",
        )
    )


def is_general_knowledge_ask(text):
    """Definition / encyclopedia style — not a The Man Store shopping ask."""
    cleaned = normalize_khmer_digits(re.sub(r"\s+", " ", (text or "").strip().lower()))
    if not cleaned:
        return False
    # Store questions like «what is KHQR / return policy» stay on shop paths
    if is_shop_related(cleaned):
        return False
    return bool(
        re.search(
            r"\bwhat\s+(is|are|was|were)\b|"
            r"\bwho\s+(is|are|was|were)\b|"
            r"\bwhere\s+(is|are|was|were)\b|"
            r"\bwhen\s+(is|are|was|were)\b|"
            r"\bwhy\s+(is|are|do|does|did)\b|"
            r"\btell me about\b|\bexplain\b|\bdefine\b|"
            r"តើអ្វីជា|អ្វីទៅជា|ជាអ្វី|នៅឯណា|គឺជាអ្វី|អ្នកណាជា",
            cleaned,
        )
    )


def wants_outfit_occasion(text):
    """False for encyclopedia asks like «what is Norton University?»."""
    cleaned = normalize_khmer_digits(re.sub(r"\s+", " ", (text or "").strip().lower()))
    if is_general_knowledge_ask(cleaned):
        return False
    if re.search(
        r"\b(what|who|where)\s+(is|are|was|were)\b|"
        r"\btell me about\b|\bdefine\b|\bexplain\b|"
        r"តើអ្វីជា|អ្វីទៅជា|ជាអ្វី|គឺជាអ្វី",
        cleaned,
    ):
        if wants_recommend_ask(cleaned):
            return True
        return any(
            k in cleaned
            for k in (
                "wear",
                "outfit",
                "recommend",
                "suggest",
                "ស្លៀក",
                "ពាក់",
                "ណែនាំ",
                "សម្រាប់ទៅ",
                "for school",
                "for uni",
                "for campus",
                "for university",
                "for college",
                "to school",
                "to campus",
                "to uni",
                "ទៅសាលា",
                "ទៅសាកល",
            )
        )
    return True


def detect_occasion(text):
    """Map situation words → styling brief + catalog prefer terms."""
    cleaned = normalize_khmer_digits(re.sub(r"\s+", " ", (text or "").strip().lower()))
    # Common typo: កម្មវីធី → កម្មវិធី
    cleaned = cleaned.replace("កម្មវីធី", "កម្មវិធី")
    # (keys, id, label_km, label_en, tip_km, tip_en, prefer_terms)
    rules = [
        (
            (
                "សមុទ្រ",
                "beach",
                "sea",
                "seaside",
                "ocean",
                "កោះ",
                "island",
                "ឆ្នេរ",
                "swim",
                "vacation beach",
            ),
            "beach",
            "ទៅសមុទ្រ / beach",
            "beach / seaside",
            "ណែនាំស្រាលៗ ស្រួលក្តៅ៖ អាវ/tee · ខោស្រាល/chinos · មួក · កាបូបស្ពាយ។ ពណ៌ស្រាល (ស / beige / khaki / navy)។",
            "Keep it light for heat: tee/shirt · easy pants/chinos · hat · backpack. Prefer light colors (white / beige / khaki / navy).",
            ("shirt", "tee", "hat", "cap", "backpack", "bag", "chino", "short", "អាវ", "មួក", "កាបូប"),
        ),
        (
            (
                "អាពាហ៍",
                "ពិធី",
                "wedding",
                "formal",
                "suit",
                "ផ្លូវការ",
                "កម្មវិធី",
                "កម្មវីធី",
                "event",
                "ceremony",
                "program",
                "party event",
                "ទៅកម្មវិធី",
                "ទៅកម្មវីធី",
                "កម្មវិធីរាត្រី",
                "បុណ្យ",
            ),
            "event",
            "កម្មវិធី / ពិធី",
            "event / ceremony",
            "ណែនាំស្អាតសម្រាប់កម្មវិធី៖ អាវស្អាត · ខោ/chinos · អាវក្រៅស្រាល · ពណ៌ navy/ខ្មៅ/ស។ ប្រាប់ទំហំ — ខ្ញុំជ្រើសឱ្យ!",
            "Polished event look: neat shirt · pants/chinos · light jacket · navy/black/white. Tell me your size — I’ll pick for you!",
            ("shirt", "jacket", "chino", "belt", "អាវ", "bomber"),
        ),
        (
            (
                "សម្ភាសន៍",
                "interview",
                "ប្រជុំ",
                "meeting",
                "ការិយាល័យ",
                "ការងារ",
                "office",
                "work",
                "business",
            ),
            "office",
            "ការិយាល័យ / ការងារ",
            "office / work",
            "ណែនាំ smart casual៖ អាវ/oxford · chinos · ខ្សែ · អាវក្រៅស្រាល។",
            "Smart casual: shirt/oxford · chinos · belt · light jacket.",
            ("shirt", "chino", "jacket", "belt", "អាវ", "pants"),
        ),
        (
            (
                "ណាត់ជួប",
                "ណាត់",
                "date",
                "date night",
                "dinner date",
            ),
            "date",
            "ណាត់ជួប / date",
            "date night",
            "ណែនាំស្ទីលមិនលើស៖ polo/អាវ slim · chinos/jeans · sneakers ស្អាត។",
            "Stylish but not overdone: fitted polo/shirt · slim chinos/jeans · clean sneakers.",
            ("shirt", "polo", "chino", "jacket", "អាវ"),
        ),
        (
            (
                "gym",
                "workout",
                "fitness",
                "training",
                "ហាត់ប្រាណ",
                "កីឡា",
                "sport",
                "sporty",
            ),
            "gym",
            "gym / កីឡា",
            "gym / sport",
            "ណែនាំស្រួលហាត់៖ tee/អាវស្រាល · jogger/ខោកីឡា · កាបូប។",
            "Easy training kit: light tee · joggers · backpack.",
            ("jogger", "tee", "shirt", "backpack", "hoodie", "ខោ", "អាវ"),
        ),
        (
            (
                "ភ្លៀង",
                "rain",
                "rainy",
                "waterproof",
                "រដូវភ្លៀង",
            ),
            "rain",
            "រដូវភ្លៀង",
            "rainy weather",
            "ណែនាំអាវក្រៅ/windbreaker · កាបូប · ពណ៌ងាយផ្គូ។",
            "Grab a windbreaker/jacket · backpack · easy neutrals.",
            ("jacket", "windbreaker", "bomber", "backpack", "hoodie", "អាវក្រៅ"),
        ),
        (
            (
                "ធ្វើដំណើរ",
                "travel",
                "trip",
                "vacation",
                "កម្សាន្ត",
                "ទេសចរណ៍",
                "airport",
            ),
            "travel",
            "ធ្វើដំណើរ / travel",
            "travel / trip",
            "ណែនាំស្រួលដើរ៖ កាបូបស្ពាយ · អាវ/hoodie · ខោស្រួល · មួក។",
            "Travel-friendly: backpack · tee/hoodie · easy pants · cap.",
            ("backpack", "bag", "hoodie", "jacket", "hat", "chino", "shirt", "កាបូប", "មួក"),
        ),
        (
            (
                "party",
                "night out",
                "club",
                "យប់",
                "ចេញយប់",
            ),
            "party",
            "ចេញយប់ / party",
            "night out / party",
            "ណែនាំ sharp៖ អាវ/jacket · ខោចាស់ៗ · ពណ៌ខ្មៅ/navy។",
            "Go sharp: shirt/jacket · darker pants · black/navy.",
            ("jacket", "shirt", "bomber", "អាវ"),
        ),
        (
            (
                "សាលា",
                "សាកលវិទ្យាល័យ",
                "university",
                "uni",
                "campus",
                "school",
                "college",
            ),
            "campus",
            "សាលា / សាកលវិទ្យាល័យ",
            "school / campus",
            "ណែនាំស្រួលប្រចាំថ្ងៃ៖ tee/hoodie · ខោ/chino · កាបូប · មួក។",
            "Easy campus: tee/hoodie · pants/chinos · backpack · cap.",
            ("hoodie", "shirt", "backpack", "hat", "chino", "jacket", "កាបូប", "មួក"),
        ),
        (
            (
                "ក្តៅ",
                "hot",
                "summer",
                "humid",
                "រដូវក្តៅ",
            ),
            "hot",
            "អាកាសធាតុក្តៅ",
            "hot weather",
            "ណែនាំស្រាល៖ tee/អាវស្តើង · ខោស្រាល · មួក · ពណ៌ស្រាល។",
            "Stay cool: light tee/shirt · easy pants · hat · light colors.",
            ("shirt", "tee", "hat", "cap", "chino", "short", "មួក", "អាវ"),
        ),
        (
            (
                "ត្រជាក់",
                "cold",
                "winter",
                "រដូវត្រជាក់",
            ),
            "cold",
            "អាកាសធាតុត្រជាក់",
            "cold weather",
            "ណែនាំអាវក្រៅ/hoodie/jacket · ស្រទាប់។",
            "Layer up: hoodie/jacket/outerwear.",
            ("jacket", "hoodie", "windbreaker", "bomber", "អាវក្រៅ"),
        ),
        (
            (
                "ប្រចាំថ្ងៃ",
                "casual",
                "everyday",
                "weekend",
                "ចុងសប្តាហ៍",
                "streetwear",
            ),
            "casual",
            "ប្រចាំថ្ងៃ / casual",
            "everyday casual",
            "ណែនាំងាយៗ៖ tee/hoodie · ខោ/chino · មួក/កាបូប។",
            "Easy everyday: tee/hoodie · pants/chinos · hat/bag.",
            ("shirt", "hoodie", "chino", "hat", "backpack", "jacket", "អាវ", "ខោ"),
        ),
    ]
    def _occasion_key_hit(key: str) -> bool:
        key = (key or "").lower().strip()
        if not key:
            return False
        if re.search(r"[\u1780-\u17FF]", key):
            return key in cleaned
        # Short Latin tokens (uni, gym, hot…) must be whole words — avoid Uniqlo→uni
        if len(key) <= 4 and " " not in key:
            return re.search(rf"(?<!\w){re.escape(key)}(?!\w)", cleaned) is not None
        return key in cleaned

    for keys, oid, label_km, label_en, tip_km, tip_en, prefer in rules:
        if any(_occasion_key_hit(k) for k in keys):
            return {
                "id": oid,
                "label_km": label_km,
                "label_en": label_en,
                "tip_km": tip_km,
                "tip_en": tip_en,
                "prefer": prefer,
            }
    return None


def score_product_for_occasion(item, prefer_terms, profile=None):
    blob = " ".join(
        str(item.get(k, ""))
        for k in ("name", "product", "category", "description")
    ).lower()
    score = sum(2 for t in prefer_terms if t.lower() in blob)
    try:
        price = float(item.get("price") or 0)
        if 5 <= price <= 80:
            score += 1
    except (TypeError, ValueError):
        pass
    if item.get("in_stock", True) is False:
        score -= 5
    from services.customer_nlu import apply_reasoning_boost

    score += apply_reasoning_boost(item, profile)
    return score


def try_recommend_answer(text, lang="km", profile=None):
    """Occasion + category recommendations from live catalog (beach, event, office…)."""
    cleaned = normalize_khmer_digits(re.sub(r"\s+", " ", (text or "").strip().lower()))
    cleaned = cleaned.replace("កម្មវីធី", "កម្មវិធី")
    occasion = detect_occasion(cleaned)
    # Don't treat «what is Norton University?» as campus outfit shopping
    if occasion is not None and not wants_outfit_occasion(cleaned):
        occasion = None
    # Any detected occasion (even short «ទៅកម្មវិធី») → recommend
    if occasion is None and not wants_recommend_ask(cleaned):
        return None

    category_map = [
        (("ស្បែកជើងប៊ូ", "boot", "boots"), ["boot", "boots", "ប៊ូ"]),
        (("ស្បែកជើងប៉ាតា", "sneaker", "sneakers", "ប៉ាតា"), ["sneaker", "ប៉ាតា"]),
        (("ស្បែកជើង", "shoe", "shoes"), ["shoe", "ស្បែកជើង", "ប៉ាតា", "ប៊ូ"]),
        (("hoodie", "ហ៊ូឌី"), ["hoodie", "ហ៊ូឌី"]),
        (("អាវក្រៅ", "jacket", "windbreaker", "bomber"), ["jacket", "អាវក្រៅ", "bomber", "windbreaker"]),
        (("អាវយឺត", "t-shirt", "tshirt", "tee"), ["shirt", "tee", "អាវ"]),
        (("កាបូប", "bag", "backpack"), ["bag", "backpack", "កាបូប"]),
        (("មួក", "hat", "cap"), ["hat", "cap", "មួក"]),
        (("ខោ", "jogger", "jeans", "pants", "chinos"), ["chino", "jogger", "pants", "jeans", "ខោ"]),
        (("អាវ", "shirt", "top"), ["shirt", "អាវ", "tee"]),
    ]

    wanted_terms = None
    for keys, labels in category_map:
        if any(k in cleaned for k in keys):
            wanted_terms = labels
            break

    products, _lots = load_catalog_products()
    if not products:
        if lang == "en":
            return (
                "I'd love to recommend an outfit — browse /search while I wait for catalog data. "
                "Tell me occasion (beach / office / gym) + size."
            )
        return (
            "រីករាយណែនាំ! មើល /search រួចប្រាប់ឱកាស (សមុទ្រ / ការិយាល័យ / gym) + ទំហំ។"
        )

    pool = products
    if wanted_terms:
        matched = [
            p
            for p in products
            if any(t.lower() in " ".join(
                str(p.get(k, "")) for k in ("name", "category", "product")
            ).lower() for t in wanted_terms)
        ]
        if matched:
            pool = matched
        else:
            cat_hint = wanted_terms[0]
            if lang == "en":
                return (
                    f"I’d love to recommend **{cat_hint}** 😊 "
                    "I don’t see a strong live match in the current catalog slice — "
                    "browse /search and tell me size + color (or budget) and I’ll narrow it."
                )
            return (
                f"រីករាយណែនាំ **{cat_hint}** 😊 "
                "ឥឡូវនេះកាតាឡុកផ្ទាល់មិនទាន់មានជម្រើសច្បាស់ — "
                "សាក /search រួចប្រាប់ទំហំ + ពណ៌ (ឬថវិកា) ខ្ញុំជួយរើសឱ្យ។"
            )

    if occasion:
        ranked = sorted(
            pool,
            key=lambda p: score_product_for_occasion(p, occasion["prefer"], profile),
            reverse=True,
        )
        # Keep items that somehow match occasion, else fall back to top of pool
        scored = [
            p
            for p in ranked
            if score_product_for_occasion(p, occasion["prefer"], profile) > 0
        ]
        picks = (scored or ranked)[:4]
        label = occasion["label_en"] if lang == "en" else occasion["label_km"]
        tip = occasion["tip_en"] if lang == "en" else occasion["tip_km"]
        fav = (profile or {}).get("favorite_colors") or []
        fav_line = ""
        if fav:
            cname = str(fav[0]).replace("_", " ")
            fav_line = (
                f"Since you like **{cname}**, I prioritized matching shades. "
                if lang == "en"
                else f"ដោយសារអ្នកចូលចិត្តពណ៌ **{cname}** ខ្ញុំផ្តល់អាទិភាពម៉ូដស៊ីពណ៌នេះ។ "
            )
        if lang == "en":
            lines = [
                f"Great — outfit ideas for **{label}** 😊✨",
                fav_line + tip,
                "",
                "**Picks from live catalog:**",
            ]
            for p in picks:
                lines.append(format_product_line(p, lang="en"))
            lines.extend(
                [
                    "",
                    "May I know your preferred size, or what budget range should I consider? ✨",
                    sweet_close("en"),
                ]
            )
            return "\n".join(lines)
        lines = [
            f"ល្អណាស់ — ណែនាំសម្រាប់ **{label}** 😊✨",
            fav_line + tip,
            "",
            "**ជម្រើសពីកាតាឡុកផ្ទាល់:**",
        ]
        for p in picks:
            lines.append(format_product_line(p, lang="km"))
        lines.extend(
            [
                "",
                "ប្រាប់ទំហំ (ឧ. L / ៤២) ឬថវិកា — ខ្ញុំជ្រើសឱ្យច្បាស់ជាង ✨ "
                "មើលបន្ថែម៖ /search · /search?tab=new",
                sweet_close("km"),
            ]
        )
        return "\n".join(lines)

    # Generic recommend without clear occasion — rank by profile reasoning
    from services.customer_nlu import apply_reasoning_boost

    ranked = sorted(
        pool,
        key=lambda p: apply_reasoning_boost(p, profile),
        reverse=True,
    )
    picks = ranked[:4]
    fav = (profile or {}).get("favorite_colors") or []
    fav_line = ""
    if fav:
        cname = str(fav[0]).replace("_", " ")
        fav_line = (
            f"Since you like **{cname}**, I prioritized matching shades. "
            if lang == "en"
            else f"ដោយសារអ្នកចូលចិត្តពណ៌ **{cname}** ខ្ញុំផ្តល់អាទិភាពម៉ូដស៊ីពណ៌នេះ។ "
        )
    if lang == "en":
        lines = [
            "Happy to recommend! Here are live picks 😊✨",
            fav_line,
            "",
        ]
        for p in picks:
            lines.append(format_product_line(p, lang="en"))
        lines.extend(
            [
                "",
                "For a better match, tell me the occasion — beach, office, date, gym, travel, rain — "
                "plus size or budget ✨",
                sweet_close("en"),
            ]
        )
        return "\n".join(lines)
    lines = [
        "រីករាយណែនាំ! ទំនិញពីកាតាឡុកផ្ទាល់ 😊✨",
        fav_line,
        "",
    ]
    for p in picks:
        lines.append(format_product_line(p, lang="km"))
    lines.extend(
        [
            "",
            "ដើម្បីណែនាំច្បាស់ជាង ប្រាប់ឱកាស — សមុទ្រ · ការិយាល័យ · ណាត់ជួប · gym · ធ្វើដំណើរ · ភ្លៀង — "
            "បូកទំហំ ឬថវិកា ✨",
            sweet_close("km"),
        ]
    )
    return "\n".join(lines)


# Soft brand comparison cues (stylist guidance — not invented stock/prices)
_BRAND_COMPARE_TRAITS = {
    "nike": {
        "style": "Sport / performance",
        "comfort": "High",
        "price": "Medium–premium",
        "best_for": "Training · running · activewear",
        "style_km": "Sport / performance",
        "comfort_km": "ខ្ពស់",
        "price_km": "មធ្យម–premium",
        "best_for_km": "ហាត់ប្រាណ · រត់ · activewear",
    },
    "adidas": {
        "style": "Sport / casual lifestyle",
        "comfort": "High",
        "price": "Medium",
        "best_for": "Daily wear · street · training",
        "style_km": "Sport / casual lifestyle",
        "comfort_km": "ខ្ពស់",
        "price_km": "មធ្យម",
        "best_for_km": "ប្រចាំថ្ងៃ · street · ហាត់ប្រាណ",
    },
    "puma": {
        "style": "Sport / casual",
        "comfort": "High",
        "price": "Medium",
        "best_for": "Casual sneakers · light sport",
        "style_km": "Sport / casual",
        "comfort_km": "ខ្ពស់",
        "price_km": "មធ្យម",
        "best_for_km": "Sneakers ប្រចាំថ្ងៃ · sport ស្រាល",
    },
    "calvin klein": {
        "style": "Minimal / clean",
        "comfort": "Medium–high",
        "price": "Medium–premium",
        "best_for": "Smart casual · essentials",
        "style_km": "Minimal / ស្អាត",
        "comfort_km": "មធ្យម–ខ្ពស់",
        "price_km": "មធ្យម–premium",
        "best_for_km": "Smart casual · essentials",
    },
    "levis": {
        "style": "Denim classic",
        "comfort": "Medium–high",
        "price": "Medium",
        "best_for": "Jeans · everyday denim",
        "style_km": "Denim classic",
        "comfort_km": "មធ្យម–ខ្ពស់",
        "price_km": "មធ្យម",
        "best_for_km": "Jeans · denim ប្រចាំថ្ងៃ",
    },
}


def wants_brand_compare_ask(text):
    cleaned = normalize_khmer_digits((text or "").lower())
    if not cleaned:
        return False
    compare_cues = (
        "vs",
        "versus",
        " or ",
        "compare",
        "difference",
        "better",
        "ល្អ",
        "មួយណា",
        "និង",
        "ឬ",
        "ប្រៀប",
        "ខុសគ្នា",
    )
    if not any(k in cleaned for k in compare_cues):
        return False
    from services.taxonomy import detect_all_brand_names

    return len(detect_all_brand_names(cleaned)) >= 2


def try_brand_compare_answer(text, lang="km", profile=None):
    """Compare two brands stylistically + show live catalog samples when present."""
    if not wants_brand_compare_ask(text):
        return None
    from services.taxonomy import detect_all_brand_names

    cleaned = normalize_khmer_digits((text or "").lower())
    brands = detect_all_brand_names(cleaned)[:2]
    if len(brands) < 2:
        return None

    a, b = brands[0], brands[1]
    ta = _BRAND_COMPARE_TRAITS.get(a.lower(), {})
    tb = _BRAND_COMPARE_TRAITS.get(b.lower(), {})

    def row(key_en, key_km, default="—"):
        if lang == "en":
            return ta.get(key_en, default), tb.get(key_en, default)
        return ta.get(key_km, ta.get(key_en, default)), tb.get(key_km, tb.get(key_en, default))

    style_a, style_b = row("style", "style_km")
    comf_a, comf_b = row("comfort", "comfort_km")
    price_a, price_b = row("price", "price_km")
    best_a, best_b = row("best_for", "best_for_km")

    fav = (profile or {}).get("favorite_colors") or []
    fav_note = ""
    if fav:
        cname = str(fav[0]).replace("_", " ")
        fav_note = (
            f"\nSince you like **{cname}**, I can also filter matching shades on /search."
            if lang == "en"
            else f"\nដោយសារអ្នកចូលចិត្តពណ៌ **{cname}** ខ្ញុំអាចរើសម៉ូដស៊ីពណ៌នៅ /search ផង។"
        )

    if lang == "en":
        lines = [
            f"Great question — here’s a quick stylist compare of **{a}** vs **{b}** 😊",
            "",
            f"| | **{a}** | **{b}** |",
            "|---|---|---|",
            f"| Style | {style_a} | {style_b} |",
            f"| Comfort | {comf_a} | {comf_b} |",
            f"| Price band | {price_a} | {price_b} |",
            f"| Best for | {best_a} | {best_b} |",
            "",
            "Neither is “always better” — it depends on occasion + fit.",
            fav_note.strip(),
        ]
    else:
        lines = [
            f"សំណួរល្អ — ប្រៀបធៀបរហ័ស **{a}** និង **{b}** 😊",
            "",
            f"| | **{a}** | **{b}** |",
            "|---|---|---|",
            f"| Style | {style_a} | {style_b} |",
            f"| Comfort | {comf_a} | {comf_b} |",
            f"| តម្លៃ | {price_a} | {price_b} |",
            f"| សម្រាប់ | {best_a} | {best_b} |",
            "",
            "មិនមានមួយណា «ល្អជាងគេជានិច្ច» — អាស្រ័យឱកាស + fit។",
            fav_note.strip(),
        ]

    # Live samples if catalog has either brand
    products, _ = load_catalog_products()
    samples = []
    for brand in (a, b):
        hits = [
            p
            for p in products
            if brand.lower()
            in " ".join(str(p.get(k, "")) for k in ("name", "brand", "product")).lower()
        ][:1]
        samples.extend(hits)
    if samples:
        lines.append("")
        lines.append(
            "**Live catalog samples:**" if lang == "en" else "**ឧទាហរណ៍ពីកាតាឡុកផ្ទាល់:**"
        )
        for p in samples[:2]:
            lines.append(format_product_line(p, lang=lang))

    lines.append("")
    if lang == "en":
        lines.append(
            "Tell me shoes / apparel + size (or budget) — I’ll pick 2 strong options just for you ✨"
        )
        lines.append(sweet_close("en"))
    else:
        lines.append(
            "ប្រាប់ថាចង់ស្បែកជើង ឬសម្លៀកបំពាក់ + ទំហំ (ឬថវិកា) — ខ្ញុំរើស ២ ជម្រើសខ្លាំងសម្រាប់អ្នក ✨"
        )
        lines.append(sweet_close("km"))
    return "\n".join(lines)


def try_about_store_answer(text, store_info, lang="km"):
    """Instant store overview — common Khmer/English phrasings (no LLM)."""
    cleaned = re.sub(r"\s+", " ", (text or "").strip().lower())
    # "products in the store" is catalog chat — not brand about
    if any(
        k in cleaned
        for k in (
            "product",
            "products",
            "produt",
            "ទំនិញ",
            "ផលិតផល",
            "លក់អ្វី",
            "មានអ្វី",
            "price",
            "stock",
            "តម្លៃ",
            "ស្តុក",
        )
    ):
        return None
    cues = (
        "អំពីហាង",
        "ប្រាប់ខ្ញុំពីហាង",
        "ប្រាប់ពីហាង",
        "ពីហាង",
        "ណែនាំហាង",
        "ណែនាំពីហាង",
        "ស្គាល់ហាង",
        "ហាងនេះជាអ្វី",
        "about store",
        "about the store",
        "about themanstore",
        "tell me about",
        "me about themanstore",
    )
    mentions_store = ("ហាង" in cleaned or "store" in cleaned or "shop" in cleaned) and (
        "themanstore" in cleaned or "ប្រាប់" in cleaned or "អំពី" in cleaned or "about" in cleaned
    )
    if not (any(c in cleaned for c in cues) or mentions_store or cleaned.strip() == "themanstore"):
        return None

    for item in store_info.get("faq") or []:
        if item.get("id") != "about":
            continue
        template = item.get("answer_en") if lang == "en" else item.get("answer", "")
        if lang == "en" and not template:
            template = "{brand_summary_en} {owner_model_en}"
        return fill_store_answer(template, store_info)
    return fill_store_answer(
        "{brand_summary} {owner_model}" if lang != "en" else "{brand_summary_en} {owner_model_en}",
        store_info,
    )


def wants_one_best_product(text):
    cleaned = re.sub(r"\s+", " ", (text or "").strip().lower())
    return bool(
        re.search(
            r"\b(1|one|a|the)\s+best\b|\bbest product\b|\btop (pick|product|recommendation)\b|"
            r"\brecommend (one|1|a product)\b|\bfor me\b|"
            r"\bjust\s*1\b|\bonly\s*1\b|\bgive me (just )?1\b|\bone only\b|"
            r"ល្អបំផុត|ណែនាំមួយ|មួយណាល្អ|ទំនិញល្អ|តែមួយ|មួយគត់",
            cleaned,
        )
    )


def parse_budget_usd(text):
    """Extract a USD budget from messages like 'I have 50$', 'ត្រឹម៣០$', 'តម្លៃ10$'."""
    cleaned = normalize_khmer_digits(text or "")
    cleaned = re.sub(r"\s+", " ", cleaned.strip().lower())
    # Strip odd combining marks / typos like ទេ៊
    cleaned = re.sub(r"[^\w\s\u1780-\u17FF$.,]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    patterns = [
        r"(?:have|has|under|below|budget|max|only|just|within|with|around|about)\s*\$?\s*(\d+(?:\.\d+)?)",
        r"(?:ក្រោម|មាន|ថវិកា|ត្រឹម|ប្រហែល|តម្លៃ|ថ្លៃ)\s*\$?\s*(\d+(?:\.\d+)?)",
        r"តម្លៃ\s*(\d+(?:\.\d+)?)\s*\$?",
        r"\$\s*(\d+(?:\.\d+)?)",
        r"(\d+(?:\.\d+)?)\s*(?:\$|usd|dollars?)",
        r"ត្រឹម\s*(\d+(?:\.\d+)?)",
    ]
    for pat in patterns:
        m = re.search(pat, cleaned)
        if m:
            try:
                val = float(m.group(1))
                if 0.01 <= val <= 5000:
                    return val
            except ValueError:
                continue
    return None


def try_budget_answer(text, lang="km"):
    """Instant picks under a budget — category-aware when user says pants/shirt/etc."""
    cleaned = normalize_khmer_digits(re.sub(r"\s+", " ", (text or "").strip().lower()))
    budget = parse_budget_usd(cleaned)
    if budget is None:
        return None

    shopping = any(
        k in cleaned
        for k in (
            "buy",
            "product",
            "products",
            "should",
            "recommend",
            "what",
            "pick",
            "ទិញ",
            "ទំនិញ",
            "ផលិតផល",
            "ណែនាំ",
            "ថវិកា",
            "budget",
            "have",
            "មាន",
            "ត្រឹម",
            "ក្រោម",
            "តម្លៃ",
            "ថ្លៃ",
            "ថោក",
            "ទេ",
            "under",
            "around",
            "$",
        )
    ) or bool(detect_wanted_category(cleaned))
    if not shopping:
        return None

    products, _lots = load_catalog_products()
    if not products:
        return None

    cat = detect_wanted_category(cleaned)
    pool = products
    cat_label = None
    if cat:
        cat_label = format_category_label(cat, lang=lang)
        matched = [p for p in products if product_matches_category(p, cat[2])]
        if matched:
            pool = matched

    affordable = []
    for p in pool:
        try:
            price = float(p.get("price"))
        except (TypeError, ValueError):
            continue
        if price <= budget and p.get("in_stock", True) is not False:
            affordable.append((price, p))
    affordable.sort(key=lambda x: x[0])
    picks = [p for _, p in affordable[:5]]

    if not picks:
        # Category asked but nothing in budget — show cheapest in category or any under budget
        if cat:
            cat_all = []
            for p in products:
                if not product_matches_category(p, cat[2]):
                    continue
                try:
                    cat_all.append((float(p.get("price")), p))
                except (TypeError, ValueError):
                    continue
            cat_all.sort(key=lambda x: x[0])
            if lang == "en":
                if cat_all:
                    lines = [
                        f"I'd be happy to help! 😊 I couldn't find **{cat_label}** at or under **${budget:g}** right now.",
                        f"Closest {cat_label} we have:",
                    ]
                    for _, p in cat_all[:3]:
                        lines.append(format_product_line(p, lang="en"))
                    lines.append(
                        "Want me to raise the budget a bit, or browse sale at /search?tab=sale? ✨"
                    )
                    lines.append(sweet_close("en"))
                    return "\n".join(lines)
                return (
                    f"I couldn't find **{cat_label}** in the live catalog under **${budget:g}** 😊 "
                    "Try /search or tell me another category (shoes, hoodie, hat).\n"
                    f"{sweet_close('en')}"
                )
            if cat_all:
                lines = [
                    f"រីករាយជួយ! 😊 មិនឃើញ **{cat_label}** ក្នុង/ក្រោម **${budget:g}** ឥឡូវទេ។",
                    f"{cat_label} ជិតបំផុតដែលមាន៖",
                ]
                for _, p in cat_all[:3]:
                    lines.append(format_product_line(p, lang="km"))
                lines.append(
                    "ចង់បង្កើនថវិកាបន្តិច ឬមើល sale នៅ /search?tab=sale? ✨"
                )
                lines.append(sweet_close("km"))
                return "\n".join(lines)
            return (
                f"មិនឃើញ **{cat_label}** ក្នុងកាតាឡុកក្រោម **${budget:g}** ទេ 😊 "
                "សាក /search ឬប្រាប់ប្រភេទផ្សេង (ស្បែកជើង/hoodie/មួក)។\n"
                f"{sweet_close('km')}"
            )
        if lang == "en":
            return (
                f"No worries 😊 With a **${budget:g}** budget I couldn't find matching in-stock items right now. "
                "You can browse /search?tab=sale, or tell me if you can go a bit higher.\n"
                f"{sweet_close('en')}"
            )
        return (
            f"មិនបាច់បារម្ភទេ 😊 ជាមួយថវិកា **${budget:g}** មិនឃើញទំនិញសមក្នុងស្តុកទេ។ "
            "មើល /search?tab=sale ឬប្រាប់បើអាចបន្ថែមថវិកាបន្តិច។\n"
            f"{sweet_close('km')}"
        )

    title_cat = f" ({cat_label})" if cat_label else ""
    if lang == "en":
        lines = [
            f"Great — with **${budget:g}**{title_cat} here are strong options 😊✨",
            "",
            f"**At or under ${budget:g}:**",
        ]
        for p in picks:
            lines.append(format_product_line(p, lang="en"))
        lines.extend(
            [
                "",
                "Tell me your size (e.g. L / 42) or which one you like — "
                "I'll happily help with ordering (KHQR / VISA + delivery). "
                "More deals: /search?tab=sale",
                sweet_close("en"),
            ]
        )
        return "\n".join(lines)

    lines = [
        f"ល្អណាស់ — ថវិកា **${budget:g}**{title_cat} នៅ The Man Store នៅតែជ្រើសបាន! 😊✨",
        "",
        f"**ទំនិញក្នុង/ក្រោម ${budget:g}:**",
    ]
    for p in picks:
        lines.append(format_product_line(p, lang="km"))
    lines.extend(
        [
            "",
            "ប្រាប់ទំហំ (ឧ. L / ៤២) ឬមុខដែលចូលចិត្ត — "
            "ខ្ញុំរីករាយជួយកម្មង់ (KHQR / VISA + ដឹក) ឱ្យ។ "
            "មើល sale បន្ថែម៖ /search?tab=sale",
            sweet_close("km"),
        ]
    )
    return "\n".join(lines)


def detect_wanted_colors(text):
    """Named color intent from catalog reference (30+ fashion colors)."""
    return detect_color_keys(text)


def format_category_label(cat, lang="km"):
    """Localized category label — Khmer replies get Khmer (with EN twin when useful)."""
    if not cat:
        return "item" if lang == "en" else "ទំនិញ"
    km = str(cat[0] or "").strip()
    en = str(cat[1] or "").strip()
    terms = cat[2] if len(cat) > 2 else ()
    if km and not re.search(r"[\u1780-\u17FF]", km):
        for t in terms or ():
            if re.search(r"[\u1780-\u17FF]", str(t)):
                km = str(t).split("/")[0].strip()
                break
    if lang == "en":
        return en or km or "item"
    if km and en and km.lower() != en.lower() and re.search(r"[\u1780-\u17FF]", km):
        # Both languages visible for mixed shoppers
        if not re.search(r"[\u1780-\u17FF]", en):
            return f"{km} / {en}"
    return km or en or "ទំនិញ"


def format_stock_color_name(name, lang="km"):
    """Show color in reply language; Khmer can include English twin."""
    raw = str(name or "").strip()
    if not raw:
        return raw
    keys = detect_color_keys(raw)
    if not keys:
        # Title-case English leftovers like «Gray»
        keys = detect_color_keys(raw.lower())
    if keys:
        km = color_display(keys[0], "km")
        en = color_display(keys[0], "en")
        en_show = str(en).replace("_", " ")
        if en_show and en_show.islower():
            en_show = en_show.title()
        if lang == "en":
            return en_show or raw
        if km and en_show and km != en_show and not re.search(r"[A-Za-z]", km):
            return f"{km} ({en_show})"
        return km or en_show or raw
    return raw


def format_stock_color_list(colors, lang="km"):
    seen = set()
    out = []
    for c in colors or []:
        label = format_stock_color_name(c, lang=lang)
        key = label.lower()
        if not label or key in seen:
            continue
        seen.add(key)
        out.append(label)
    return out


def color_label(color_key, lang="km"):
    return color_display(color_key, lang=lang)


def find_products_by_colors(products, lots, color_keys, limit=4, prefer_apparel=True):
    """Return products matching color / related shades (blue→navy, etc.)."""
    tokens = color_search_tokens(color_keys)
    if not tokens:
        return []
    scored = []
    for p in products or []:
        blob = product_color_blob(p, lots)
        score = sum(1 for t in tokens if t in blob)
        if not score:
            continue
        cat = str(p.get("category") or "").lower()
        name = str(p.get("name") or p.get("product") or "").lower()
        blob_type = f"{cat} {name}"
        bonus = 0
        if prefer_apparel:
            if any(
                w in blob_type
                for w in (
                    "shirt",
                    "pant",
                    "jean",
                    "chino",
                    "jacket",
                    "hoodie",
                    "shoe",
                    "sneaker",
                    "boot",
                    "cloth",
                    "tee",
                    "polo",
                    "អាវ",
                    "ខោ",
                )
            ):
                bonus = 2
            if any(
                w in blob_type
                for w in (
                    "cap",
                    "hat",
                    "belt",
                    "wallet",
                    "backpack",
                    "bag",
                    "sock",
                    "មួក",
                    "កាបូប",
                )
            ):
                bonus -= 3
        try:
            price = float(p.get("price") or 9999)
        except (TypeError, ValueError):
            price = 9999.0
        scored.append((score + bonus, price, p))
    scored.sort(key=lambda x: (-x[0], x[1]))
    apparel = [p for s, _, p in scored if s > 0]
    if apparel:
        return apparel[:limit]
    if prefer_apparel:
        return []
    return [p for _, _, p in scored[:limit]]


def product_color_blob(product, lots):
    """Join lot colors by product name (Neon lots often lack product_id)."""
    name = str(product.get("name") or product.get("product") or "").strip().lower()
    pid = str(product.get("id") or "")
    bits = [
        name,
        str(product.get("product") or "").lower(),
        str(product.get("color") or "").lower(),
        str(product.get("category") or "").lower(),
    ]
    for lot in lots or []:
        lot_name = str(lot.get("product") or lot.get("name") or "").strip().lower()
        lot_pid = str(lot.get("product_id") or "")
        if (name and lot_name == name) or (
            pid and lot_pid == pid and lot_pid not in ("", "None", "none")
        ):
            bits.append(str(lot.get("color") or "").lower())
    return " ".join(bits)


def wants_color_question(text):
    cleaned = normalize_khmer_digits(text or "").lower()
    # Common typos: ពណ័ / ពណ៍ instead of ពណ៌
    cleaned = cleaned.replace("ពណ័", "ពណ៌").replace("ពណ៍", "ពណ៌")
    # Colloquial អី ≈ អ្វី
    cleaned = cleaned.replace("ពណ៌អី", "ពណ៌អ្វី").replace("ពណ៌ អី", "ពណ៌អ្វី")
    return any(
        k in cleaned
        for k in (
            "ពណ៌",
            "color",
            "colour",
            "colors",
            "colours",
            "what color",
            "which color",
            "មានពណ៌",
            "ពណ៌អ្វី",
            "ពណ៌ណា",
            "ពណ៌ខ្លះ",
            "ពណ៌អីខ្លះ",
        )
    )


def collect_live_colors(products, lots):
    """Gather colors from inventory lots + color words in product names."""
    known = [
        "black",
        "white",
        "gray",
        "grey",
        "navy",
        "beige",
        "khaki",
        "green",
        "blue",
        "brown",
        "red",
        "pink",
        "olive",
        "cream",
        "ivory",
        "orange",
        "yellow",
        "purple",
        "maroon",
        "camel",
        "tan",
        "silver",
        "gold",
        "ខ្មៅ",
        "ស",
        "ប្រផេះ",
        "ខៀវ",
        "ត្នោត",
        "បៃតង",
        "ក្រហម",
        "ផ្កាឈូក",
    ]
    found = []
    seen = set()

    def add(color):
        c = str(color or "").strip()
        if not c:
            return
        key = c.lower()
        if key in seen:
            return
        seen.add(key)
        found.append(c)

    for lot in lots or []:
        add(lot.get("color"))

    for p in products or []:
        name = str(p.get("name") or p.get("product") or "").lower()
        for color in known:
            if color.lower() in name:
                add(color.title() if color.isascii() else color)
    return found


def sweet_close(lang="km"):
    """Light warm closer — sincere, not pushy."""
    if lang == "en":
        return "Take your time — I’m happy to help you find a great match 💕"
    return "យកពេលបាន — រីករាយជួយរកម៉ូដស៊ីអ្នក 💕"


def try_colors_answer(text, store_info, lang="km"):
    """Answer 'មានពណ៌អ្វីខ្លះ?' from live lots + product names."""
    if not wants_color_question(text):
        return None

    products, lots = load_catalog_products()
    colors = collect_live_colors(products, lots)
    cat = detect_wanted_category(text)
    note = fill_store_answer(
        "{color_note_en}" if lang == "en" else "{color_note}",
        store_info,
    )
    close = sweet_close(lang)

    # If category mentioned, filter lots/products for that category
    if cat:
        terms = cat[2]
        label = format_category_label(cat, lang=lang)
        cat_lots = [
            lot
            for lot in lots or []
            if any(t.lower() in str(lot.get("product") or "").lower() for t in terms)
        ]
        cat_products = [p for p in products if product_matches_category(p, terms)]
        colors = collect_live_colors(cat_products, cat_lots) or colors
        colors = format_stock_color_list(colors, lang=lang)
        if lang == "en":
            if colors:
                return (
                    f"Absolutely! 😊 For **{label}**, these colors are showing in stock: "
                    f"**{', '.join(colors[:12])}**.\n"
                    f"{note}\n"
                    "Which shade feels like *you*? Tell me color + size — "
                    "I’ll pick 2 strong options on /search.\n"
                    f"{close}"
                )
            return (
                f"Happy to help with **{label}** colors 😊 "
                "Exact shades are on each product page (screen colors can differ a bit).\n"
                f"{note}\n"
                "Popular picks: black, white, navy, beige, grey — which do you love?\n"
                f"{close}"
            )
        if colors:
            return (
                f"ដំណឹងល្អ! 😊 សម្រាប់ **{label}** ពណ៌ដែលមានក្នុងស្តុកឥឡូវ៖ "
                f"**{', '.join(colors[:12])}**។\n"
                f"{note}\n"
                "តើពណ៌ណាស៊ីស្ទីលអ្នក? ប្រាប់ពណ៌ + ទំហំ — "
                "ខ្ញុំរើស ២ ជម្រើសស្អាតនៅ /search ឱ្យ!\n"
                f"{close}"
            )
        return (
            f"រីករាយជួយរកពណ៌ **{label}** 😊 "
            "ពណ៌ពិតប្រាកដមើលនៅទំព័រផលិតផល (អេក្រង់អាចខុសបន្តិច)។\n"
            f"{note}\n"
            "ពេញនិយម៖ ខ្មៅ · ស · navy · beige · ប្រផេះ — អ្នកចូលចិត្តមួយណា?\n"
            f"{close}"
        )

    colors = format_stock_color_list(colors, lang=lang)
    if lang == "en":
        if colors:
            return (
                f"Great news! 😊 Colors currently showing in stock include: "
                f"**{', '.join(colors[:12])}**.\n"
                f"{note}\n"
                "Want a specific item (shirt / pants / jacket / hat)? "
                "Tell me color + size — I’ve got you.\n"
                f"{close}"
            )
        return (
            "I’d be happy to help with colors! 😊 Exact options are on each product page.\n"
            f"{note}\n"
            "Popular choices: black, white, navy, beige, grey, khaki green. "
            "Which category are you shopping — tops, pants, or jackets?\n"
            f"{close}"
        )
    if colors:
        return (
            f"ដំណឹងល្អ! 😊 ពណ៌ដែលឃើញក្នុងស្តុកឥឡូវ៖ **{', '.join(colors[:12])}**។\n"
            f"{note}\n"
            "ចង់រកមុខណា (អាវ / ខោ / អាវក្រៅ / មួក)? ប្រាប់ពណ៌ + ទំហំ — ខ្ញុំជួយរកឱ្យ!\n"
            f"{close}"
        )
    return (
        f"រីករាយជួយរកពណ៌! 😊 ពណ៌ពិតប្រាកដមើលនៅទំព័រផលិតផលនីមួយៗ។\n"
        f"{note}\n"
        "ពេញនិយម៖ ខ្មៅ · ស · navy · beige · ប្រផេះ · khaki green។ "
        "អ្នកកំពុងរកអាវ ខោ ឬអាវក្រៅ?\n"
        f"{close}"
    )


def try_category_browse_answer(text, lang="km", profile=None):
    """Smart replies for 'មានអាវទេ?', 'got nike?', 'blk jacket', 'មានថ្មីទេ', deals."""
    cleaned = normalize_khmer_digits(re.sub(r"\s+", " ", (text or "").strip().lower()))
    cleaned = cleaned.replace("ពណ័", "ពណ៌").replace("ពណ៍", "ពណ៌")
    cleaned = cleaned.replace("សរ", "ស")
    if wants_order_track_ask(cleaned):
        return None  # order status → track path, not catalog
    if wants_store_policy_ask(cleaned):
        return None  # return/exchange/pay/ship → FAQ, not catalog
    if parse_budget_usd(cleaned) is not None:
        return None  # budget path handles it
    if wants_color_question(cleaned):
        return None  # colors path handles it
    if wants_size_advice_ask(cleaned):
        return None  # size advice asks kg/height — not catalog dump
    if wants_recommend_ask(cleaned) or detect_occasion(cleaned):
        return None  # occasion recommend path handles it

    from services.customer_nlu import is_style_discovery_ask, apply_reasoning_boost

    # Aesthetic discovery («អាវស្អាតៗ») is clarified upstream — don't dump catalog
    if is_style_discovery_ask(cleaned):
        return None

    cheap = wants_cheap_deals(cleaned)
    cat = detect_wanted_category(cleaned)
    brand = detect_wanted_brand(cleaned)
    size = detect_wanted_size(cleaned)
    color_keys = detect_wanted_colors(cleaned)
    this_turn_shop = (
        cheap
        or bool(cat)
        or bool(brand)
        or bool(size)
        or bool(color_keys)
        or wants_new_arrival_ask(cleaned)
        or wants_availability_ask(cleaned)
        or wants_search_ask(cleaned)
        or wants_buy_ask(cleaned)
        or wants_stock_ask(cleaned)
    )
    # Remembered colors only for a real shop turn — never for "i am sad" / small talk.
    if not color_keys and this_turn_shop and profile and profile.get("favorite_colors"):
        color_keys = list(profile.get("favorite_colors") or [])
    if not size and this_turn_shop and profile and profile.get("size"):
        size = profile.get("size")
    new_ask = wants_new_arrival_ask(cleaned)
    shopping = (
        cheap
        or bool(cat)
        or bool(brand)
        or bool(size)
        or bool(color_keys)
        or new_ask
        or wants_availability_ask(cleaned)
        or wants_search_ask(cleaned)
        or wants_buy_ask(cleaned)
        or wants_stock_ask(cleaned)
    )
    if not shopping:
        return None
    # Avoid bare "need"/"show" with no product signal
    if not (cheap or cat or brand or size or color_keys or new_ask or wants_availability_ask(cleaned) or wants_buy_ask(cleaned)):
        if wants_search_ask(cleaned) and not needs_product_data(cleaned):
            return None

    # Size alone (sz42 / size 42 មានទេ) — ask which product, don't dump whole catalog
    if size and not cat and not brand and not color_keys and not cheap and not new_ask:
        if lang == "en":
            return (
                f"Yes — I can check size **{size}**. "
                "Which item (shoes / pants / shirt / jacket)? "
                "Or browse /search and tell me the product name."
            )
        return (
            f"មាន — ខ្ញុំអាចពិនិត្យទំហំ **{size}**។ "
            "ជ្រើសប្រភេទ (ស្បែកជើង / ខោ / អាវ / អាវក្រៅ) ឬប្រាប់ឈ្មោះទំនិញ។"
        )

    products, lots = load_catalog_products()
    if not products:
        if lang == "en":
            return (
                "I'd be happy to help you find that. "
                "Browse live styles at /search · new /search?tab=new · sale /search?tab=sale. "
                "Tell me size or budget for a tighter pick."
            )
        return (
            "រីករាយជួយរក! មើលទំនិញផ្ទាល់នៅ /search · ថ្មី /search?tab=new · sale /search?tab=sale។ "
            "ប្រាប់ទំហំ ឬថវិកា — ខ្ញុំជ្រើសឱ្យច្បាស់ជាង។"
        )

    pool = list(products)
    label_bits = []
    if cat:
        label_bits.append(format_category_label(cat, lang=lang))
        matched = [p for p in pool if product_matches_category(p, cat[2])]
        pool = matched if matched else []
    if brand:
        label_bits.append(brand)
        branded = [
            p
            for p in pool
            if brand.lower() in str(p.get("name") or p.get("product") or "").lower()
        ]
        # If brand not in names, keep category pool / full catalog for soft miss
        if branded:
            pool = branded
        elif not cat and not color_keys and not cheap and not new_ask:
            pool = []
    color_miss = False
    color_disp = color_label(color_keys[0], lang=lang) if color_keys else None
    if color_keys:
        label_bits.append(color_disp)
        color_matched = find_products_by_colors(pool, lots, color_keys, limit=40)
        if color_matched:
            pool = color_matched
        elif cat or brand:
            color_miss = True
        else:
            # Color-only: try related shades (blue→navy) across catalog
            whole = find_products_by_colors(products, lots, color_keys, limit=40)
            if whole:
                pool = whole
            else:
                pool = []
                color_miss = True
    if new_ask:
        label_bits.insert(0, "new" if lang == "en" else "ថ្មី")

        def _new_key(p):
            return str(p.get("created_at") or p.get("id") or p.get("name") or "")

        pool = sorted(pool or products, key=_new_key, reverse=True)

    label = " / ".join(label_bits) if label_bits else None

    # Sort cheap-first when user asks cheap/sale; else keep order (new-first already sorted)
    scored = []
    for p in pool if pool is not None else []:
        try:
            price = float(p.get("price"))
        except (TypeError, ValueError):
            price = 9999.0
        boost = apply_reasoning_boost(p, profile)
        scored.append((price - boost * 2.0, p))  # lower sort key = better when cheap-first
    if cheap or (not new_ask and not brand):
        scored.sort(key=lambda x: x[0])
    elif profile and (profile.get("favorite_colors") or profile.get("budget") is not None):
        # Prefer profile-matched items when not sorting purely by price
        scored.sort(key=lambda x: (apply_reasoning_boost(x[1], profile) * -1, x[0]))
    picks = [p for _, p in scored[:5]]

    size_note = ""
    if size:
        size_note = (
            f"\nLooking for size **{size}** — tell me which item and I'll check stock."
            if lang == "en"
            else f"\nកំពុងរកទំហំ **{size}** — ប្រាប់ឈ្មោះទំនិញ ខ្ញុំពិនិត្យស្តុកឲ្យ។"
        )

    # Color-only miss: similar = nearby shades (blue→navy), never random cheap hats
    if color_keys and not picks and not cat and not brand and not cheap and not new_ask:
        cname = color_disp or color_keys[0]
        related = [
            r.replace("_", " ")
            for r in (related_color_ids(color_keys[0]) or tuple(color_keys))
            if r != color_keys[0]
        ]
        similar = find_products_by_colors(products, lots, color_keys, limit=4)
        if similar:
            alt = [format_product_line(p, lang=lang) for p in similar]
            return soft_sell_miss(
                cname,
                lang=lang,
                alternatives=alt,
                related_colors=related[:5],
                wear_tip=(
                    "Tell me pants / shirt / jacket / shoes if you want that color on a specific item."
                    if lang == "en"
                    else "ប្រាប់ខោ / អាវ / អាវក្រៅ / ស្បែកជើង បើចង់ពណ៌នេះលើមុខជាក់លាក់។"
                ),
            )
        # No color match — warm miss + related shades + ask category (or prior product)
        prior = ""
        tax = match_product_type(cleaned)
        if tax and tax.get("name_en"):
            prior = tax.get("name_en")
        miss_label = f"{cname}" + (f" {prior}" if prior else "")
        return soft_sell_miss(
            miss_label,
            lang=lang,
            alternatives=None,
            related_colors=related[:5] or ["navy", "black", "grey"],
            wear_tip=(
                f"Still shopping for **{prior}**? Tell me another color — or pants / shirt / jacket / shoes."
                if prior and lang == "en"
                else (
                    f"កំពុងរក **{prior}** នៅ? ប្រាប់ពណ៌ផ្សេង ឬប្រភេទ (ខោ / អាវ / អាវក្រៅ / ស្បែកជើង)។"
                    if prior
                    else (
                        "Just tell me what you’re shopping for — pants, shirt, jacket, shoes, or bag."
                        if lang == "en"
                        else "ប្រាប់មុខដែលកំពុងរក — ខោ · អាវ · អាវក្រៅ · ស្បែកជើង · កាបូប។"
                    )
                )
            ),
        )

    if (cat or brand or color_keys) and not picks:
        # No exact match → say no, then recommend similar (score by shared category terms)
        similar = []
        terms = [str(t).lower() for t in (cat[2] or ()) if t] if cat else []
        jean_ask = any(t in ("jean", "jeans", "denim") for t in terms)
        if cat:
            scored_sim = []
            for p in products:
                blob = " ".join(
                    str(p.get(x, "")) for x in ("name", "product", "category", "description")
                ).lower()
                score = sum(1 for t in terms if t in blob)
                # Jeans miss → similar bottoms (chinos / pants / joggers), not random apparel
                if jean_ask and re.search(
                    r"(?<!\w)(chinos?|pants?|joggers?|trousers?|shorts)(?!\w)", blob
                ):
                    score = max(score, 1)
                if score:
                    scored_sim.append((score, float(p.get("price") or 9999), p))
            scored_sim.sort(key=lambda x: (-x[0], x[1]))
            similar = [p for _, _, p in scored_sim[:4]]
        if not similar:
            # Brand-only miss: prefer apparel, never lead with cheapest random hat
            apparel = []
            for p in products:
                blob = " ".join(
                    str(p.get(x, "")) for x in ("name", "product", "category")
                ).lower()
                if any(
                    w in blob
                    for w in (
                        "shirt",
                        "pant",
                        "jean",
                        "jacket",
                        "hoodie",
                        "shoe",
                        "chino",
                        "cloth",
                    )
                ) and not any(w in blob for w in ("hat", "cap", "dad hat")):
                    apparel.append(p)
            similar = sorted(
                apparel or products,
                key=lambda p: float(p.get("price") or 9999),
            )[:3]
        alt_lines = [format_product_line(p, lang=lang) for p in similar]
        miss = label or (brand or "item")
        tax = match_product_type(cleaned)
        wear_tip = ""
        related = None
        if color_keys:
            related = [
                r.replace("_", " ")
                for r in (related_color_ids(color_keys[0]) or tuple(color_keys))
                if r != color_keys[0]
            ][:5]
        if tax:
            # Wear tip only when we have no color alternatives to suggest
            if not related:
                wear_tip = tax.get("wear_en") if lang == "en" else tax.get("wear_km")
            miss = tax.get("name_en") or miss
            if color_disp:
                miss = f"{color_disp} {miss}".strip()
        return soft_sell_miss(
            miss,
            lang=lang,
            alternatives=alt_lines,
            size_note=size_note,
            wear_tip=wear_tip or "",
            related_colors=related,
        )

    if cheap and not cat and not brand and not color_keys:
        if lang == "en":
            lines = [
                "Absolutely! 😊 Looking for affordable, great-value picks? Here are strong options:",
                "",
            ]
            for p in picks:
                lines.append(format_product_line(p, lang="en"))
            lines.extend(
                [
                    "",
                    "Which type are you interested in (pants / T-shirt / shoes), "
                    "and what budget range should I consider? ✨",
                    sweet_close("en"),
                ]
            )
            return "\n".join(lines)
        lines = [
            "បាទ/ចាស ពិតជាបាន 😊 កំពុងរកតម្លៃសមរម្យ — នេះជម្រើសគុណតម្លៃល្អ៖",
            "",
        ]
        for p in picks:
            lines.append(format_product_line(p, lang="km"))
        lines.extend(
            [
                "",
                "តើអ្នកចាប់អារម្មណ៍ប្រភេទណា (ខោ / អាវយឺត / ស្បែកជើង) "
                "និងថវិកាប្រហែលប៉ុន្មាន ដើម្បីឱ្យខ្ញុំជួយជ្រើស? ✨",
                sweet_close("km"),
            ]
        )
        return "\n".join(lines)

    if not picks:
        return None

    # Category / brand / color / new browse
    color_hint = ""
    if color_miss and color_keys:
        base_label = " / ".join(b for b in label_bits if b != color_disp) or (
            "styles" if lang == "en" else "ទំនិញ"
        )
        cname = color_disp or color_keys[0]
        color_hint = (
            f"\nI couldn’t confirm **{cname}** on these yet — here are close **{base_label}** "
            f"meanwhile (you can double-check colors on /search):"
            if lang == "en"
            else f"\nមិនទាន់ឃើញពណ៌ **{cname}** ច្បាស់លើមុខទាំងនេះ — នេះជម្រើស **{base_label}** ជិតៗ "
            f"(ពិនិត្យពណ៌នៅ /search បាន)៖"
        )
    if lang == "en":
        head = (
            f"Great taste looking for **{label}** — here are a few popular matches 😊✨"
            if color_miss
            else f"Great news! Here are **{label or 'styles'}** available for you 😊✨"
        )
        lines = [
            head,
            color_hint,
            "",
        ]
        for p in picks[:3]:
            lines.append(format_product_line(p, lang="en"))
        lines.extend(
            [
                size_note,
                "",
                "May I know your preferred **size**? "
                "Or what budget range would you like me to consider? ✨",
                sweet_close("en"),
            ]
        )
        return "\n".join(line for line in lines if line is not None)
    head = (
        f"ជម្រើសដ៏ល្អ! កំពុងរក **{label}** — នេះជម្រើសពេញនិយមខ្លះ 😊✨"
        if color_miss
        else f"ដំណឹងល្អ! នេះ **{label or 'ទំនិញ'}** ដែលមានសម្រាប់អ្នក 😊✨"
    )
    lines = [
        head,
        color_hint,
        "",
    ]
    for p in picks[:3]:
        lines.append(format_product_line(p, lang="km"))
    lines.extend(
        [
            size_note,
            "",
            "អាចប្រាប់ **ទំហំ** ដែលអ្នកចូលចិត្តបានទេ? "
            "ឬថវិកាប្រហែលប៉ុន្មាន ដើម្បីឱ្យខ្ញុំជួយជ្រើសរើស? ✨",
            sweet_close("km"),
        ]
    )
    return "\n".join(line for line in lines if line is not None)


def try_hero_product_answer(text, lang="km"):
    """Cloudflare-style: one top pick with benefits + CTA (instant, persuasive)."""
    if not wants_one_best_product(text):
        return None

    # Prefer live bestseller, else first strong in-stock catalog item
    hero = None
    why_bits_en = []
    why_bits_km = []

    rows = get_top_sellers(use_cache=True) or []
    if rows:
        top = rows[0]
        name = top.get("product_name") or "The Man Store pick"
        price = top.get("sample_price")
        qty = top.get("total_qty")
        hero = {"name": name, "price": price, "stock": None, "sizes": None}
        why_bits_en.append("Our current top seller — customers already love it")
        why_bits_km.append("ទំនិញលក់ដាច់បំផុតបច្ចុប្បន្ន — អតិថិជនជ្រើសច្រើន")
        if qty:
            why_bits_en.append(f"Proven demand ({qty} units sold in sales data)")
            why_bits_km.append(f"មានទិន្នន័យលក់ {qty} ដើម")

    if not hero:
        db_data = get_db_products(use_cache=True) or {}
        products = list(db_data.get("products") or []) or load_json_products()
        if not products:
            return None
        # Prefer in-stock with a real price
        ranked = sorted(
            products,
            key=lambda p: (
                0 if p.get("in_stock", True) else 1,
                -(float(p.get("stock_quantity") or p.get("stock") or 0)),
            ),
        )
        p = ranked[0]
        hero = {
            "name": p.get("name") or p.get("product") or "The Man Store pick",
            "price": p.get("price"),
            "stock": p.get("stock_quantity", p.get("stock")),
            "sizes": p.get("sizes") or p.get("size"),
            "category": p.get("category"),
        }
        why_bits_en.append("Great everyday men's style from The Man Store")
        why_bits_km.append("សម្លៀកបំពាក់បុរសប្រចាំថ្ងៃពី The Man Store")
        if hero.get("category"):
            why_bits_en.append(f"Category: {hero['category']}")
            why_bits_km.append(f"ប្រភេទ៖ {hero['category']}")

    name = hero["name"]
    price = hero.get("price")
    sizes = hero.get("sizes")
    stock = hero.get("stock")

    if lang == "en":
        lines = [
            "Based on what's popular at The Man Store, here's my **top recommendation** for you:",
            f"**{name}** — a strong all-around pick",
            "",
            "Why you'll like it:",
        ]
        for b in why_bits_en[:4]:
            lines.append(f"- {b}")
        if price is not None and price != "":
            lines.append(f"- Fair retail price: **${price}**")
        if sizes not in (None, "", []):
            lines.append(f"- Sizes available: {sizes}")
        if stock not in (None, ""):
            lines.append(f"- In stock: {stock}")
        lines.extend(
            [
                "",
                "**Get started:** tell me your size (e.g. L / 42) or budget, "
                "and I’ll confirm stock and how to order (KHQR / VISA + delivery).",
            ]
        )
        return "\n".join(lines)

    lines = [
        "តាមទិន្នន័យ/ស្តុក The Man Store ខ្ញុំណែនាំ **មួយមុខល្អបំផុត** សម្រាប់អ្នក៖",
        f"**{name}** — ជម្រើសសាកសមទូទៅ",
        "",
        "ហេតុអ្វីគួរយក៖",
    ]
    for b in why_bits_km[:4]:
        lines.append(f"- {b}")
    if price is not None and price != "":
        lines.append(f"- តម្លៃសមរម្យ៖ **${price}**")
    if sizes not in (None, "", []):
        lines.append(f"- ទំហំមាន៖ {sizes}")
    if stock not in (None, ""):
        lines.append(f"- ស្តុក៖ {stock}")
    lines.extend(
        [
            "",
            "**ចាប់ផ្តើម:** ប្រាប់ទំហំ (ឧ. L / ៤២) ឬថវិកា "
            "ខ្ញុំបញ្ជាក់ស្តុក និងរបៀបកម្មង់ (KHQR / VISA + ដឹក) ឱ្យ។",
        ]
    )
    return "\n".join(lines)


def wants_sales_catalog_chat(text):
    """Browse / recommend / 'what products' → LLM sales pitch when USE_LLM=1."""
    cleaned = re.sub(r"\s+", " ", (text or "").strip().lower())
    if wants_store_policy_ask(cleaned):
        return False
    if wants_one_best_product(cleaned):
        return True
    keys = (
        "product",
        "products",
        "produt",
        "produts",
        "ទំនិញ",
        "ផលិតផល",
        "លក់អ្វី",
        "មានអ្វីខ្លះ",
        "បញ្ជី",
        "recommend",
        "suggest",
        "ណែនាំ",
        "what do you sell",
        "have in",
        "in store",
        "in the store",
        "about you store",
        "about your store",
        "show me",
        "pick",
        "outfit",
        "jacket",
        "shoe",
        "bag",
        "ស្បែក",
        "អាវ",
        "កាបូប",
        "មួក",
        "budget",
        "ថវិកា",
        "under $",
        "ក្រោម",
        "best",
        "for me",
    )
    return any(k in cleaned for k in keys)


def try_gift_recipient_answer(text, store_info, lang="km"):
    """
    Gift for wife/girlfriend/her — instant (not Cloudflare refuse, not slow LLM).
    The Man Store is a general store; suggest women's items, unisex bags + gift packing.
    """
    cleaned = re.sub(r"\s+", " ", (text or "").strip().lower())
    # "girl friend" / "boy friend" typos with spaces
    cleaned = (
        cleaned.replace("girl friend", "girlfriend")
        .replace("boy friend", "boyfriend")
        .replace("girl-friend", "girlfriend")
        .replace("boy-friend", "boyfriend")
    )
    gift_for_her = any(
        k in cleaned
        for k in (
            "for my wife",
            "for wife",
            "for her",
            "for my girlfriend",
            "to my girlfriend",
            "to girlfriend",
            "my girlfriend",
            "girlfriend",
            "wife",
            "for my daughter",
            "for daughter",
            "to my daughter",
            "daughter",
            "ប្រពន្ធ",
            "ភរិយា",
            "មិត្តស្រី",
            "សម្រាប់ស្រី",
            "ឱ្យប្រពន្ធ",
            "ទិញឱ្យនាង",
            "ទិញអោយប្រពន្ធ",
            "កូនស្រី",
            "ឱ្យកូនស្រី",
        )
    )
    gift_for_him = any(
        k in cleaned
        for k in (
            "for my husband",
            "for husband",
            "for him",
            "for my boyfriend",
            "to my boyfriend",
            "my boyfriend",
            "boyfriend",
            "husband",
            "for my son",
            "for son",
            "to my son",
            "for my kid",
            "for my child",
            "son",
            "ប្តី",
            "មិត្តប្រុស",
            "សម្រាប់បុរស",
            "ឱ្យប្តី",
            "ទិញឱ្យគាត់",
            "កូនប្រុស",
            "ឱ្យកូន",
            "សម្រាប់កូន",
        )
    )
    is_gift = any(
        k in cleaned
        for k in ("gift", "present", "អំណោយ", "ទិញឱ្យ", "ទិញអោយ")
    )
    shopping = any(k in cleaned for k in ("buy", "want", "ទិញ", "ចង់", "order", "កម្មង់"))
    # Need a recipient OR explicit gift word + shopping
    if gift_for_her or gift_for_him:
        pass  # e.g. "buy for my wife"
    elif is_gift and shopping:
        gift_for_him = True  # default gift browse → men's picks
    else:
        return None

    db_data = get_db_products(use_cache=True) or {}
    products = list(db_data.get("products") or []) or load_json_products()

    def is_bag(p):
        blob = " ".join(
            str(p.get(k, "")) for k in ("name", "product", "category", "description")
        ).lower()
        return any(x in blob for x in ("កាបូប", "bag", "backpack", "crossbody"))

    bags = [p for p in products if is_bag(p)][:3]
    mens = [
        p
        for p in products
        if not is_bag(p)
    ][:3]

    gift_note = fill_store_answer(
        "{gift_policy_en}" if lang == "en" else "{gift_policy}",
        store_info,
    )
    target = store_info.get("target_customers_en" if lang == "en" else "target_customers", "")

    if gift_for_her:
        if lang == "en":
            lines = [
                "Happy to help with a gift! 😊",
                "",
                "The Man Store is **mainly men's fashion** — we don't focus on women's clothing. "
                "That said, **some bags are unisex** and make a practical gift.",
                "",
                "**Best gift ideas from our store:**",
            ]
            if bags:
                for p in bags:
                    lines.append(format_product_line(p, lang="en"))
            else:
                lines.append("- Unisex / men's bags (ask the owner which styles remain)")
            lines.extend(
                [
                    "",
                    gift_note,
                    "",
                    "**Next step:** tell me a budget (e.g. under $25) or preferred bag style, "
                    "and I’ll help you order (KHQR / VISA + delivery).",
                ]
            )
            return "\n".join(lines)
        lines = [
            "រីករាយជួយជ្រើសអំណោយ! 😊",
            "",
            "The Man Store **លក់ជាចម្បងសម្រាប់បុរស** — មិនផ្តោតសម្លៀកបំពាក់ស្ត្រីទេ។ "
            "ប៉ុន្តែ **កាបូបខ្លះប្រើបានទាំងប្រុសស្រី** អាចធ្វើអំណោយបានល្អ។",
            "",
            "**ជម្រើសអំណោយពីហាង៖**",
        ]
        if bags:
            for p in bags:
                lines.append(format_product_line(p, lang="km"))
        else:
            lines.append("- កាបូប unisex (សួរម្ចាស់ហាងពីម៉ូតនៅសល់)")
        lines.extend(
            [
                "",
                gift_note,
                "",
                "**ជំហានបន្ទាប់:** ប្រាប់ថវិកា (ឧ. ក្រោម 25$) ឬប្រភេទកាបូប "
                "ខ្ញុំជួយកម្មង់ (KHQR / VISA + ដឹក) ឱ្យ។",
            ]
        )
        return "\n".join(lines)

    # Gift for him / general gift → men's picks
    picks = mens or products[:3]
    if lang == "en":
        lines = [
            "Great — a gift for him is perfect for The Man Store! 😊",
            "",
            target,
            "",
            "**Strong gift picks:**",
        ]
        for p in picks:
            lines.append(format_product_line(p, lang="en"))
        lines.extend(
            [
                "",
                gift_note,
                "",
                "**Next step:** share his size (e.g. L / shoe 42) or budget, "
                "and I’ll confirm stock and how to order.",
            ]
        )
        return "\n".join(lines)
    lines = [
        "ល្អណាស់ — អំណោយសម្រាប់បុរសត្រូវនឹង The Man Store! 😊",
        "",
        target,
        "",
        "**ទំនិញសាកសមធ្វើអំណោយ៖**",
    ]
    for p in picks:
        lines.append(format_product_line(p, lang="km"))
    lines.extend(
        [
            "",
            gift_note,
            "",
            "**ជំហានបន្ទាប់:** ប្រាប់ទំហំ (ឧ. L / ស្បែកជើង ៤២) ឬថវិកា "
            "ខ្ញុំបញ្ជាក់ស្តុក និងរបៀបកម្មង់ឱ្យ។",
        ]
    )
    return "\n".join(lines)


def try_mood_answer(text, store_info, lang="km"):
    """Instant empathy / small-talk — never wait on the LLM."""
    cleaned = re.sub(r"\s+", " ", (text or "").strip().lower())
    bare = re.sub(r"[^\w\s\u1780-\u17FF]", "", cleaned).strip()
    compact = re.sub(r"\s+", "", bare)

    # Never steal real shopping / budget / product questions (incl. slang)
    if (
        parse_budget_usd(cleaned) is not None
        or wants_cheap_deals(cleaned)
        or detect_wanted_category(cleaned)
        or detect_wanted_brand(cleaned)
        or detect_wanted_size(cleaned)
        or detect_wanted_colors(cleaned)
        or wants_availability_ask(cleaned)
        or wants_search_ask(cleaned)
        or wants_buy_ask(cleaned)
        or wants_stock_ask(cleaned)
        or wants_new_arrival_ask(cleaned)
        or wants_price_ask(cleaned)
        or wants_color_question(cleaned)
        or wants_recommend_ask(cleaned)
        or detect_occasion(cleaned) is not None
        or asks_fee_followup(cleaned)
        or wants_store_policy_ask(cleaned)
        or has_standalone_shop_intent(cleaned)
        or "$" in cleaned
        or any(
            k in cleaned
            for k in (
                "តម្លៃ",
                "ថ្លៃ",
                "ត្រឹម",
                "ថវិកា",
                "ទំនិញ",
                "ផលិតផល",
                "ស្តុក",
                "ដឹក",
                "បង់",
                "ពណ៌",
                "ពណ័",
                "ពណ៍",
                "ណែនាំ",
                "សមុទ្រ",
                "កម្មវិធី",
                "កម្មវីធី",
                "ពិធី",
                "ទៅ",
                "គិតលុយ",
                "គិតសេវា",
                "សេវា",
                "ប្តូរ",
                "ត្រឡប់",
                "price",
                "budget",
                "order",
                "buy",
                "cart",
                "delivery",
                "color",
                "recommend",
                "beach",
                "event",
                "got",
                "wanna",
                "promo",
                "sale",
                "discount",
                "nike",
                "adidas",
                "fee",
                "return",
                "exchange",
            )
        )
    ):
        return None

    if (
        re.search(r"are\s*you\s*a?i", compact)
        or "whoareyou" in compact
        or "whatareyou" in compact
        or "អ្នកជាអ្នកណា" in cleaned
        or "អ្នកជាអ្វី" in cleaned
        or "ជា ai" in cleaned
    ):
        return identity_answer(store_info, lang=lang)

    if re.match(r"^(hi|hello|hey|yo|sup)\b", bare):
        return None

    if is_simple_greeting(cleaned):
        return None

    # Emotions / feelings → instant empathy + soft shop invite
    sad = any(
        k in cleaned
        for k in (
            "sad",
            "unhappy",
            "depressed",
            "lonely",
            "cry",
            "crying",
            "upset",
            "ធ្វើទុក្ខ",
            "ពិបាកចិត្ត",
            "សោកសៅ",
            "អស់សង្ឃឹម",
        )
    )
    happy = any(
        k in cleaned
        for k in ("happy", "great", "awesome", "excited", "រីករាយ", "សប្បាយ")
    )
    tired = any(
        k in cleaned
        for k in ("tired", "bored", "sleepy", "អស់កម្លាំង", "ធុញ")
    )
    if sad:
        if lang == "en":
            return (
                "Sorry you're feeling down 💙 I'm here if you want a distraction — "
                "we can pick a nice The Man Store look (hat, bag, jacket) or just chat about "
                "what you'd like to wear. What sounds good?"
            )
        return (
            "សុំទោសដែលអ្នកកំពុងមានអារម្មណ៍មិនល្អ 💙 "
            "បើចង់ប្តូរអារម្មណ៍ ខ្ញុំអាចជួយជ្រើសទំនិញ The Man Store "
            "(មួក កាបូប អាវ) ឬសួរអ្វីក៏បាន។ តើចង់សាកមួយណា?"
        )
    if happy:
        if lang == "en":
            return (
                "Love that energy! 🎉 Want to celebrate with a The Man Store pick — "
                "shoes, jacket, or a bag? Tell me your budget or size."
            )
        return (
            "រីករាយជាមួយអ្នក! 🎉 ចង់ជ្រើសទំនិញ The Man Store "
            "(ស្បែកជើង អាវ កាបូប) ទេ? ប្រាប់ថវិកា ឬទំហំបាន។"
        )
    if tired:
        if lang == "en":
            return (
                "Rest up. When you're ready, I can suggest easy everyday The Man Store pieces "
                "(comfortable shoes, casual jacket). Want ideas?"
            )
        return (
            "សម្រាកបន្តិចសិន។ ពេលរួច ខ្ញុំអាចណែនាំទំនិញ The Man Store ប្រចាំថ្ងៃ "
            "(ស្បែកជើង/អាវក្រៅ)។ ចង់ឱ្យណែនាំទេ?"
        )

    fillers = {
        "hm", "hmm", "hmmm", "umm", "uh", "ok", "okay", "k", "kk",
        "lol", "haha", "hehe", "ggg", "gg", "??", "???", "...",
        "អឺ", "ហឺ", "អូខេ", "អូខេណា",
    }
    is_filler = (
        bare in fillers
        or compact in fillers
        or (len(bare) <= 3 and bare.isalpha())
        or re.fullmatch(r"[.?!~]+", cleaned or "") is not None
    )
    # Short non-shop chatter
    short_chitchat = (
        is_filler
        or (len(bare) <= 24 and not is_shop_related(text) and not needs_llm(text))
    )
    if not short_chitchat:
        return None

    en_pool = [
        "I'm here 🙂✨ What are you shopping for — or tell me the occasion (work / casual / date)?",
        "Happy to help! 😊 Want product ideas, sizes, payment, or delivery info?",
        "No rush 💕 Share a style, color, or budget and I’ll find a strong match.",
        "Sure! 😊 Try «black jeans», «How can I pay?», or «How to order?»",
        "Got it 😊 Looking for men / women / kids styles, or a quick policy answer?",
    ]
    km_pool = [
        "ខ្ញុំនៅទីនេះ 🙂✨ កំពុងរកអ្វី — ឬប្រាប់ឱកាស (ការងារ / ប្រចាំថ្ងៃ / ណាត់ជួប)?",
        "រីករាយជួយ! 😊 ចង់បានទំនិញ ទំហំ ការទូទាត់ ឬដឹក?",
        "មិនប្រញាប់ 💕 ប្រាប់ស្ទីល ពណ៌ ឬថវិកា — ខ្ញុំរកមុខសមឱ្យ។",
        "សាកសួរ៖ «jeans ខ្មៅ» «បង់ម៉េច?» ឬ «របៀបកម្មង់?» 😊",
        "បាទ/ចាស 😊 រកបុរស / ស្ត្រី / កុមារ ឬសួរគោលការណ៍ហាង?",
    ]
    pool = en_pool if lang == "en" else km_pool
    idx = abs(hash(bare or cleaned or "x")) % len(pool)
    return pool[idx]


def needs_llm(text):
    """Only pay for LLM when the question truly needs free-form reasoning."""
    cleaned = re.sub(r"\s+", " ", (text or "").strip().lower())
    if not cleaned:
        return False
    # Clear general-knowledge / advice prompts
    if re.search(
        r"\b(what|who|why|how|when|where|explain|define|compare|difference|"
        r"should i|can you|could you|tell me about)\b|"
        r"តើ|ហេតុអ្វី|យ៉ាងម៉េច|ពន្យល់|អធិប្បាយ|ប្រៀបធៀប",
        cleaned,
    ):
        return True
    if wants_flexible_reply(cleaned):
        return True
    # Shop questions not covered by instant filters still may need LLM
    if is_shop_related(cleaned):
        # Simple catalog browse already handled elsewhere; leftover shop → LLM
        return True
    return False


def try_general_bridge_answer(text, store_info, lang="km"):
    """
    Brief general answers + soft The Man Store invite.
    Unlike Cloudflare: answer facts (e.g. CEOs) — do not refuse as "out of scope".
    """
    cleaned = re.sub(r"\s+", " ", (text or "").strip().lower())
    bare = cleaned.rstrip("!?.។ ")
    if is_shop_related(cleaned):
        return None

    asks_person = bool(
        re.search(
            r"\b(ceo|founder|owner|president|who is|who's|who was|leader|"
            r"នាយក|ស្ថាបនិក|ម្ចាស់|អ្នកណា)\b",
            cleaned,
        )
    )

    # Well-known general facts — answer like Gemini (not refuse like Cloudflare)
    fact_replies = [
        (
            ("telegram",),
            ("ceo", "founder", "នាយក", "ស្ថាបនិក", "who"),
            {
                "km": (
                    "CEO / ស្ថាបនិក Telegram គឺ **Pavel Durov** (ប៉ាវែល ឌូរ៉ូវ)។\n\n"
                    "ខ្ញុំជា {assistant_name} របស់ The Man Store — "
                    "បើចង់សួរទំនិញ តម្លៃ ស្តុក ការទូទាត់ ឬដឹក សួរបន្តបាន! 😊"
                ),
                "en": (
                    "Telegram's founder/CEO is **Pavel Durov**.\n\n"
                    "I'm {assistant_name} for The Man Store — "
                    "ask anytime about products, prices, stock, payment, or delivery! 😊"
                ),
            },
        ),
        (
            ("facebook", "meta"),
            ("ceo", "founder", "នាយក", "ស្ថាបនិក", "who"),
            {
                "km": (
                    "CEO របស់ Meta/Facebook គឺ **Mark Zuckerberg**។\n\n"
                    "ខ្ញុំជា {assistant_name} — អាចជួយទិញនៅ The Man Store ផងដែរ! 😊"
                ),
                "en": (
                    "Meta/Facebook's CEO is **Mark Zuckerberg**.\n\n"
                    "I'm {assistant_name} — I can also help you shop at The Man Store! 😊"
                ),
            },
        ),
        (
            ("google", "alphabet"),
            ("ceo", "founder", "នាយក", "ស្ថាបនិក", "who"),
            {
                "km": (
                    "CEO របស់ Alphabet/Google គឺ **Sundar Pichai**។ "
                    "(ស្ថាបនិកដើម៖ Larry Page និង Sergey Brin)\n\n"
                    "ខ្ញុំជា {assistant_name} — សួរទំនិញ The Man Store បានគ្រប់ពេល! 😊"
                ),
                "en": (
                    "Alphabet/Google's CEO is **Sundar Pichai** "
                    "(co-founded by Larry Page and Sergey Brin).\n\n"
                    "I'm {assistant_name} — ask about The Man Store products anytime! 😊"
                ),
            },
        ),
        (
            ("youtube",),
            ("ceo", "founder", "នាយក", "ស្ថាបនិក", "who"),
            {
                "km": (
                    "YouTube ជាកម្មសិទ្ធិ Google/Alphabet។ "
                    "CEO Alphabet/Google គឺ **Sundar Pichai** "
                    "(អ្នកបង្កើត YouTube ដើម៖ Chad Hurley, Steve Chen, Jawed Karim)។\n\n"
                    "ខ្ញុំជា {assistant_name} — ចង់មើលទំនិញ The Man Store ទេ? 😊"
                ),
                "en": (
                    "YouTube is owned by Google/Alphabet. "
                    "Alphabet/Google CEO is **Sundar Pichai** "
                    "(YouTube co-founded by Chad Hurley, Steve Chen, Jawed Karim).\n\n"
                    "I'm {assistant_name} — want The Man Store product help? 😊"
                ),
            },
        ),
    ]
    for subjects, person_keys, payloads in fact_replies:
        if any(s in cleaned for s in subjects) and (
            asks_person or any(k in cleaned for k in person_keys)
        ):
            template = payloads.get("en" if lang == "en" else "km") or payloads["km"]
            return fill_store_answer(template, store_info)

    # App/definition cards — only for "what is X", not "who is CEO of X"
    if asks_person:
        return None

    topics = {
        "youtube": {
            "km": (
                "YouTube គឺជាវេបសាយ/កម្មវិធីចែករំលែក និងមើលវីដេអូរបស់ Google។\n\n"
                "ខ្ញុំជា {assistant_name} — បើចង់សួរទំនិញ The Man Store "
                "(តម្លៃ ស្តុក បង់លុយ ដឹក) សួរបាន! 😊"
            ),
            "en": (
                "YouTube is Google's video-sharing website/app.\n\n"
                "I'm {assistant_name} — ask about The Man Store products, "
                "prices, stock, payment, or delivery anytime! 😊"
            ),
        },
        "facebook": {
            "km": (
                "Facebook គឺជាបណ្តាញសង្គមសម្រាប់ភ្ជាប់មិត្តភក្តិ និងទំព័រអាជីវកម្ម។\n\n"
                "ខ្ញុំជា {assistant_name} — ចង់សួរអំពីទំនិញ ឬរបៀបកម្មង់ទេ? 😊"
            ),
            "en": (
                "Facebook is a social network for people and business pages.\n\n"
                "I'm {assistant_name} — want help with products or how to order? 😊"
            ),
        },
        "tiktok": {
            "km": (
                "TikTok គឺជាកម្មវិធីវីដេអូខ្លីៗ។\n\n"
                "ខ្ញុំជា {assistant_name} — ជួយជ្រើសស្បែកជើង/អាវ ឬមើលរបៀបបង់លុយបាន! 😊"
            ),
            "en": (
                "TikTok is a short-video app.\n\n"
                "I'm {assistant_name} — I can help with shoes, jackets, or payment! 😊"
            ),
        },
        "google": {
            "km": (
                "Google គឺជាក្រុមហ៊ុនបច្ចេកវិទ្យា (ស្វែងរក, YouTube, Gmail ជាដើម)។\n\n"
                "ខ្ញុំជា {assistant_name} — អាចជួយទំនិញបុរសនៅ The Man Store បាន! 😊"
            ),
            "en": (
                "Google is a tech company (Search, YouTube, Gmail, and more).\n\n"
                "I'm {assistant_name} — I can help with men's products at The Man Store! 😊"
            ),
        },
        "instagram": {
            "km": (
                "Instagram គឺជាបណ្តាញសង្គមផ្តោតរូបភាព/វីដេអូ។\n\n"
                "ខ្ញុំជា {assistant_name} — ចង់មើលទំនិញលក់ដាច់ទេ? 😊"
            ),
            "en": (
                "Instagram is a photo/video social app.\n\n"
                "I'm {assistant_name} — want bestsellers? 😊"
            ),
        },
        "chatgpt": {
            "km": (
                "ChatGPT គឺជា AI chatbot ទូទៅរបស់ OpenAI។ "
                "ខ្ញុំជា {assistant_name} សម្រាប់ហាង The Man Store។\n\n"
                "តើចង់សួរអ្វីអំពីទំនិញ ឬហាង? 😊"
            ),
            "en": (
                "ChatGPT is OpenAI's general AI chatbot. "
                "I'm {assistant_name} for The Man Store.\n\n"
                "What would you like to know about products or the store? 😊"
            ),
        },
        "telegram": {
            "km": (
                "Telegram គឺជាកម្មវិធីផ្ញើសារ។ "
                "អាចទាក់ទងម្ចាស់ហាង The Man Store តាមបណ្តាញផ្លូវការបាន។\n\n"
                "ចង់សួរតម្លៃ ទំហំ ឬរបៀបកម្មង់ទេ? 😊"
            ),
            "en": (
                "Telegram is a messaging app. "
                "You can also contact the The Man Store owner via official channels.\n\n"
                "Want prices, sizes, or how to order? 😊"
            ),
        },
        "python": {
            "km": (
                "Python គឺជាភាសាសរសេរកម្មវិធីពេញនិយម "
                "(ទិន្នន័យ, AI, វេបសាយ ជាដើម)។\n\n"
                "ខ្ញុំជា {assistant_name} — មិនសរសេរ code ឱ្យទេ "
                "ប៉ុន្តែជួយទិញទំនិញ The Man Store បាន! 😊"
            ),
            "en": (
                "Python is a popular programming language "
                "(data, AI, websites, and more).\n\n"
                "I'm {assistant_name} — I don't write code here, "
                "but I can help you shop at The Man Store! 😊"
            ),
        },
        "javascript": {
            "km": (
                "JavaScript គឺជាភាសាសរសេរកម្មវិធីសម្រាប់វេបសាយ/កម្មវិធី។\n\n"
                "ខ្ញុំជា {assistant_name} — ចង់សួរទំនិញ The Man Store ទេ? 😊"
            ),
            "en": (
                "JavaScript is a programming language for websites/apps.\n\n"
                "I'm {assistant_name} — want The Man Store product help? 😊"
            ),
        },
        "programming": {
            "km": (
                "Programming គឺការសរសេរណែនាំឱ្យកុំព្យូទ័រធ្វើការ "
                "(ឧ. Python, JavaScript)។\n\n"
                "ខ្ញុំជា {assistant_name} — អាចជួយជ្រើសសម្លៀកបំពាក់បុរសបាន! 😊"
            ),
            "en": (
                "Programming means writing instructions for computers "
                "(e.g. Python, JavaScript).\n\n"
                "I'm {assistant_name} — I can help you pick men's fashion! 😊"
            ),
        },
        "norton university": {
            "km": (
                "**Norton University** គឺជាសាកលវិទ្យាល័យឯកជននៅភ្នំពេញ ប្រទេសកម្ពុជា "
                "(មានមុខវិជ្ជាដូច IT, ធុរកិច្ច ជាដើម)។\n\n"
                "ខ្ញុំជា **{assistant_name}** របស់ **The Man Store** — "
                "រីករាយជួយរកសម្លៀកបំពាក់ / ទំហំ / តម្លៃ បន្ត! "
                "បើចង់បានឈុតសម្រាប់ទៅសាលា ប្រាប់ទំហំ ឬថវិកាបាន 😊"
            ),
            "en": (
                "**Norton University** is a private university in Phnom Penh, Cambodia "
                "(programs include areas like IT and business).\n\n"
                "I'm **{assistant_name}**, your **The Man Store** shopping assistant — "
                "happy to help with clothes, sizes, and prices next. "
                "If you want a campus outfit, tell me your size or budget 😊"
            ),
        },
        "norton": {
            "km": (
                "**Norton University** គឺជាសាកលវិទ្យាល័យឯកជននៅភ្នំពេញ ប្រទេសកម្ពុជា។\n\n"
                "ខ្ញុំជា **{assistant_name}** នៅ **The Man Store** — "
                "សួរទំនិញ តម្លៃ ស្តុក ឬរបៀបកម្មង់បានគ្រប់ពេល! 😊"
            ),
            "en": (
                "**Norton University** is a private university in Phnom Penh, Cambodia.\n\n"
                "I'm **{assistant_name}** at **The Man Store** — "
                "ask anytime about products, prices, stock, or how to order! 😊"
            ),
        },
    }

    asks_what = bool(
        re.search(
            r"\bwhat (is|are)\b|\bdefine\b|\btell me about\b|\bexplain\b|"
            r"តើអ្វីជា|អ្វីទៅជា|ជាអ្វី",
            cleaned,
        )
    )
    hit = None
    for key in sorted(topics.keys(), key=len, reverse=True):
        if not (
            re.search(rf"(?<!\w){re.escape(key)}(?!\w)", cleaned) or key in bare
        ):
            continue
        if asks_what or key in {"python", "javascript", "programming", "norton", "norton university"}:
            hit = topics[key]
            break

    if hit:
        template = hit.get("en" if lang == "en" else "km") or hit.get("km")
        return fill_store_answer(template, store_info)

    # Generic off-topic: brief polite redirect (no fake deep facts)
    if is_general_knowledge_ask(cleaned) or asks_what:
        topic = None
        m = re.search(
            r"(?:what\s+(?:is|are)|who\s+(?:is|are)|where\s+(?:is|are)|tell me about|explain)\s+(.+)",
            cleaned,
        )
        if m:
            topic = re.sub(r"[?!.]+$", "", m.group(1)).strip(" .,")
        if lang == "en":
            head = (
                f"About **{topic.title()}** — I only cover that briefly here."
                if topic
                else "Happy to note that briefly."
            )
            return fill_store_answer(
                head
                + "\n\nI'm **{assistant_name}**, your polite shopping assistant for **The Man Store** "
                "(men's, women's & kids fashion in Cambodia). "
                "I can help with products, sizes, prices, stock, payment, or delivery — "
                "what would you like to shop for? 😊",
                store_info,
            )
        head = (
            f"អំពី **{topic}** — ខ្ញុំឆ្លើយបានខ្លីៗតែប៉ុណ្ណោះនៅទីនេះ។"
            if topic
            else "រីករាយឆ្លើយខ្លីៗ។"
        )
        return fill_store_answer(
            head
            + "\n\nខ្ញុំជា **{assistant_name}** របស់ **The Man Store** — "
            "ជំនួយការទិញសម្លៀកបំពាក់ (បុរស ស្ត្រី កុមារ)។ "
            "សួរទំនិញ ទំហំ តម្លៃ ស្តុក ការទូទាត់ ឬដឹកបាន — ចង់រកអ្វីដែរ? 😊",
            store_info,
        )

    return None


def build_adaptive_system_prompt(assistant, lang, shop, context):
    """LLM may freely elaborate; only hard shop numbers stay grounded in RAG."""
    tips_en = (
        "CONSULTATIVE SELLER (help them feel understood — never push to buy):\n"
        "- Goal: find the best-fit product. Emotion first, then logic.\n"
        "- Formula: Greeting → Ask need → Understand purpose → Budget/style → "
        "Recommend → Explain benefits → Alternatives → Invite decision (no pressure).\n"
        "- ASK WORD REPLACE: «What are you looking for today?» not «What do you want?»; "
        "«May I know your preferred size?» · «Which color matches your style?» · "
        "«What budget range would you like me to consider?» · "
        "«May I know what occasion you need it for?» · "
        "«Is this style close to what you are looking for?»\n"
        "- ANSWER WORD REPLACE: Absolutely! 😊 · "
        "Unfortunately not available now, but… · Great news — we have this for you · "
        "Affordable / great value (not «cheap») · Premium quality (not «expensive») · "
        "Order when ready (not Buy now) · Popular choice / great for your needs · "
        "I would recommend this because… · Let me check (not I don’t know).\n"
        "- Ask ONE question at a time. Ask NEED/occasion, not only the item.\n"
        "- Feeling words: Perfect choice · Great taste · Customer favorite · Stylish · Reliable.\n"
        "- Never invent prices, discounts, ratings, or stock.\n"
        "- Typos/mixed Khmer–English: understand quietly — never correct spelling.\n"
    )
    tips_km = (
        "AI Seller ពិគ្រោះ (ធ្វើឱ្យអតិថិជនមានអារម្មណ៍ថា «គេយល់ចិត្តខ្ញុំ» — មិនមែនបង្ខំ):\n"
        "- រូបមន្ត៖ ស្វាគមន៍ → សួរតម្រូវការ → យល់ឱកាស → ថវិកា/ស្ទីល → "
        "ណែនាំ → ពន្យល់អត្ថប្រយោជន៍ → ជម្រើសផ្សេង → អញ្ជើញសម្រេច (មិនដាក់សម្ពាធ)។\n"
        "- ពាក្យសួរជំនួស៖ «ថ្ងៃនេះកំពុងស្វែងរកអ្វីដែរ?» មិនមែន «ចង់អី?» · "
        "ទំហំចូលចិត្ត · ពណ៌សមស្ទីល · ថវិកាប្រហែល · ឱកាសប្រើ · ស្ទីលនេះស៊ីទេ?\n"
        "- ពាក្យឆ្លើយជំនួស៖ បាទ/ចាស ពិតជាបាន 😊 · សូមអភ័យទោស បច្ចុប្បន្នមិនមានទេ ប៉ុន្តែ… · "
        "ដំណឹងល្អ មានសម្រាប់អ្នក · តម្លៃសមរម្យ · Premium · កម្មង់ពេលត្រៀមរួច · "
        "ណែនាំព្រោះ… · ខ្ញុំពិនិត្យជូន (មិនមែនមិនដឹង)។\n"
        "- សួរម្តងមួយ។ សួរតម្រូវការ/ឱកាស មិនមែនតែទំនិញ។\n"
        "- ពាក្យអារម្មណ៍៖ ជម្រើសដ៏ល្អ · សមនឹងអ្នក · ពេញនិយម · មានស្ទីល។\n"
        "- កុំប្រឌិតតម្លៃ/ស្តុក/ផ្កាយ។ Typo៖ យល់ដោយស្ងៀម។\n"
    )
    if lang == "en":
        return (
            f"You are {assistant} — a warm, expert The Man Store shopping advisor "
            "(fashion for men, women, and kids in Cambodia). "
            "Your goal is to help customers find the best-fit product — not to pressure them to buy.\n"
            f"{tips_en}"
            "WHAT YOU MAY ADD (beyond the provided data):\n"
            "- Natural eloquence, encouragement, gift/occasion wording, outfit pairing ideas, "
            "size common sense, comparisons, soft closing questions.\n"
            "- General knowledge when asked.\n"
            "WHAT MUST STAY GROUNDED:\n"
            "- Exact product names, prices, stock, sizes, and store policies → use RAG below. "
            "Never invent fake prices, discounts, stock counts, ratings, or order IDs.\n"
            "Keep replies useful and concise. No code/hacking.\n"
            f"RAG (facts only — rewrite in your own words):\n{context}"
        )
    return (
        f"អ្នកគឺ {assistant} — ទីប្រឹក្សាលក់ The Man Store រួសរាយ និងមានជំនាញ "
        "(ម៉ូដបុរស ស្ត្រី និងកុមារនៅកម្ពុជា)។ "
        "គោលដៅ៖ ជួយរកផលិតផលសមបំផុត — មិនមែនបង្ខំឱ្យទិញ។\n"
        f"{tips_km}"
        "អាចថែមបាន (លើសពីទិន្នន័យ)៖\n"
        "- ពាក្យពេចន៍ធម្មជាតិ លើកទឹកចិត្ត ភាសាអំណោយ/ឱកាស "
        "ណែនាំរបៀបស្លៀក ទំហំតាមសុភវិនិច្ឆ័យ ប្រៀបធៀប សំណួរទន់។\n"
        "- ឆ្លើយចំណេះទូទៅពេលសួរ។\n"
        "ត្រូវផ្អែកលើ RAG៖\n"
        "- ឈ្មោះទំនិញ តម្លៃ ស្តុក ទំហំ គោលការណ៍ហាង — កុំប្រឌិតលេខ ឬផ្កាយ។\n"
        "ចម្លើយមានប្រយោជន៍ និងខ្លី។ កុំសរសេរ code។\n"
        f"RAG (facts — សរសេរឡើងវិញតាមពាក្យអ្នក):\n{context}"
    )


def predict(message, history, product_focus=None, request=None):
    text = message_text(message).strip()
    session_id = _session_id_from_request(request)
    # Idle > SESSION_TIMEOUT_SECONDS → forget prior turns for follow-up routing
    history = effective_history(history, session_id)
    cached = session_memory.get(session_id)
    # Prefer Gradio State focus (per browser tab); fall back to server cache
    if product_focus is not None:
        product_focus = _normalize_cached_focus(product_focus)
    else:
        product_focus = _normalize_cached_focus(cached.get("product_focus"))
    # New/cleared chat or pronoun-only history must not reuse stale T-Shirt focus
    if not history:
        product_focus = None
        if cached.get("product_focus"):
            session_memory.touch(session_id, product_focus={}, history=[])
    else:
        product_focus = drop_stale_product_focus(history, product_focus)

    # Greetings before any DB/RAG/LLM — must stay instant even during model load
    if is_simple_greeting(text):
        reply = greeting_reply(detect_reply_lang(text, history), text=text)
        session_memory.touch(session_id, history=list(history or []))
        return reply

    store_info = load_store_info()
    # Data cleaning: digits / typos / whitespace (never scold the user)
    text = clean_text(text, store_info).strip() or text
    text = apply_taxonomy_typos(text)
    # Second pass: reverse decode after typo map (e.g. naej→jean already mapped)
    from services.reverse_text import decode_reversed_text

    decoded = decode_reversed_text(text)
    if decoded != text:
        print(f"[reverse] {text!r} -> {decoded!r}", flush=True)
        text = decoded
        text = apply_taxonomy_typos(text)
    lang = detect_reply_lang(text, history)

    # Order status first — «ទំនិញខ្ញុំដល់ណាហើយ» must never dump the catalog
    track = try_order_track_answer(text, lang=lang)
    if track:
        session_memory.touch(session_id, product_focus=product_focus, history=list(history or []))
        return track

    # «មិនទាន់កម្មង់ / មិនទាន់មានគណនី» — not late delivery
    new_shopper = try_new_shopper_answer(text, store_info, lang=lang)
    if new_shopper:
        session_memory.touch(session_id, product_focus=product_focus, history=list(history or []))
        return new_shopper

    # «អាវនេះ…» / «មួយនេះ…» with no prior product named → ask which item
    unresolved = try_unresolved_product_reference(
        text, history, product_focus=product_focus, lang=lang
    )
    if unresolved:
        session_memory.touch(session_id, product_focus=product_focus, history=list(history or []))
        return unresolved

    # Size advice: ask kg + height, then suggest band
    size_advice = try_size_advice_answer(
        text, history=history, lang=lang, profile=None
    )
    if size_advice:
        session_memory.touch(session_id, product_focus=product_focus, history=list(history or []))
        return size_advice

    # Short follow-ups use prior turns (e.g. return policy → «គិតលុយទេ?»)
    follow = try_contextual_followup_answer(text, history, store_info, lang=lang)
    if follow:
        session_memory.touch(
            session_id,
            product_focus=update_product_focus_after_turn(text, history, product_focus),
            history=list(history or []),
        )
        return follow

    # Product memory: "black jeans?" → later "have size 20?" keeps black jeans
    before = text
    text = expand_product_followup(text, history, product_focus=product_focus)
    if text != before:
        print(f"[memory] expanded {before!r} -> {text!r}", flush=True)
    text = expand_with_chat_context(text, history, lang=lang)
    product_focus = update_product_focus_after_turn(text, history, product_focus)

    # Customer NLU: intent + entities + durable profile
    from services.customer_nlu import (
        angry_care_reply,
        extract_shop_entities,
        hesitant_help_reply,
        merge_customer_profile,
        vague_or_style_clarify,
    )

    customer_profile = _normalize_customer_profile(cached.get("customer_profile"))
    entities = extract_shop_entities(text)
    customer_profile = merge_customer_profile(customer_profile, entities)
    # Mirror profile into product_focus only when this chat already named a product
    if history_has_product_mention(history) or entities.get("intent") in (
        "browse",
        "search",
        "buy",
        "stock",
        "recommend",
    ):
        if customer_profile.get("favorite_colors"):
            product_focus = dict(product_focus or {})
            product_focus["favorite_colors"] = list(customer_profile["favorite_colors"])
            if not product_focus.get("colors"):
                product_focus["colors"] = list(customer_profile["favorite_colors"])
        if customer_profile.get("size") and not (product_focus or {}).get("size"):
            product_focus = dict(product_focus or {})
            product_focus["size"] = customer_profile["size"]
    if customer_profile.get("budget") is not None:
        product_focus = dict(product_focus or {})
        product_focus["budget"] = customer_profile["budget"]
    # Only restore category/phrase from profile when this chat already named a product
    if history_has_product_mention(history):
        if customer_profile.get("category") and not (product_focus or {}).get("category"):
            product_focus = dict(product_focus or {})
            product_focus["category"] = customer_profile["category"]
        if customer_profile.get("phrase") and not (product_focus or {}).get("phrase"):
            product_focus = dict(product_focus or {})
            product_focus["phrase"] = customer_profile["phrase"]

    # Sliding TTL — each message resets the idle timer
    session_memory.touch(
        session_id,
        product_focus=product_focus,
        customer_profile=customer_profile,
        history=list(history or []) + [{"role": "user", "content": text}],
    )

    # Emotion: angry / hesitant before random mood filler (skip when comparing brands)
    if entities.get("intent") != "comparison":
        if entities.get("emotion") == "angry" or entities.get("intent") == "complaint":
            # Prefer exchange/care when product issue; else angry wait care
            exchange = try_exchange_care_answer(text, store_info, lang=lang)
            if exchange:
                return exchange
            if entities.get("emotion") == "angry":
                return angry_care_reply(lang=lang)
        if entities.get("emotion") == "hesitant" or entities.get("intent") == "hesitant":
            return hesitant_help_reply(lang=lang)

    # Preference-only: «ខ្ញុំចូលចិត្តពណ៌ខ្មៅ»
    if entities.get("intent") == "preference" and entities.get("pref_colors"):
        cname = format_stock_color_name(
            str(entities["pref_colors"][0]).replace("_", " "), lang=lang
        )
        if lang == "en":
            return (
                f"Love your taste! 😊 I’ll keep **{cname}** in mind for you.\n"
                "What are you looking for today — pants, shirt, shoes, or jacket?\n"
                f"{sweet_close('en')}"
            )
        return (
            f"រសជាតិអ្នកល្អណាស់! 😊 ខ្ញុំនឹងចងចាំពណ៌ **{cname}** សម្រាប់អ្នក។\n"
            "ថ្ងៃនេះតើអ្នកកំពុងស្វែងរកអ្វីដែរ — ខោ · អាវ · ស្បែកជើង · អាវក្រៅ?\n"
            f"{sweet_close('km')}"
        )

    # Vague / aesthetic discovery — clarify before dumping catalog
    clarify = vague_or_style_clarify(text, lang=lang, profile=customer_profile)
    if clarify and entities.get("intent") in ("vague_browse", "style_discovery"):
        return clarify

    # When to wear / ពាក់ពេលណា — stylist answer from taxonomy
    wear = wear_when_answer(text, lang=lang)
    if wear:
        return wear

    # Brand compare («Nike និង Adidas មួយណាល្អ?»)
    compare = try_brand_compare_answer(text, lang=lang, profile=customer_profile)
    if compare:
        return compare

    # --- USE_LLM=1: open mode — LLM for novel; instant for common shop ---
    if config.USE_LLM:
        # Order tracking first — never catalog dump or off-topic bridge
        track = try_order_track_answer(text, lang=lang)
        if track:
            return track

        # Mood/empathy before catalog so "i am sad" never becomes a product dump
        mood = try_mood_answer(text, store_info, lang=lang)
        if mood:
            return mood

        # Budget / category FIRST so "មានត្រឹម៣០$" / "មានអាវទេ?" never hit mood filler
        budget = try_budget_answer(text, lang=lang)
        if budget:
            return budget

        # Product browse BEFORE generic color FAQ so "black jean" ≠ random black bags
        # Skip raw dump for style-discovery (already clarified above)
        browse = try_category_browse_answer(
            text, lang=lang, profile=customer_profile
        )
        if browse:
            return browse

        colors = try_colors_answer(text, store_info, lang=lang)
        if colors:
            return colors

        # Off-topic / general knowledge BEFORE occasion outfits
        # («what is Norton University?» must not become campus fashion)
        bridge = try_general_bridge_answer(text, store_info, lang=lang)
        if bridge:
            return bridge

        # Policies (return/pay/ship) before catalog browse — avoid «What»→hat false match
        exchange = try_exchange_care_answer(text, store_info, lang=lang)
        if exchange:
            return exchange

        if wants_store_policy_ask(text):
            policy = try_fast_answer(
                text, store_info, lang=lang, allow_faq=True, allow_products=False
            )
            if policy:
                return policy

        recommend = try_recommend_answer(text, lang=lang, profile=customer_profile)
        if recommend:
            return recommend

        # FAQ / how-to-order / pay BEFORE LLM (never “Take your time…” for shop Qs)
        fast = try_fast_answer(
            text, store_info, lang=lang, allow_faq=True, allow_products=True
        )
        if fast:
            return fast

        scoped = try_scope_answer(text, lang=lang)
        if scoped:
            return scoped

        gift = try_gift_recipient_answer(text, store_info, lang=lang)
        if gift:
            return gift

        hero = try_hero_product_answer(text, lang=lang)
        if hero:
            return hero

        about = try_about_store_answer(text, store_info, lang=lang)
        if about:
            return about

        if not needs_llm(text):
            if lang == "en":
                return (
                    "I'd be happy to help 🙂 I'm not sure I caught that fully. "
                    "Is it about products, orders, delivery, returns, or payment? "
                    "Or tell me what you're looking for in a few words."
                )
            return (
                "រីករាយជួយ 🙂 ខ្ញុំមិនច្បាស់ពេញលេញទេ។ "
                "តើអំពីទំនិញ កម្មង់ ដឹក ប្តូរ ឬការទូទាត់? "
                "ឬប្រាប់ខ្លីៗថាចង់រកអ្វី។"
            )

        # LLM: free phrasing + RAG facts (slower on 3B)
        context = retrieve_rag_context(text or "themanstore", store_info)
        assistant = store_info.get("assistant_name", config.ASSISTANT_NAME)
        system_prompt = build_adaptive_system_prompt(
            assistant, lang, shop=True, context=context
        )

        messages = [{"role": "system", "content": system_prompt}]
        recent = (
            (history or [])[-config.MAX_HISTORY_TURNS :]
            if config.MAX_HISTORY_TURNS
            else []
        )
        for role, content in iter_history_turns(recent):
            messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": text})
        ensure_model_loaded()
        prompt = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        return sanitize_reply(generate_reply(prompt), store_info, lang=lang)

    # --- USE_LLM=0: curated instant paths only ---
    flexible = wants_flexible_reply(text)
    shop = is_shop_related(text)

    track = try_order_track_answer(text, lang=lang)
    if track:
        return track

    scoped = try_scope_answer(text, lang=lang)
    if scoped:
        return scoped

    mood = try_mood_answer(text, store_info, lang=lang)
    if mood:
        return mood

    budget = try_budget_answer(text, lang=lang)
    if budget:
        return budget

    compare = try_brand_compare_answer(text, lang=lang, profile=customer_profile)
    if compare:
        return compare

    browse = try_category_browse_answer(text, lang=lang, profile=customer_profile)
    if browse:
        return browse

    colors = try_colors_answer(text, store_info, lang=lang)
    if colors:
        return colors

    bridge = try_general_bridge_answer(text, store_info, lang=lang)
    if bridge:
        return bridge

    if wants_store_policy_ask(text):
        exchange = try_exchange_care_answer(text, store_info, lang=lang)
        if exchange:
            return exchange
        policy = try_fast_answer(
            text, store_info, lang=lang, allow_faq=True, allow_products=False
        )
        if policy:
            return policy

    recommend = try_recommend_answer(text, lang=lang, profile=customer_profile)
    if recommend:
        return recommend

    fast = try_fast_answer(
        text, store_info, lang=lang, allow_faq=not flexible, allow_products=True
    )
    if fast:
        return fast

    about = try_about_store_answer(text, store_info, lang=lang)
    if about:
        return about

    gift = try_gift_recipient_answer(text, store_info, lang=lang)
    if gift:
        return gift

    hero = try_hero_product_answer(text, lang=lang)
    if hero:
        return hero

    if not shop:
        if lang == "en":
            return (
                "I'd be happy to help with The Man Store shopping 🙂 "
                "I couldn't map that to a store question yet — "
                "tell me if it's about products, orders, delivery, or returns, "
                "or set USE_LLM=1 for freer answers."
            )
        return (
            "រីករាយជួយទិញនៅ The Man Store 🙂 "
            "មិនទាន់ភ្ជាប់ទៅសំណួរហាងច្បាស់ទេ — "
            "ប្រាប់ថាជាទំនិញ កម្មង់ ដឹក ឬប្តូរ "
            "ឬបើ USE_LLM=1 ឆ្លើយបត់បែនបានពេញ។"
        )
    if lang == "km":
        return compose_curated_khmer_reply(store_info, text)
    categories = ", ".join(store_info.get("product_categories", [])[:6])
    return (
        f"I'd be happy to help as {config.ASSISTANT_NAME}. "
        "Ask about products, prices, stock, bestsellers, payment, or delivery. "
        f"Categories: {categories}. What would you like next?"
    )
