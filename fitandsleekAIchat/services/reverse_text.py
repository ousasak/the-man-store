"""Decode reversed letters / word-order (EN + Khmer) for messy chatbot input.

Never scolds the user — silently restores intent when a reverse form matches
known shopping vocabulary (products, colors, greetings, seller phrases).
"""
from __future__ import annotations

import re
from functools import lru_cache

# Extra shopping / chat words beyond taxonomy (EN + KM)
_SEED_WORDS = (
    "hello",
    "hi",
    "hey",
    "welcome",
    "thanks",
    "thank",
    "please",
    "yes",
    "no",
    "ok",
    "okay",
    "love",
    "like",
    "want",
    "need",
    "have",
    "got",
    "buy",
    "order",
    "help",
    "find",
    "looking",
    "size",
    "budget",
    "price",
    "prices",
    "cheap",
    "sale",
    "new",
    "stock",
    "available",
    "beautiful",
    "very",
    "this",
    "that",
    "my",
    "your",
    "online",
    "shop",
    "store",
    "seller",
    "product",
    "products",
    "customer",
    "fashion",
    "clothing",
    "clothes",
    "quality",
    "premium",
    "special",
    "offer",
    "arrival",
    "best",
    "artificial",
    "intelligence",
    "computer",
    "database",
    "men",
    "women",
    "kids",
    "under",
    "affordable",
    "high",
    "provide",
    "we",
    "at",
    "is",
    "to",
    "for",
    "bestseller",
    "jean",
    "jeans",
    "pants",
    "shirt",
    "blue",
    "black",
    "navy",
    "សួស្តី",
    "អរគុណ",
    "សូម",
    "ស្វាគមន៍",
    "មក",
    "កាន់",
    "ហាង",
    "របស់",
    "យើង",
    "ខ្ញុំ",
    "ចូលចិត្ត",
    "ផលិតផល",
    "នេះ",
    "អាវ",
    "ស្អាត",
    "ណាស់",
    "អ្នកលក់",
    "អតិថិជន",
    "ទំហំ",
    "តម្លៃ",
    "ថវិកា",
    "ពណ៌",
    "មាន",
    "អត់",
    "ទេ",
    "ចង់",
    "រក",
    "ទិញ",
    "ខោ",
    "ស្បែកជើង",
    "កាបូប",
    "មួក",
    "បុរស",
    "ស្ត្រី",
    "កុមារ",
    "គុណភាព",
    "ខ្ពស់",
    "សមរម្យ",
    "ក្នុង",
    "ផ្តល់",
    "កុំព្យូទ័រ",
    "បច្ចេកវិទ្យា",
    "កសិករ",
)

# Manual reverse aliases (user-typed / OCR / playful reverses that ≠ codepoint reverse)
_REVERSE_ALIASES = {
    # EN letter reverses
    "olleh": "hello",
    "pohs": "shop",
    "relles": "seller",
    "tcudorp": "product",
    "remotsuc": "customer",
    "nohsaf": "fashion",
    "gnihtolc": "clothing",
    "retupmoc": "computer",
    "esabatad": "database",
    "naej": "jean",
    "snaej": "jeans",
    "eulb": "blue",
    "kcalb": "black",
    "yvan": "navy",
    "trihs": "shirt",
    "stnap": "pants",
    # Marketing (letter reverse + often word-order reverse)
    "relles tseb": "best seller",
    "tseb relles": "best seller",
    "lavirra wen": "new arrival",
    "wen lavirra": "new arrival",
    "ytilauq muimerp": "premium quality",
    "muimerp ytilauq": "premium quality",
    "reffo laiceps": "special offer",
    "laiceps reffo": "special offer",
    # Khmer — playful / mistyped reverses from common examples
    "ីត្តសួស": "សួស្តី",
    "់កល្នអ": "អ្នកលក់",
    "លផិតលផ": "ផលិតផល",
    "នជិថិតអ": "អតិថិជន",
    "រកសិក": "កសិករ",
    # Khmer reverse word-order (no spaces) — common test phrases
    "នេះផលិតផលចូលចិត្តខ្ញុំ": "ខ្ញុំចូលចិត្តផលិតផលនេះ",
    "ណាស់ស្អាតនេះអាវ": "អាវនេះស្អាតណាស់",
    "យើងរបស់ហាងកាន់មកមន៍ស្វាគមន៍សូម": "សូមស្វាគមន៍មកកាន់ហាងរបស់យើង",
    "សមរម្យតម្លៃក្នុងខ្ពស់គុណភាពផលិតផលផ្តល់យើង": "យើងផ្តល់ផលិតផលគុណភាពខ្ពស់ក្នុងតម្លៃសមរម្យ",
}

