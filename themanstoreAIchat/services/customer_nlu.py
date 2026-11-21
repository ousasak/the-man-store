"""Customer NLU for The Man Store AI Seller.

Intent + entity extraction + vague-ask clarifiers + preference / emotion cues.
Builds on existing detectors — does not invent prices/stock.
"""
from __future__ import annotations

import re
from typing import Any


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def is_vague_shop_ask(text: str) -> bool:
    """«មានអីល្អ?» / «anything good?» — needs clarifying, not random dump."""
    cleaned = _norm(text)
    bare = re.sub(r"[^\w\s\u1780-\u17FF]", "", cleaned).strip()
    patterns = (
        r"^(មាន)?អីល្អ\??$",
        r"^(មាន)?អ្វីល្អ\??$",
        r"^មានអី\??$",
        r"^មានអ្វី\??$",
        r"^ណែនាំមក\??$",
        r"^ណែនាំខ្លះ\??$",
        r"^មានម៉ូដល្អ\??$",
        r"anything good",
        r"what('s| is) good",
        r"what do you (have|recommend|suggest)",
        r"any (good )?recommendations?",
        r"show me something",
        r"something nice",
        r"what should i (buy|get)",
    )
    if any(re.search(p, bare) or re.search(p, cleaned) for p in patterns):
        return True
    # Aesthetic + category → style discovery (handled separately), not vague
    return False


def is_style_discovery_ask(text: str) -> bool:
    """«មានអាវស្អាតៗអត់?» → discover style/occasion, not dump all shirts."""
    cleaned = _norm(text)
    if not cleaned:
        return False
    aesthetic = any(
        k in cleaned
        for k in (
            "ស្អាត",
            "ស្អាតៗ",
            "ល្អៗ",
            "ទាន់សម័យ",
            "ស្ទីល",
            "nice",
            "pretty",
            "beautiful",
            "stylish",
            "cool looking",
        )
    )
    if not aesthetic:
        return False
    return any(
        k in cleaned
        for k in (
            "មាន",
            "អត់",
            "ទេ",
            "any",
            "got",
            "recommend",
            "ណែនាំ",
            "?",
        )
    )


def detect_preference_color(text: str) -> list[str]:
    """«ខ្ញុំចូលចិត្តពណ៌ខ្មៅ» → color ids."""
    from services.taxonomy import detect_color_keys

    cleaned = _norm(text)
    if not any(
        k in cleaned
        for k in (
            "ចូលចិត្ត",
            "prefer",
            "favorite",
            "favourite",
            "like",
            "love",
            "usually wear",
            "ចូលចិត្តពណ៌",
        )
    ):
        return []
    return detect_color_keys(cleaned)


def detect_customer_emotion(text: str) -> str | None:
    cleaned = _norm(text)
    if any(
        k in cleaned
        for k in (
            "ខឹង",
            "angry",
            "furious",
            "frustrated",
            "រង់ចាំយូរ",
            "waited too long",
            "still waiting",
            "unacceptable",
            "terrible",
            "worst",
            "scam",
            "បោក",
        )
    ):
        return "angry"
    if any(
        k in cleaned
        for k in (
            "មិនដឹងជ្រើស",
            "មិនដឹងទិញ",
            "មិនដឹងថាទិញ",
            "not sure",
            "unsure",
            "can't decide",
            "cannot decide",
            "which one should",
            "help me choose",
            "ស្ទាក់ស្ទើរ",
            "hesitat",
            "confused",
            "មិនដឹងជ្រើសមួយណា",
        )
    ):
        return "hesitant"
    if any(k in cleaned for k in ("sad", "unhappy", "upset", "ពិបាកចិត្ត", "សោកសៅ")):
        return "sad"
    if any(k in cleaned for k in ("happy", "excited", "រីករាយ", "សប្បាយ")):
        return "happy"
    return None


