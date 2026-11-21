"""Men's product taxonomy: types, aliases/typos, wear-when, soft-sell misses.
Also loads colors / brands / categories from men_catalog_reference.json.
"""
from __future__ import annotations

import re
from functools import lru_cache

import config
from services.store import load_json_file

TAXONOMY_FILE = config.BASE_DIR / "data" / "men_product_taxonomy.json"
REFERENCE_FILE = config.BASE_DIR / "data" / "men_catalog_reference.json"


@lru_cache(maxsize=1)
def load_taxonomy() -> dict:
    data = load_json_file(TAXONOMY_FILE, {})
    return data if isinstance(data, dict) else {}


@lru_cache(maxsize=1)
def load_reference() -> dict:
    data = load_json_file(REFERENCE_FILE, {})
    return data if isinstance(data, dict) else {}


def _first_khmer_label(*parts) -> str | None:
    """Pick a Khmer display label from aliases / group labels."""
    for part in parts:
        if isinstance(part, (list, tuple)):
            found = _first_khmer_label(*part)
            if found:
                return found
            continue
        s = str(part or "").strip()
        if not s or not re.search(r"[\u1780-\u17FF]", s):
            continue
        head = s.split("/")[0].strip()
        return head if re.search(r"[\u1780-\u17FF]", head) else s
    return None


def _term_hit(term: str, cleaned: str) -> bool:
    term = (term or "").lower().strip()
    if not term or not cleaned:
        return False
    if re.search(r"[\u1780-\u17FF]", term):
        if term == "អាវ":
            # «អាវនេះ» is demonstrative — not a fresh tops browse
            if "អាវនេះ" in cleaned and "អាវយឺត" not in cleaned and "អាវក្រៅ" not in cleaned:
                stripped = cleaned.replace("អាវនេះ", " ")
                return "អាវ" in stripped
            return "អាវ" in cleaned
        return term in cleaned
    if " " in term or "-" in term:
        return term in cleaned
    return re.search(rf"(?<!\w){re.escape(term)}(?!\w)", cleaned) is not None


def apply_taxonomy_typos(text: str) -> str:
    """Normalize reverse/incorrect spellings from taxonomy typo map."""
    data = load_taxonomy()
    typos = data.get("typo_aliases") or {}
    out = text or ""
    for bad, good in sorted(typos.items(), key=lambda kv: len(kv[0]), reverse=True):
        if re.search(r"[\u1780-\u17FF]", bad):
            out = re.sub(re.escape(bad), good, out, flags=re.IGNORECASE)
        else:
            out = re.sub(
                rf"(?<!\w){re.escape(bad)}(?!\w)",
                good,
                out,
                flags=re.IGNORECASE,
            )
    return out


def detect_color_keys(text: str) -> list[str]:
    """Return canonical color ids found in text (longest alias first)."""
    cleaned = apply_taxonomy_typos((text or "").lower())
    cleaned = cleaned.replace("ពណ័", "ពណ៌").replace("ពណ៍", "ពណ៌").replace("សរ", "ស")
    found: list[str] = []
    colors = list(load_reference().get("colors") or [])
    scored = []
    for color in colors:
        cid = color.get("id")
        for alias in color.get("aliases") or []:
            a = (alias or "").lower().strip()
            if a:
                scored.append((len(a), a, cid))
    scored.sort(key=lambda x: -x[0])
    for _n, alias, cid in scored:
        if cid in found:
            continue
        if " " in alias or "-" in alias:
            if alias not in cleaned:
                continue
        elif not _term_hit(alias, cleaned):
            continue
        found.append(cid)
    if "white" not in found:
        # Require real «white» cues — never treat ស in ស្អាត (ស+\u17d2) as white.
        if re.search(
            r"ពណ៌ស|មានស(?:អត់|ទេ)|"
            r"(?:ខោ|អាវយឺត|អាវក្រៅ|មួក|hoodie|jacket|pants|shirt|tee)ស(?!\u17d2)|"
            r"(?<![ក-ឳ])អាវស(?!\u17d2)|"
            r"(?<![ក-ឳ])ស(?:អត់|ទេ)(?!\u17d2)",
            cleaned,
        ):
            found.append("white")
    return found


def color_display(color_id: str, lang: str = "en") -> str:
    for color in load_reference().get("colors") or []:
        if color.get("id") == color_id:
            if lang == "en":
                return (color.get("aliases") or [color_id])[0]
            return color.get("label_km") or color_id
    return color_id.replace("_", " ")


def related_color_ids(color_id: str) -> tuple[str, ...]:
    for color in load_reference().get("colors") or []:
        if color.get("id") == color_id:
            rel = color.get("related") or [color_id]
            return tuple(rel)
    return (color_id,)