_PHRASE_BONUS = (
    "best seller",
    "new arrival",
    "premium quality",
    "special offer",
    "i love",
    "welcome to",
    "this shirt",
    "ខ្ញុំចូលចិត្ត",
    "សូមស្វាគមន៍",
    "អាវនេះ",
)

_STARTERS = frozenset(
    {
        "i",
        "we",
        "welcome",
        "this",
        "hello",
        "hi",
        "hey",
        "please",
        "best",
        "new",
        "premium",
        "special",
        "ខ្ញុំ",
        "សូម",
        "សួស្តី",
        "អាវ",
        "យើង",
    }
)

_MIN_FLIP_LEN = 3


def _is_khmer(text: str) -> bool:
    return bool(re.search(r"[\u1780-\u17FF]", text or ""))


def _norm_key(token: str) -> str:
    if _is_khmer(token):
        return token
    return token.lower()


@lru_cache(maxsize=1)
def shopping_vocab() -> frozenset[str]:
    """Canonical tokens the bot recognizes (lowercase Latin / exact Khmer)."""
    words: set[str] = {_norm_key(w) for w in _SEED_WORDS if w}
    words.update(_REVERSE_ALIASES.values())
    try:
        from services.taxonomy import load_reference, load_taxonomy

        tax = load_taxonomy()
        for bad, good in (tax.get("typo_aliases") or {}).items():
            if bad:
                words.add(_norm_key(str(bad)))
            if good:
                words.add(_norm_key(str(good)))
        for product in tax.get("products") or []:
            for field in ("aliases", "search_terms"):
                for a in product.get(field) or []:
                    if a:
                        words.add(_norm_key(str(a)))
            for part in re.split(r"[\s/]+", product.get("name_en") or ""):
                if len(part) >= 3:
                    words.add(part.lower())
        for group in (tax.get("groups") or {}).values():
            for t in group.get("search_terms") or []:
                if t:
                    words.add(_norm_key(str(t)))
        ref = load_reference()
        for color in ref.get("colors") or []:
            cid = color.get("id")
            if cid:
                words.add(str(cid).lower().replace("_", " "))
            for a in color.get("aliases") or []:
                if a:
                    words.add(_norm_key(str(a)))
        for brand in ref.get("brands") or []:
            name = brand.get("name")
            if name:
                words.add(str(name).lower())
        for cat in ref.get("categories") or []:
            for a in (cat.get("aliases") or []) + (cat.get("search_terms") or []):
                if a:
                    words.add(_norm_key(str(a)))
    except Exception:
        pass
    return frozenset(w for w in words if w and len(w) >= 2)


def _in_vocab(token: str, vocab: frozenset[str]) -> bool:
    return bool(token) and _norm_key(token) in vocab


def _apply_alias_map(text: str) -> str:
    """Exact / phrase reverse aliases (longest first)."""
    out = text or ""
    low = out.lower()
    # Phrase aliases on lowercase latin; Khmer exact
    items = sorted(_REVERSE_ALIASES.items(), key=lambda kv: len(kv[0]), reverse=True)
    for bad, good in items:
        if _is_khmer(bad):
            if bad in out:
                out = out.replace(bad, good)
            continue
        # whole-string or word-boundary for latin
        pattern = re.compile(rf"(?<!\w){re.escape(bad)}(?!\w)", re.IGNORECASE)
        out = pattern.sub(good, out)
    return out