def classify_shop_intent(text: str) -> str:
    """Coarse question class for routing / reasoning."""
    from services.chat import (
        wants_buy_ask,
        wants_cheap_deals,
        wants_price_ask,
        wants_recommend_ask,
        wants_search_ask,
        wants_stock_ask,
        wants_store_policy_ask,
        detect_wanted_size,
        parse_budget_usd,
        detect_occasion,
    )

    cleaned = _norm(text)
    if wants_store_policy_ask(cleaned) or any(
        k in cleaned for k in ("ប្តូរ", "exchange", "return", "ត្រឡប់", "ខូច", "complaint")
    ):
        from services.chat import wants_order_track_ask

        if wants_order_track_ask(cleaned) or any(
            k in cleaned for k in ("តាមដាន", "track order", "order status", "កម្មង់ខ្ញុំ")
        ):
            return "order_track"
        if any(k in cleaned for k in ("ដឹក", "delivery", "shipping")):
            return "shipping"
        if any(k in cleaned for k in ("ប្តូរ", "exchange", "replacement")):
            return "exchange"
        if any(k in cleaned for k in ("ត្រឡប់", "return", "refund", "សងលុយ")):
            return "return"
        if any(k in cleaned for k in ("ខូច", "complaint", "ត្អូញ", "angry")):
            return "complaint"
        return "policy"
    # Brand compare before vague/recommend
    from services.taxonomy import detect_all_brand_names

    if len(detect_all_brand_names(cleaned)) >= 2 and any(
        k in cleaned
        for k in (
            "vs",
            "versus",
            " or ",
            "compare",
            "មួយណា",
            "និង",
            "ឬ",
            "ប្រៀប",
            "ល្អ",
            "better",
        )
    ):
        return "comparison"
    # Style discovery before vague («មានអាវស្អាតៗអត់?» ≠ random dump)
    if is_style_discovery_ask(cleaned):
        return "style_discovery"
    if is_vague_shop_ask(cleaned):
        return "vague_browse"
    if wants_recommend_ask(cleaned) or detect_occasion(cleaned):
        return "recommendation"
    if wants_cheap_deals(cleaned) or parse_budget_usd(cleaned) is not None:
        return "budget"
    if wants_price_ask(cleaned):
        return "price"
    if detect_wanted_size(cleaned) and any(
        k in cleaned for k in ("មាន", "have", "stock", "អត់", "size")
    ):
        return "size"
    if wants_stock_ask(cleaned):
        return "stock"
    if wants_buy_ask(cleaned) or wants_search_ask(cleaned):
        return "product_search"
    if detect_preference_color(cleaned):
        return "preference"
    emotion = detect_customer_emotion(cleaned)
    if emotion == "angry":
        return "complaint"
    if emotion == "hesitant":
        return "hesitant"
    return "general"


def extract_shop_entities(text: str) -> dict[str, Any]:
    """Pull product / color / size / budget / brand / occasion from one turn."""
    from services.chat import (
        detect_wanted_brand,
        detect_wanted_category,
        detect_wanted_colors,
        detect_wanted_size,
        detect_occasion,
        parse_budget_usd,
    )

    cleaned = _norm(text)
    cat = detect_wanted_category(cleaned)
    colors = detect_wanted_colors(cleaned)
    return {
        "category": cat,
        "product_label": (cat[1] if cat else None),
        "colors": colors,
        "size": detect_wanted_size(cleaned),
        "budget": parse_budget_usd(cleaned),
        "brand": detect_wanted_brand(cleaned),
        "occasion": detect_occasion(cleaned),
        "pref_colors": detect_preference_color(cleaned),
        "emotion": detect_customer_emotion(cleaned),
        "intent": classify_shop_intent(cleaned),
        "vague": is_vague_shop_ask(cleaned),
        "style_discovery": is_style_discovery_ask(cleaned),
    }


def merge_customer_profile(prev: dict | None, entities: dict) -> dict:
    """Accumulate durable shopping prefs across turns."""
    profile = dict(prev or {})
    if entities.get("category"):
        profile["category"] = entities["category"]
        profile["product_label"] = entities.get("product_label")
    # Only explicit preference sets favorites; mentioned colors stay ephemeral
    if entities.get("pref_colors"):
        profile["favorite_colors"] = list(entities["pref_colors"])
    elif entities.get("colors"):
        profile["last_colors"] = list(entities["colors"])
    if entities.get("size"):
        profile["size"] = entities["size"]
    if entities.get("budget") is not None:
        profile["budget"] = entities["budget"]
        profile["budget_band"] = (
            "low"
            if entities["budget"] <= 25
            else ("medium" if entities["budget"] <= 60 else "premium")
        )
    if entities.get("brand"):
        profile["brand"] = entities["brand"]
    if entities.get("occasion"):
        occ = entities["occasion"]
        # occasion may be tuple/list from detect_occasion
        if isinstance(occ, (list, tuple)) and occ:
            profile["occasion"] = occ[0] if not isinstance(occ[0], (list, tuple)) else str(occ[0])
            profile["style"] = "formal" if "office" in str(occ).lower() or "event" in str(occ).lower() else "casual"
        else:
            profile["occasion"] = occ
    if entities.get("intent"):
        profile["last_intent"] = entities["intent"]
    # Build phrase for follow-ups
    bits = []
    fav = profile.get("favorite_colors") or profile.get("last_colors") or []
    if fav:
        bits.append(str(fav[0]).replace("_", " "))
    if profile.get("product_label"):
        bits.append(str(profile["product_label"]).split("/")[0].strip())
    elif profile.get("category") and isinstance(profile["category"], (list, tuple)):
        bits.append(str(profile["category"][1]).split("/")[0].strip())
    if profile.get("brand"):
        bits.append(str(profile["brand"]))
    if profile.get("size"):
        bits.append(str(profile["size"]))
    profile["phrase"] = " ".join(bits).strip()
    return profile