def color_search_tokens(color_ids: list[str]) -> list[str]:
    """Tokens to match against product/lot color blobs."""
    tokens: list[str] = []
    ref = {c["id"]: c for c in (load_reference().get("colors") or []) if c.get("id")}
    for cid in color_ids or []:
        for rid in related_color_ids(cid):
            color = ref.get(rid) or {"aliases": [rid]}
            for a in color.get("aliases") or [rid]:
                t = (a or "").lower().strip()
                if t and t not in tokens:
                    tokens.append(t)
            rid_token = rid.replace("_", " ")
            if rid_token not in tokens:
                tokens.append(rid_token)
    return tokens


def detect_brand_name(text: str) -> str | None:
    found = detect_all_brand_names(text)
    return found[0] if found else None


def detect_all_brand_names(text: str) -> list[str]:
    """All brand names mentioned (longest-alias first, de-duplicated, order by text)."""
    cleaned = apply_taxonomy_typos((text or "").lower())
    brands = list(load_reference().get("brands") or [])
    candidates = []
    for brand in brands:
        name = brand.get("name")
        for alias in brand.get("aliases") or []:
            a = (alias or "").lower().strip()
            if a:
                candidates.append((len(a), a, name))
    candidates.sort(key=lambda x: -x[0])
    found: list[str] = []
    positions: dict[str, int] = {}
    for _n, alias, name in candidates:
        if name in found:
            continue
        hit = False
        pos = -1
        if alias.endswith(" ") and (alias in f" {cleaned} " or cleaned.startswith(alias.strip())):
            hit = True
            pos = cleaned.find(alias.strip())
        elif _term_hit(alias, cleaned) or (
            (" " in alias or "&" in alias or "-" in alias) and alias in cleaned
        ):
            hit = True
            pos = cleaned.find(alias)
        if hit:
            found.append(name)
            positions[name] = pos if pos >= 0 else 9999
    found.sort(key=lambda n: positions.get(n, 9999))
    return found


def match_catalog_category(text: str) -> dict | None:
    """Match one of the 30 men's catalog categories."""
    cleaned = apply_taxonomy_typos((text or "").lower())
    best = None
    best_score = 0
    for cat in load_reference().get("categories") or []:
        for alias in cat.get("aliases") or []:
            a = (alias or "").lower().strip()
            if not a:
                continue
            if _term_hit(a, cleaned) or ((" " in a or "-" in a) and a in cleaned):
                score = 10 + len(a)
                if score > best_score:
                    best_score = score
                    best = cat
    if not best:
        return None
    km = _first_khmer_label(best.get("aliases"), best.get("name_en"))
    return {
        "id": f"cat_{best.get('id')}",
        "group": best.get("name_en"),
        "name_en": best.get("name_en"),
        "alias": None,
        "label_en": best.get("name_en"),
        "label_km": km or best.get("name_en"),
        "search_terms": tuple(best.get("search_terms") or best.get("aliases") or []),
        "wear_en": "",
        "wear_km": "",
        "occasions": [],
    }