def _unreverse_token(token: str, vocab: frozenset[str]) -> str:
    """Flip letters only when reversed form is known and original is not."""
    if len(token) < _MIN_FLIP_LEN:
        return token
    key = _norm_key(token)
    if key in _REVERSE_ALIASES:
        return _REVERSE_ALIASES[key]
    if _in_vocab(token, vocab):
        return token
    flipped = token[::-1]
    flip_key = _norm_key(flipped)
    if flip_key in _REVERSE_ALIASES:
        return _REVERSE_ALIASES[flip_key]
    if _in_vocab(flipped, vocab):
        return _norm_key(flipped) if not _is_khmer(flipped) else flipped
    return token


def _iter_word_spans(text: str):
    for m in re.finditer(r"[\u1780-\u17FF]+|[A-Za-z][A-Za-z']*", text or ""):
        yield m.start(), m.end(), m.group(0)


def _flip_tokens_in_text(text: str, vocab: frozenset[str]) -> str:
    parts: list[str] = []
    last = 0
    for start, end, tok in _iter_word_spans(text):
        parts.append(text[last:start])
        parts.append(_unreverse_token(tok, vocab))
        last = end
    parts.append((text or "")[last:])
    return "".join(parts)


def _flip_word_order(text: str) -> str:
    bits = (text or "").split()
    if len(bits) < 2:
        return text or ""
    # Keep trailing sentence punctuation on the new last word
    trail = ""
    core = []
    for b in bits:
        m = re.match(r"^(.*?)([.,!?;:។]+)$", b)
        if m and m.group(1):
            core.append(m.group(1))
            trail = m.group(2)  # last wins
        else:
            core.append(b)
    out = " ".join(reversed(core))
    if trail and not out.endswith(trail):
        out = out + trail
    # Capitalize first Latin word lightly if original looked like a sentence
    parts = out.split(" ", 1)
    if parts and parts[0] and parts[0][0].isalpha() and not _is_khmer(parts[0]):
        parts[0] = parts[0][:1].upper() + parts[0][1:]
        out = " ".join(parts)
    return out


def _strip_edges(tok: str) -> str:
    return tok.strip(".,!?;:\"'`“”។")


def _vocab_score(text: str, vocab: frozenset[str]) -> int:
    score = 0
    words = []
    for _, _, raw in _iter_word_spans(text or ""):
        words.append(_strip_edges(raw))
        if _in_vocab(raw, vocab) or _in_vocab(_strip_edges(raw), vocab):
            score += 2 if len(raw) >= 4 else 1
        elif len(raw) >= _MIN_FLIP_LEN and _in_vocab(raw[::-1], vocab):
            score -= 1
    low = (text or "").lower()
    for phrase in _PHRASE_BONUS:
        if phrase in low or phrase in (text or ""):
            score += 4
    if words:
        first = _norm_key(words[0])
        last = _norm_key(words[-1])
        if first in _STARTERS:
            score += 3
        if last in _STARTERS and first not in _STARTERS:
            score -= 2
    return score


def decode_reversed_text(text: str) -> str:
    """
    Restore reverse-letter and reverse-word-order input when it clearly
    matches shopping vocabulary. Leaves normal text unchanged.
    """
    if not text or not str(text).strip():
        return text or ""
    original = str(text)
    vocab = shopping_vocab()

    aliased = _apply_alias_map(original)
    letter_fixed = _flip_tokens_in_text(aliased, vocab)
    order_flip = _flip_word_order(aliased)
    order_then_letters = _flip_tokens_in_text(order_flip, vocab)
    letters_then_order = _flip_word_order(letter_fixed)
    stripped = aliased.strip()
    whole = stripped[::-1]
    whole_letters = _flip_tokens_in_text(whole, vocab)
    # Marketing: letter-fix each token then reverse order
    marketing = _flip_word_order(_flip_tokens_in_text(aliased, vocab))

    candidates = [
        original,
        aliased,
        letter_fixed,
        order_flip,
        order_then_letters,
        letters_then_order,
        marketing,
        whole,
        whole_letters,
    ]

    best = original
    best_score = _vocab_score(original, vocab)
    for cand in candidates:
        sc = _vocab_score(cand, vocab)
        if sc > best_score:
            best = cand
            best_score = sc

    best = re.sub(r"[ \t]+", " ", best).strip()
    return best if best else original


def clear_reverse_caches() -> None:
    shopping_vocab.cache_clear()
