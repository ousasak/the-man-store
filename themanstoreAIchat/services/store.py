"""Store FAQ / knowledge JSON loaders."""
from __future__ import annotations

import json
import re
import time

import config

_store_info_cache = {"data": None, "expires_at": 0.0, "mtime": None}
_json_products_cache = {"data": None, "mtime": None}


def load_json_file(file_path, default):
    try:
        with open(file_path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        print(f"JSON file not found: {file_path}")
    except (json.JSONDecodeError, OSError) as error:
        print(f"Could not read {file_path}: {error}")
    return default


def load_json_products():
    global _json_products_cache
    try:
        mtime = config.PRODUCTS_FILE.stat().st_mtime
    except OSError:
        mtime = None

    if (
        _json_products_cache["data"] is not None
        and _json_products_cache["mtime"] == mtime
    ):
        return _json_products_cache["data"]

    data = load_json_file(config.PRODUCTS_FILE, [])
    products = data if isinstance(data, list) else []
    _json_products_cache = {"data": products, "mtime": mtime}
    return products


def load_store_info():
    """Reload store rules from JSON often so policy edits apply quickly."""
    global _store_info_cache
    now = time.time()
    try:
        mtime = config.STORE_INFO_FILE.stat().st_mtime
    except OSError:
        mtime = None

    cached = _store_info_cache
    if (
        cached["data"] is not None
        and cached["mtime"] == mtime
        and now < cached["expires_at"]
    ):
        return cached["data"]

    data = load_json_file(config.STORE_INFO_FILE, {})
    store = data if isinstance(data, dict) else {}
    _store_info_cache = {
        "data": store,
        "expires_at": now + config.STORE_CACHE_TTL_SEC,
        "mtime": mtime,
    }
    return store


def store_template_vars(store_info):
    return {
        "store_name": store_info.get("store_name", "The Man Store"),
        "assistant_name": store_info.get(
            "assistant_name", "The Man Store AI Assistant"
        ),
        "brand_summary": store_info.get("brand_summary", ""),
        "owner_model": store_info.get("owner_model", ""),
        "target_customers": store_info.get("target_customers", ""),
        "categories": ", ".join(store_info.get("product_categories", [])),
        "product_source": store_info.get("product_source", ""),
        "price_range": store_info.get("price_range", ""),
        "currency": store_info.get("currency", "USD"),
        "sales_type": store_info.get("sales_type", ""),
        "payments": ", ".join(store_info.get("payment_methods", [])),
        "delivery": ", ".join(store_info.get("delivery_services", [])),
        "delivery_note": store_info.get("delivery_note", ""),
        "online_payment_policy": store_info.get("online_payment_policy", ""),
        "cod_policy": store_info.get("cod_policy", ""),
        "how_to_order": store_info.get("how_to_order", ""),
        "sizing_note": store_info.get("sizing_note", ""),
        "damage_policy": store_info.get("damage_policy", ""),
        "opening_hours": store_info.get("opening_hours", ""),
        "location": store_info.get("location", ""),
        "contact": store_info.get("contact", ""),
        "return_policy": store_info.get("return_policy", ""),
        "return_fee_note": store_info.get("return_fee_note", ""),
        "exchange_care_km": store_info.get("exchange_care_km", ""),
        "exchange_care_en": store_info.get("exchange_care_en", ""),
        "exchange_size_care_km": store_info.get("exchange_size_care_km", ""),
        "exchange_size_care_en": store_info.get("exchange_size_care_en", ""),
        "exchange_color_care_km": store_info.get("exchange_color_care_km", ""),
        "exchange_color_care_en": store_info.get("exchange_color_care_en", ""),
        "exchange_damage_care_km": store_info.get("exchange_damage_care_km", ""),
        "exchange_damage_care_en": store_info.get("exchange_damage_care_en", ""),
        "exchange_cannot_care_km": store_info.get("exchange_cannot_care_km", ""),
        "exchange_cannot_care_en": store_info.get("exchange_cannot_care_en", ""),
        "language_note": store_info.get("language_note", ""),
        "what_assistant_can_do": store_info.get("what_assistant_can_do", ""),
        "what_we_dont_do": store_info.get("what_we_dont_do", ""),
        "discount_policy": store_info.get("discount_policy", ""),
        "loyalty_policy": store_info.get("loyalty_policy", ""),
        "language_note_en": store_info.get("language_note_en", ""),
        "brand_summary_en": store_info.get("brand_summary_en", ""),
        "owner_model_en": store_info.get("owner_model_en", ""),
        "target_customers_en": store_info.get("target_customers_en", ""),
        "price_range_en": store_info.get("price_range_en", ""),
        "currency_en": store_info.get("currency_en", "USD"),
        "sales_type_en": store_info.get("sales_type_en", ""),
        "payments_en": store_info.get(
            "payments_en",
            ", ".join(store_info.get("payment_methods", [])),
        ),
        "delivery_en": store_info.get(
            "delivery_en",
            ", ".join(store_info.get("delivery_services", [])),
        ),
        "delivery_note_en": store_info.get("delivery_note_en", ""),
        "online_payment_policy_en": store_info.get("online_payment_policy_en", ""),
        "cod_policy_en": store_info.get("cod_policy_en", ""),
        "how_to_order_en": store_info.get("how_to_order_en", ""),
        "sizing_note_en": store_info.get("sizing_note_en", ""),
        "return_policy_en": store_info.get("return_policy_en", ""),
        "return_fee_note_en": store_info.get("return_fee_note_en", ""),
        "damage_policy_en": store_info.get("damage_policy_en", ""),
        "opening_hours_en": store_info.get("opening_hours_en", ""),
        "location_en": store_info.get("location_en", ""),
        "contact_en": store_info.get("contact_en", ""),
        "what_assistant_can_do_en": store_info.get("what_assistant_can_do_en", ""),
        "what_we_dont_do_en": store_info.get("what_we_dont_do_en", ""),
        "discount_policy_en": store_info.get("discount_policy_en", ""),
        "loyalty_policy_en": store_info.get("loyalty_policy_en", ""),
        "care_tips": store_info.get("care_tips", ""),
        "care_tips_en": store_info.get("care_tips_en", ""),
        "gift_policy": store_info.get("gift_policy", ""),
        "gift_policy_en": store_info.get("gift_policy_en", ""),
        "invoice_policy": store_info.get("invoice_policy", ""),
        "invoice_policy_en": store_info.get("invoice_policy_en", ""),
        "cancel_order": store_info.get("cancel_order", ""),
        "cancel_order_en": store_info.get("cancel_order_en", ""),
        "try_on_policy": store_info.get("try_on_policy", ""),
        "try_on_policy_en": store_info.get("try_on_policy_en", ""),
        "phnom_penh_note": store_info.get("phnom_penh_note", ""),
        "phnom_penh_note_en": store_info.get("phnom_penh_note_en", ""),
        "province_delivery": store_info.get("province_delivery", ""),
        "province_delivery_en": store_info.get("province_delivery_en", ""),
        "color_note": store_info.get("color_note", ""),
        "color_note_en": store_info.get("color_note_en", ""),
        "packing_note": store_info.get("packing_note", ""),
        "packing_note_en": store_info.get("packing_note_en", ""),
        "budget_tip": store_info.get("budget_tip", ""),
        "budget_tip_en": store_info.get("budget_tip_en", ""),
        "style_shoes": store_info.get("style_shoes", ""),
        "style_shoes_en": store_info.get("style_shoes_en", ""),
        "style_jacket": store_info.get("style_jacket", ""),
        "style_jacket_en": store_info.get("style_jacket_en", ""),
        "style_bag": store_info.get("style_bag", ""),
        "style_bag_en": store_info.get("style_bag_en", ""),
        "faq_examples": store_info.get("faq_examples", ""),
        "faq_examples_en": store_info.get("faq_examples_en", ""),
        "sweet_phrases": store_info.get("sweet_phrases", ""),
        "sweet_phrases_en": store_info.get("sweet_phrases_en", ""),
        "ecommerce_response_tips": store_info.get("ecommerce_response_tips_km", ""),
        "ecommerce_response_tips_km": store_info.get("ecommerce_response_tips_km", ""),
        "ecommerce_response_tips_en": store_info.get("ecommerce_response_tips_en", ""),
        "sales_tone": store_info.get("sales_tone", ""),
        "sales_tone_en": store_info.get("sales_tone_en", ""),
        "system_persona": store_info.get("system_persona", ""),
        "seller_craft_km": store_info.get("seller_craft_km", ""),
        "seller_craft_en": store_info.get("seller_craft_en", ""),
        "seller_phrases_km": store_info.get("seller_phrases_km", ""),
        "seller_phrases_en": store_info.get("seller_phrases_en", ""),
        "seller_ask_replace_km": store_info.get("seller_ask_replace_km", ""),
        "seller_ask_replace_en": store_info.get("seller_ask_replace_en", ""),
        "seller_answer_replace_km": store_info.get("seller_answer_replace_km", ""),
        "seller_answer_replace_en": store_info.get("seller_answer_replace_en", ""),
        "seller_formula_km": store_info.get("seller_formula_km", ""),
        "seller_formula_en": store_info.get("seller_formula_en", ""),
        "sweet_words_km": store_info.get("sweet_words_km", ""),
        "sweet_words_en": store_info.get("sweet_words_en", ""),
        "men_fashion_seller_km": store_info.get("men_fashion_seller_km", ""),
        "men_fashion_seller_en": store_info.get("men_fashion_seller_en", ""),
        "men_fashion_phrases_km": store_info.get("men_fashion_phrases_km", ""),
        "men_fashion_phrases_en": store_info.get("men_fashion_phrases_en", ""),
        "men_recommend_skill_km": store_info.get("men_recommend_skill_km", ""),
        "men_recommend_skill_en": store_info.get("men_recommend_skill_en", ""),
        "men_recommend_examples_km": store_info.get("men_recommend_examples_km", ""),
        "men_recommend_examples_en": store_info.get("men_recommend_examples_en", ""),
        "body_fit_advice": store_info.get("body_fit_advice", ""),
        "body_fit_advice_en": store_info.get("body_fit_advice_en", ""),
    }


def fill_store_answer(template, store_info):
    if not template:
        return ""
    try:
        return str(template).format(**store_template_vars(store_info)).strip()
    except (KeyError, ValueError):
        return str(template).strip()


def apply_typo_corrections(text, store_info=None):
    """Quietly fix common misspellings — never scold the user."""
    info = store_info if store_info is not None else load_store_info()
    corrections = info.get("typo_corrections") or {}
    if not text or not corrections:
        return text or ""

    # Longer keys first so "tshrit" wins over "t"
    items = sorted(
        ((str(k).lower(), str(v)) for k, v in corrections.items() if k and v),
        key=lambda kv: len(kv[0]),
        reverse=True,
    )
    out = text
    for bad, good in items:
        if re.search(r"[\u1780-\u17FF]", bad):
            if bad in out.lower():
                # Case-insensitive replace for Khmer / mixed
                out = re.sub(re.escape(bad), good, out, flags=re.IGNORECASE)
            continue
        out = re.sub(rf"(?<!\w){re.escape(bad)}(?!\w)", good, out, flags=re.IGNORECASE)
    return out


def match_faq_answer(cleaned, store_info, lang="km"):
    """Match best FAQ rule from store_info.json (editable without code changes)."""
    # Normalize so "How can I pay?" matches "how can i pay"
    cleaned = apply_typo_corrections(cleaned or "", store_info)
    cleaned = re.sub(r"[^\w\s\u1780-\u17FF]", " ", cleaned.lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    def keyword_hit(kw):
        kw = (kw or "").lower().strip()
        if not kw:
            return False
        # Khmer / mixed: substring OK
        if re.search(r"[\u1780-\u17FF]", kw):
            return kw in cleaned
        # Latin: whole-word only so "cod" does not match "code"
        return re.search(rf"(?<!\w){re.escape(kw)}(?!\w)", cleaned) is not None

    best_score = 0
    best_item = None
    for item in store_info.get("faq", []) or []:
        keywords = [str(k).lower() for k in (item.get("keywords") or []) if k]
        score = 0
        for kw in keywords:
            if keyword_hit(kw):
                score += max(1, len(kw) // 4)
        if score > best_score:
            best_score = score
            best_item = item
    if not best_item or best_score <= 0:
        return None

    if lang == "en":
        template = best_item.get("answer_en") or ""
        if not template:
            return None
        return fill_store_answer(template, store_info)
    return fill_store_answer(best_item.get("answer", ""), store_info)