def vague_or_style_clarify(text: str, lang: str = "km", profile: dict | None = None) -> str | None:
    """Clarifying reply for vague / aesthetic discovery asks (one question)."""
    cleaned = _norm(text)
    style = is_style_discovery_ask(cleaned)
    vague = is_vague_shop_ask(cleaned)
    if not style and not vague:
        return None

    from services.chat import detect_wanted_category, format_category_label, format_stock_color_name

    cat = detect_wanted_category(cleaned)
    label = ""
    if cat:
        label = format_category_label(cat, lang=lang)

    fav = (profile or {}).get("favorite_colors") or []
    fav_note = ""
    if fav:
        cname = format_stock_color_name(str(fav[0]).replace("_", " "), lang=lang)
        fav_note = (
            f" (I remember you like **{cname}**)"
            if lang == "en"
            else f" (ខ្ញុំចងចាំថាអ្នកចូលចិត្តពណ៌ **{cname}**)"
        )

    if style and label:
        if lang == "en":
            return (
                f"Absolutely! 😊 Looking for nice **{label}**{fav_note}.\n"
                "May I know what occasion you need it for — **work, casual, or a special event**?\n"
                "And do you prefer **Casual** or **Formal** style?"
            )
        return (
            f"មានចាស 😊 កំពុងរក **{label}** ស្អាតៗ{fav_note}។\n"
            "តើពាក់សម្រាប់ឱកាសអ្វី — **ការងារ · ដើរលេង · ឬកម្មវិធីពិសេស**?\n"
            "ហើយចូលចិត្ត Style បែប **Casual** ឬ **Formal**?"
        )

    if lang == "en":
        return (
            f"There are many lovely options 😊✨{fav_note}\n"
            "Are you shopping for **yourself** or a **gift**?\n"
            "And which type interests you — **pants, shirt, shoes, jacket, or bag**?\n"
            "Take your time — I’m happy to help 💕"
        )
    return (
        f"មានច្រើនជម្រើសស្អាត 😊✨{fav_note}\n"
        "តើអ្នកចង់រកសម្រាប់ **ខ្លួនឯង** ឬជា **កាដូ**?\n"
        "ហើយចាប់អារម្មណ៍ប្រភេទណា — **ខោ · អាវ · ស្បែកជើង · អាវក្រៅ · កាបូប**?\n"
        "យកពេលបាន — រីករាយជួយ 💕"
    )


def hesitant_help_reply(lang: str = "km") -> str:
    if lang == "en":
        return (
            "No worries at all 😊✨ I’ll help you compare options with care.\n"
            "Tell me the occasion (work / casual / date) or your budget — "
            "and I’ll narrow it to 2–3 strong choices just for you.\n"
            "Take your time — I’m happy to help 💕"
        )
    return (
        "មិនបាច់បារម្ភទេ 😊✨ ខ្ញុំនឹងជួយប្រៀបធៀបជម្រើសឱ្យអ្នកដោយយកចិត្តទុកដាក់។\n"
        "ប្រាប់ឱកាស (ការងារ / ប្រចាំថ្ងៃ / ណាត់) ឬថវិកា — "
        "ខ្ញុំរើស ២–៣ ជម្រើសខ្លាំងសម្រាប់អ្នក។\n"
        "យកពេលបាន — រីករាយជួយ 💕"
    )


def angry_care_reply(lang: str = "km") -> str:
    if lang == "en":
        return (
            "I’m really sorry for the wait and frustration 🙏💕 "
            "I’ll help check the situation right away.\n"
            "Please share your **Order ID** (and what happened) — "
            "or go to /track-order · /support so we can resolve this quickly.\n"
            "I’m here with you — we’ll sort this out together."
        )
    return (
        "សូមអភ័យទោសចំពោះការរង់ចាំ និងភាពមិនងាយស្រួល 🙏💕 "
        "ខ្ញុំនឹងជួយពិនិត្យស្ថានភាពជូនភ្លាមៗ។\n"
        "សូមប្រាប់ **លេខកម្មង់** (និងអ្វីដែលកើតឡើង) — "
        "ឬមើល /track-order · /support ដើម្បីដោះស្រាយឱ្យបានលឿន។\n"
        "ខ្ញុំនៅជាមួយអ្នក — យើងដោះស្រាយជាមួយគ្នា។"
    )


def apply_reasoning_boost(item: dict, profile: dict | None) -> float:
    """Soft ranking boost from customer profile (favorite color, budget, occasion)."""
    if not profile:
        return 0.0
    blob = " ".join(
        str(item.get(k, "")) for k in ("name", "product", "category", "description", "color")
    ).lower()
    boost = 0.0
    for c in profile.get("favorite_colors") or []:
        token = str(c).replace("_", " ").lower()
        if token and token in blob:
            boost += 3.0
    budget = profile.get("budget")
    if budget is not None:
        try:
            price = float(item.get("price") or 9999)
            if price <= float(budget):
                boost += 2.0
            elif price <= float(budget) * 1.15:
                boost += 0.5
            else:
                boost -= 1.0
        except (TypeError, ValueError):
            pass
    style = (profile.get("style") or "").lower()
    occ = str(profile.get("occasion") or "").lower()
    if style == "formal" or any(k in occ for k in ("office", "event", "interview")):
        if any(k in blob for k in ("oxford", "chino", "shirt", "blazer", "formal", "dress")):
            boost += 1.5
        if any(k in blob for k in ("graphic", "hoodie oversized", "beach")):
            boost -= 0.5
    size = (profile.get("size") or "").lower()
    if size and size in blob:
        boost += 0.5
    return boost
