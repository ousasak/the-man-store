"""RAG: retrieve FAQ + knowledge + DB snippets for the LLM."""
from __future__ import annotations

import json
import re

import config
from services.db import get_db_products, get_top_sellers
from services.store import (
    fill_store_answer,
    load_json_products,
    store_template_vars,
)
from services.utils import is_bestseller_question, needs_product_data


def build_compact_context(json_data, db_data, store_info, include_products):
    store_bits = {
        "store_name": store_info.get("store_name"),
        "assistant_name": store_info.get(
            "assistant_name", "The Man Store AI Assistant"
        ),
        "brand_summary": store_info.get("brand_summary"),
        "target_customers": store_info.get("target_customers"),
        "product_categories": store_info.get("product_categories"),
        "price_range": store_info.get("price_range"),
        "currency": store_info.get("currency"),
        "payment_methods": store_info.get("payment_methods"),
        "delivery_services": store_info.get("delivery_services"),
        "delivery_note": store_info.get("delivery_note"),
        "online_payment_policy": store_info.get("online_payment_policy"),
        "cod_policy": store_info.get("cod_policy"),
        "how_to_order": store_info.get("how_to_order"),
        "sizing_note": store_info.get("sizing_note"),
        "sales_type": store_info.get("sales_type"),
        "damage_policy": store_info.get("damage_policy"),
        "return_policy": store_info.get("return_policy"),
        "opening_hours": store_info.get("opening_hours"),
        "location": store_info.get("location"),
        "contact": store_info.get("contact"),
        "discount_policy": store_info.get("discount_policy"),
        "loyalty_policy": store_info.get("loyalty_policy"),
        "what_we_dont_do": store_info.get("what_we_dont_do"),
    }
    parts = ["STORE: " + json.dumps(store_bits, ensure_ascii=False, default=str)]

    if not include_products:
        return "\n".join(parts)

    if db_data and db_data.get("products"):
        parts.append(
            "DB_PRODUCTS: "
            + json.dumps(db_data["products"], ensure_ascii=False, default=str)
        )
        parts.append(
            "DB_LOTS: "
            + json.dumps(
                db_data.get("inventory_lots", []), ensure_ascii=False, default=str
            )
        )
    elif json_data:
        slim = [
            {
                "name": p.get("name"),
                "category": p.get("category"),
                "price": p.get("price"),
                "sizes": p.get("sizes"),
                "stock": p.get("stock_quantity", p.get("in_stock")),
            }
            for p in json_data[: config.PRODUCT_LIMIT]
        ]
        parts.append(
            "JSON_PRODUCTS: " + json.dumps(slim, ensure_ascii=False, default=str)
        )
    else:
        parts.append("PRODUCTS: unavailable")

    return "\n".join(parts)


def retrieve_rag_context(question, store_info):
    """Retrieve FAQ + knowledge chunks + DB snippets for the question."""
    cleaned = re.sub(r"\s+", " ", question.strip().lower())
    parts = []
    tokens = [t for t in re.split(r"[\s,./?؟!]+", cleaned) if len(t) >= 2]

    scored = []
    for item in store_info.get("faq") or []:
        kws = [str(k).lower() for k in (item.get("keywords") or [])]
        score = sum(max(1, len(k) // 4) for k in kws if k and k in cleaned)
        blob = " ".join(kws)
        score += sum(1 for t in tokens if t in blob)
        if score > 0:
            scored.append((score, item))
    scored.sort(key=lambda x: x[0], reverse=True)

    faq_bits = []
    for _, item in scored[:5]:
        ans = fill_store_answer(item.get("answer", ""), store_info)
        if ans:
            faq_bits.append(f"- {item.get('id', 'faq')}: {ans}")
    if faq_bits:
        parts.append("FAQ_HITS:\n" + "\n".join(faq_bits))

    chunk_hits = []
    for chunk in store_info.get("knowledge_chunks") or []:
        topics = [str(t).lower() for t in (chunk.get("topics") or [])]
        score = sum(2 for t in topics if t and t in cleaned)
        score += sum(1 for t in tokens if any(t in topic for topic in topics))
        if score > 0:
            chunk_hits.append((score, chunk))
    chunk_hits.sort(key=lambda x: x[0], reverse=True)
    if chunk_hits:
        bits = [
            f"- {c.get('id')}: {c.get('text')}"
            for _, c in chunk_hits[:4]
            if c.get("text")
        ]
        if bits:
            parts.append("KNOWLEDGE:\n" + "\n".join(bits))

    vars_map = store_template_vars(store_info)
    parts.append(
        "STORE_FACTS: "
        + json.dumps(
            {
                "store_name": vars_map["store_name"],
                "assistant_name": vars_map["assistant_name"],
                "brand_summary": vars_map["brand_summary"],
                "brand_summary_en": vars_map.get("brand_summary_en", ""),
                "owner_model": vars_map["owner_model"],
                "categories": vars_map["categories"],
                "payments": vars_map["payments"],
                "delivery": vars_map["delivery"],
                "delivery_note": vars_map["delivery_note"],
                "cod_policy": vars_map["cod_policy"],
                "price_range": vars_map["price_range"],
                "sizing_note": vars_map["sizing_note"],
                "how_to_order": vars_map["how_to_order"],
                "return_policy": vars_map["return_policy"],
                "damage_policy": vars_map["damage_policy"],
                "opening_hours": vars_map["opening_hours"],
                "location": vars_map["location"],
                "contact": vars_map["contact"],
                "discount_policy": vars_map["discount_policy"],
                "care_tips": vars_map.get("care_tips", ""),
                "gift_policy": vars_map.get("gift_policy", ""),
                "cancel_order": vars_map.get("cancel_order", ""),
                "province_delivery": vars_map.get("province_delivery", ""),
                "phnom_penh_note": vars_map.get("phnom_penh_note", ""),
                "budget_tip": vars_map.get("budget_tip", ""),
                "what_we_dont_do": vars_map["what_we_dont_do"],
            },
            ensure_ascii=False,
        )
    )

    rows = []
    if is_bestseller_question(cleaned) or needs_product_data(question):
        rows = get_top_sellers(use_cache=True) or []
    if rows:
        parts.append(
            "TOP_SELLERS: " + json.dumps(rows[:5], ensure_ascii=False, default=str)
        )

    include_products = needs_product_data(question) or wants_product_context(cleaned)
    if include_products:
        db_data = get_db_products(use_cache=True)
        json_data = load_json_products()
        parts.append(
            build_compact_context(
                json_data, db_data, store_info, include_products=True
            )
        )
    else:
        parts.append(
            build_compact_context([], None, store_info, include_products=False)
        )

    return "\n".join(parts)


def wants_product_context(cleaned):
    keys = (
        "recommend",
        "suggest",
        "ណែនាំ",
        "budget",
        "ថវិកា",
        "compare",
        "which",
        "shoe",
        "jacket",
        "bag",
        "ស្បែក",
        "អាវ",
        "កាបូប",
    )
    return any(k in cleaned for k in keys)