def match_product_type(text: str) -> dict | None:
    """Best product-type hit: taxonomy product → catalog category → group."""
    data = load_taxonomy()
    cleaned = apply_taxonomy_typos((text or "").lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return None

    best = None
    best_score = 0
    for product in data.get("products") or []:
        aliases = list(product.get("aliases") or [])
        aliases.append(product.get("name_en") or "")
        score = 0
        hit_alias = None
        for alias in aliases:
            a = (alias or "").lower().strip()
            if not a:
                continue
            if _term_hit(a, cleaned) or ((" " in a or "-" in a) and a in cleaned):
                score = max(score, 10 + len(a))
                hit_alias = a
        if score > best_score:
            best_score = score
            group = (data.get("groups") or {}).get(product.get("group") or "", {})
            km = (
                product.get("label_km")
                or _first_khmer_label(aliases, group.get("label_km"), group.get("search_terms"))
                or group.get("label_km")
            )
            best = {
                "id": product.get("id"),
                "group": product.get("group"),
                "name_en": product.get("name_en"),
                "alias": hit_alias,
                # Prefer specific product name (Jeans) over broad group (pants / joggers)
                "label_en": product.get("name_en") or group.get("label_en"),
                "label_km": km or product.get("name_en") or group.get("label_km"),
                "search_terms": tuple(
                    product.get("search_terms")
                    or group.get("search_terms")
                    or aliases[:3]
                ),
                "wear_en": product.get("wear_en") or "",
                "wear_km": product.get("wear_km") or "",
                "occasions": list(product.get("occasions") or []),
            }

    if best:
        return best

    cat = match_catalog_category(cleaned)
    if cat:
        return cat

    for gid, group in (data.get("groups") or {}).items():
        terms = list(group.get("search_terms") or [])
        label_en = (group.get("label_en") or "").lower()
        if any(_term_hit(t, cleaned) for t in terms) or (
            label_en and label_en.split("/")[0].strip() in cleaned
        ):
            return {
                "id": gid,
                "group": gid,
                "name_en": group.get("label_en"),
                "alias": None,
                "label_en": group.get("label_en"),
                "label_km": group.get("label_km"),
                "search_terms": tuple(terms),
                "wear_en": "",
                "wear_km": "",
                "occasions": [],
            }
    return None


def asks_wear_when(text: str) -> bool:
    cleaned = apply_taxonomy_typos((text or "").lower())
    markers = load_taxonomy().get("wear_when_markers") or {}
    for lang_keys in markers.values():
        if any(m in cleaned for m in lang_keys):
            return True
    if "ពាក់" in cleaned and ("ណា" in cleaned or "ពេល" in cleaned):
        return True
    return False


def wear_when_answer(text: str, lang: str = "km") -> str | None:
    if not asks_wear_when(text) and not match_product_type(text):
        return None
    product = match_product_type(text)
    if asks_wear_when(text) and not product:
        if lang == "en":
            return (
                "Happy to style it for you 🙂 Which piece — jeans, polo, jacket, sneakers, "
                "or a bag? Tell me the item and I’ll say when it looks best (office / date / gym / casual)."
            )
        return (
            "រីករាយណែនាំ 🙂 ចង់សួរពាក់ពេលណាសម្រាប់មុខណា — jeans · polo · អាវក្រៅ · sneakers · កាបូប? "
            "ប្រាប់មុខទំនិញ ខ្ញុំប្រាប់ឱកាសសម (ការិយាល័យ / ណាត់ / gym / casual)។"
        )
    if not product or not asks_wear_when(text):
        return None

    name = product.get("name_en") or product.get("label_en") or "this piece"
    tip = product.get("wear_en") if lang == "en" else product.get("wear_km")
    if not tip:
        tip = (
            "Everyday men’s looks — tell me office / date / gym / beach and I’ll narrow it."
            if lang == "en"
            else "សម្លៀកបំពាក់បុរសប្រចាំថ្ងៃ — ប្រាប់ការិយាល័យ / ណាត់ / gym / ឆ្នេរ ខ្ញុំជ្រើសឱ្យ។"
        )
    if lang == "en":
        return (
            f"**{name}** — best worn: {tip}\n"
            "Want me to pick 2 live options on /search? Tell me your size or budget — "
            "I’ll make it easy to add to cart."
        )
    return (
        f"**{name}** — ពាក់ល្អ៖ {tip}\n"
        "ចង់ឱ្យខ្ញុំរើស ២ មុខពី /search? ប្រាប់ទំហំ ឬថវិកា — "
        "ខ្ញុំជួយឱ្យងាយបញ្ចូលកន្ត្រក។"
    )


def soft_sell_miss(
    wanted: str,
    *,
    lang: str = "km",
    alternatives: list | None = None,
    size_note: str = "",
    wear_tip: str = "",
    related_colors: list | None = None,
) -> str:
    """Honest miss + warm similar recommend — consultative, never pushy."""
    label = wanted or ("that style" if lang == "en" else "ម៉ូដនោះ")
    lines: list[str] = []
    if lang == "en":
        lines.append(
            f"Unfortunately, **{label}** isn’t available right now — "
            "but here are close styles that could work for you."
        )
        if related_colors:
            shades = ", ".join(related_colors[:5])
            lines.append(
                f"For a similar vibe, you might like **{shades}**."
            )
        if wear_tip:
            lines.append(wear_tip)
        if alternatives:
            lines.append("Is this style close to what you are looking for?")
            lines.extend(alternatives[:3])
            lines.append(
                "I can compare options for you — or may I know your preferred **size**? 😊"
            )
        else:
            lines.append(
                "What are you looking for today — **pants, shirt, jacket, shoes, or bag**? 😊"
            )
        if size_note:
            lines.append(size_note.strip())
    else:
        lines.append(
            f"សូមអភ័យទោស — បច្ចុប្បន្ន **{label}** មិនមានទេ ប៉ុន្តែ "
            "មានម៉ូដស្រដៀងដែលអាចសមនឹងអ្នក។"
        )
        if related_colors:
            shades = ", ".join(related_colors[:5])
            lines.append(
                f"សម្រាប់រូបរាងស្រដៀង អាចសាក **{shades}**។"
            )
        if wear_tip:
            lines.append(wear_tip)
        if alternatives:
            lines.append("តើស្ទីលទាំងនេះជាអ្វីដែលអ្នកកំពុងស្វែងរកទេ? 😊")
            lines.extend(alternatives[:3])
            lines.append(
                "ខ្ញុំអាចប្រៀបធៀបឱ្យ — ឬអាចប្រាប់ **ទំហំ** ដែលអ្នកចូលចិត្តបានទេ?"
            )
        else:
            lines.append(
                "ថ្ងៃនេះតើអ្នកកំពុងស្វែងរកអ្វីដែរ — **ខោ · អាវ · អាវក្រៅ · ស្បែកជើង · កាបូប**? 😊"
            )
        if size_note:
            lines.append(size_note.strip())
    return "\n".join(lines)


def category_tuple_from_match(match: dict) -> tuple:
    return (
        match.get("label_km") or match.get("name_en") or "ទំនិញ",
        match.get("label_en") or match.get("name_en") or "styles",
        tuple(match.get("search_terms") or ()),
    )
