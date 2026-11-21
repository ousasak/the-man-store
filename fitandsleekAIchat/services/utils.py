"""Shared text helpers."""
from __future__ import annotations

import re


def message_text(content):
    """Normalize Gradio / chat payloads to plain text (never use str(ChatMessage))."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    # Gradio 5/6 ChatMessage / objects with .content (str or multimodal list)
    if hasattr(content, "content") and not isinstance(content, (dict, list, tuple)):
        return message_text(getattr(content, "content", None))
    if isinstance(content, dict):
        if "text" in content:
            return message_text(content.get("text"))
        if "content" in content:
            return message_text(content.get("content"))
        return ""
    if isinstance(content, (list, tuple)):
        parts = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(message_text(part.get("text")))
            else:
                parts.append(message_text(part))
        return "\n".join(filter(None, parts))
    return str(content)


def has_khmer(text):
    return bool(re.search(r"[\u1780-\u17FF]", text or ""))


def needs_product_data(text):
    keywords = [
        "តម្លៃ",
        "price",
        "size",
        "ទំហំ",
        "ស្តុក",
        "stock",
        "មានលក់",
        "មានទេ",
        "មានអត់",
        "ផលិតផល",
        "ទំនិញ",
        "បញ្ជី",
        "list",
        "អាវ",
        "អាវយឺត",
        "ខោ",
        "ស្បែកជើង",
        "កាបូប",
        "មួក",
        "នាឡិកា",
        "ស្រោម",
        "ខ្សែ",
        "ថោក",
        "ត្រឹម",
        "ថវិកា",
        "sale",
        "promo",
        "discount",
        "hoodie",
        "t-shirt",
        "tshirt",
        "tee",
        "hat",
        "backpack",
        "jacket",
        "chino",
        "jogger",
        "pant",
        "pants",
        "jean",
        "jeans",
        "shirt",
        "product",
        "produt",
        "produts",
        "buy",
        "got",
        "hv",
        "have",
        "need",
        "find",
        "search",
        "want",
        "wanna",
        "ទិញ",
        "ចង់ទិញ",
        "រក",
        "ប៉ាតា",
        "ប៊ូ",
        "shoe",
        "watch",
        "belt",
        "sock",
        "underwear",
        "nike",
        "adidas",
        "blk",
        "black",
        "new",
        "ថ្មី",
    ]
    lower = text.lower()
    return any(k.lower() in lower for k in keywords)


def is_bestseller_question(text):
    keywords = [
        "លក់ដាច់",
        "លក់ខ្លាំង",
        "best seller",
        "bestseller",
        "best-selling",
        "best selling",
        "top seller",
        "top-selling",
        "popular",
        "most popular",
        "trending",
        "ពេញនិយម",
        "ដាច់បំផុត",
        "លក់ច្រើន",
        "ទំនិញលក់ដាច់",
    ]
    lower = text.lower()
    return any(k.lower() in lower for k in keywords)
